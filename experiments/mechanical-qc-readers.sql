-- Fixture ONLY. Load after mechanical-qc-persistence.sql. Never expose context.
create function public.zukait_mechanical_qc_read(p_actor text,p_session_hash text,p_kind text,p_entity uuid default null,p_request uuid default null)
returns jsonb language plpgsql security invoker set search_path=pg_catalog as $$
declare cfg zukait_mechanical.settings; operation text; policy jsonb; prior zukait_mechanical.receipts;
 revision bigint; ws_revision bigint; ws jsonb; jc text; checklists jsonb; tasks jsonb; links jsonb;
 assignments jsonb; sessions jsonb; users jsonb; jobs jsonb; approval jsonb;
begin
 select * into cfg from zukait_mechanical.settings where singleton;
 select value into operation from jsonb_array_elements_text(case when jsonb_typeof(cfg.capabilities->p_actor)='array' then cfg.capabilities->p_actor else '[]'::jsonb end)
 where value in ('MC_CREATE','TASK_CREATE','TASK_ASSIGN','TASK_HANDOVER','MECHANICAL_QC') limit 1;
 policy:=zukait_mechanical.authorize_session(p_actor,p_session_hash,operation);
 if not cfg.qc_enabled then raise exception 'mechanical_qc_disabled';end if;
 policy:=policy||jsonb_build_object('mechanicalDeliveryEnabled',coalesce((to_jsonb(cfg)->>'delivery_enabled')::boolean,false),'qc',jsonb_build_object('mechanicalApproverId','SUP003','mechanicalOnlyMode','SOLE_MECHANICAL_APPROVER','mixedPaintingApproverId','SUP002','mixedFinalApproverId','SUP001','mixedMechanicalRequired',cfg.mixed_mechanical_qc_required));
 if p_kind='policy' then return policy;end if;
 if p_kind='receipt' then
  if p_request is null then raise exception 'invalid_mechanical_command';end if;
  perform zukait_mechanical.authorize_session(p_actor,p_session_hash,'MECHANICAL_QC');
  if p_actor<>'SUP003' then raise exception 'mechanical_qc_approver_required';end if;
  select * into prior from zukait_mechanical.receipts where request_id=p_request;
  if not found then return 'null'::jsonb;end if;
  if prior.actor_id<>p_actor then raise exception 'mechanical_request_reused';end if;
  return jsonb_build_object('actorId',prior.actor_id,'fingerprint',prior.fingerprint,'result',prior.result);
 end if;
 if p_kind is distinct from 'context' or p_entity is null then raise exception 'invalid_mechanical_command';end if;
 -- Capture both revisions with the workshop in one statement snapshot.
 -- Control is read first as in writers, but no row locks/writes on this path.
 select c.revision,w.revision,w.data into revision,ws_revision,ws from zukait_mechanical.control c cross join public.workshop_state w where c.singleton and w.id='main';
 if ws_revision is null then raise exception 'workshop_missing';end if;
 -- Each following statement may observe concurrent normalized writes. The
 -- ending revision check rejects that result; commands still use locked CAS.
 select c.job_card,jsonb_build_array(jsonb_build_object('id',c.id,'number',c.number,'manualJobCard',jsonb_build_object('number',c.job_card,'date',c.manual_jc_date))) into jc,checklists from zukait_mechanical.checklists c where c.id=p_entity;
 if jc is null then raise exception 'mechanical_checklist_missing';end if;
 select coalesce(jsonb_agg(jsonb_build_object('id',t.id,'checklistId',t.checklist_id,'title',t.title)),'[]') into tasks from (select * from zukait_mechanical.tasks where checklist_id=p_entity order by id limit 101) t;
 select coalesce(jsonb_agg(jsonb_build_object('taskId',l.task_id,'assignmentId',l.assignment_id,'employeeId',l.employee_id)||case when l.successor_id is null then '{}'::jsonb else jsonb_build_object('handedOverTo',l.successor_id) end),'[]') into links
 from (select l.* from zukait_mechanical.links l join zukait_mechanical.tasks t on t.id=l.task_id where t.checklist_id=p_entity order by l.assignment_id limit 501) l;
 select coalesce(jsonb_agg(jsonb_build_object('id',a->'id','job',a->'job','emp',a->'emp','completed',a->'completed','completedAt',a->'completedAt','cancelled',a->'cancelled','rework',a->'rework','mechanicalTaskId',a->'mechanicalTaskId','mechanicalChecklistId',a->'mechanicalChecklistId','handedOverToAssignmentId',a->'handedOverToAssignmentId')),'[]') into assignments from (select a from jsonb_array_elements(coalesce(ws->'assign','[]')) a where upper(trim(a->>'job'))=upper(trim(jc)) limit 501) a;
 select coalesce(jsonb_agg(jsonb_build_object('id',s->'id','job',s->'job','emp',s->'emp','assignmentId',s->'assignmentId','start',s->'start','end',s->'end','paused',s->'paused','cancelled',s->'cancelled','voided',s->'voided','deleted',s->'deleted')),'[]') into sessions
 from (select s from jsonb_array_elements(coalesce(ws->'sessions','[]')) s where upper(trim(s->>'job'))=upper(trim(jc)) limit 10001) s;
 if jsonb_array_length(tasks)>100 or jsonb_array_length(links)>500 or jsonb_array_length(assignments)>500 or jsonb_array_length(sessions)>10000 then raise exception 'mechanical_context_limit';end if;
 -- Departments come from trusted credentials, not client-editable user JSON.
 select coalesce(jsonb_agg(jsonb_build_object('id',c.user_id,'department',c.department)),'[]') into users from public.staff_credentials c where c.user_id in (select a->>'emp' from jsonb_array_elements(assignments) a);
 select coalesce(jsonb_agg(jsonb_build_object('no',j->'no','receptionNo',j->'receptionNo','status',j->'status','delivered',j->'delivered','cancelled',j->'cancelled','deleted',j->'deleted','archived',j->'archived','qcWorkflow',j->'qcWorkflow')),'[]') into jobs from jsonb_array_elements(coalesce(ws->'jobs','[]')) j where upper(trim(j->>'no'))=upper(trim(jc));
 if jsonb_array_length(jobs)<>1 then raise exception 'mechanical_qc_scope_review';end if;
 select jsonb_build_object('requestId',e.request_id,'by',e.actor_id,'result',e.result,'workFingerprint',e.work_fingerprint) into approval from zukait_mechanical.qc_events e where e.checklist_id=p_entity order by e.records_revision desc limit 1;
 if revision is distinct from (select c.revision from zukait_mechanical.control c where c.singleton) or ws_revision is distinct from (select w.revision from public.workshop_state w where w.id='main') then raise exception 'mechanical_revision_conflict';end if;
 return jsonb_build_object('policy',policy,'records',jsonb_build_object('revision',revision,'checklists',checklists,'tasks',tasks,'links',links,'receipts','[]'::jsonb,'audit','[]'::jsonb),
  'snapshot',jsonb_build_object('revision',ws_revision,'data',jsonb_build_object('users',users,'jobs',jobs,'assign',assignments,'sessions',sessions)),'approval',approval);
end $$;
revoke all on function public.zukait_mechanical_qc_read(text,text,text,uuid,uuid) from public,anon,authenticated;
grant execute on function public.zukait_mechanical_qc_read(text,text,text,uuid,uuid) to service_role;
