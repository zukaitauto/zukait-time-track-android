-- Read-only fixture candidate. One bounded current-state/metadata projection,
-- not per-row RPCs and never historical workshop_state_history JSON.
create function public.zukait_mechanical_qc_overview_read(p_actor text,p_session_hash text) returns jsonb language plpgsql security invoker set search_path=pg_catalog as $$
declare cfg zukait_mechanical.settings; staff_role text; revision bigint; ws_revision bigint; ws jsonb;
 jobs jsonb; job_keys jsonb; assignments jsonb; sessions jsonb; users jsonb; checklists jsonb; tasks jsonb; links jsonb; approvals jsonb; policy jsonb;
begin
 select * into cfg from zukait_mechanical.settings where singleton;
 if not coalesce(cfg.enabled and cfg.qc_enabled,false) then raise exception 'mechanical_qc_disabled';end if;
 if p_session_hash is null or p_session_hash !~ '^[0-9a-f]{64}$' then raise exception 'mechanical_invalid_session';end if;
 select role into staff_role from public.staff_credentials where user_id=p_actor and active for share;
 if staff_role is null or staff_role not in ('Supervisor','Manager') then raise exception 'mechanical_forbidden';end if;
 perform 1 from public.staff_sessions where token_hash=p_session_hash and user_id=p_actor and revoked_at is null for share;
 if not found then raise exception 'mechanical_invalid_session';end if;
 select c.revision,w.revision,w.data into revision,ws_revision,ws from zukait_mechanical.control c cross join public.workshop_state w where c.singleton and w.id='main';
 if ws_revision is null then raise exception 'workshop_missing';end if;
 select coalesce(jsonb_agg(jsonb_build_object('no',j->'no','vehicle',j->'vehicle','reg',j->'reg','status',j->'status','qcWorkflow',jsonb_build_object('fingerprint',j->'qcWorkflow'->'fingerprint','painting',j->'qcWorkflow'->'painting','final',j->'qcWorkflow'->'final'))),'[]') into jobs
 from (select j from jsonb_array_elements(coalesce(ws->'jobs','[]')) j where upper(trim(j->>'no'))<>'ID001' and not coalesce((j->>'delivered')::boolean,false) and not coalesce((j->>'cancelled')::boolean,false) and not coalesce((j->>'deleted')::boolean,false) and not coalesce((j->>'archived')::boolean,false) and upper(coalesce(j->>'status',''))<>'CANCELLED' limit 1001) j;
 if jsonb_array_length(jobs)>1000 then raise exception 'mechanical_overview_limit';end if;
 if exists(select 1 from jsonb_array_elements(jobs) j group by upper(trim(j->>'no')) having count(*)>1) then raise exception 'mechanical_qc_scope_review';end if;
 select coalesce(jsonb_object_agg(upper(trim(j->>'no')),true),'{}') into job_keys from jsonb_array_elements(jobs) j;
 select coalesce(jsonb_agg(jsonb_build_object('id',c.id,'manualJobCard',jsonb_build_object('number',c.job_card))),'[]') into checklists from (select * from zukait_mechanical.checklists where job_keys?upper(trim(job_card)) limit 1001) c;
 select coalesce(jsonb_agg(jsonb_build_object('id',t.id,'checklistId',t.checklist_id,'title',t.title)),'[]') into tasks from (select t.* from zukait_mechanical.tasks t join zukait_mechanical.checklists c on c.id=t.checklist_id where job_keys?upper(trim(c.job_card)) limit 5001) t;
 select coalesce(jsonb_agg(jsonb_build_object('assignmentId',l.assignment_id,'taskId',l.task_id,'employeeId',l.employee_id)||case when l.successor_id is null then '{}'::jsonb else jsonb_build_object('handedOverTo',l.successor_id) end),'[]') into links
 from (select l.* from zukait_mechanical.links l join zukait_mechanical.tasks t on t.id=l.task_id join zukait_mechanical.checklists c on c.id=t.checklist_id where job_keys?upper(trim(c.job_card)) limit 10001) l;
 select coalesce(jsonb_agg(jsonb_build_object('id',a->'id','job',a->'job','emp',a->'emp','completed',a->'completed','completedAt',a->'completedAt','cancelled',a->'cancelled','rework',a->'rework','mechanicalTaskId',a->'mechanicalTaskId','mechanicalChecklistId',a->'mechanicalChecklistId','handedOverToAssignmentId',a->'handedOverToAssignmentId')),'[]') into assignments
 from (select a from jsonb_array_elements(coalesce(ws->'assign','[]')) a where job_keys?upper(trim(a->>'job')) limit 10001) a;
 select coalesce(jsonb_agg(jsonb_build_object('id',s->'id','job',s->'job','emp',s->'emp','start',s->'start','end',s->'end','paused',s->'paused','cancelled',s->'cancelled','voided',s->'voided','deleted',s->'deleted')),'[]') into sessions
 from (select s from jsonb_array_elements(coalesce(ws->'sessions','[]')) s where job_keys?upper(trim(s->>'job')) limit 50001) s;
 if jsonb_array_length(checklists)>1000 or jsonb_array_length(tasks)>5000 or jsonb_array_length(links)>10000 or jsonb_array_length(assignments)>10000 or jsonb_array_length(sessions)>50000 then raise exception 'mechanical_overview_limit';end if;
 select coalesce(jsonb_agg(jsonb_build_object('id',user_id,'department',department)),'[]') into users from public.staff_credentials where user_id in (select a->>'emp' from jsonb_array_elements(assignments) a);
 select coalesce(jsonb_agg(jsonb_build_object('checklistId',c.id,'requestId',e.request_id,'by',e.actor_id,'result',e.result,'workFingerprint',e.work_fingerprint,'at',floor(extract(epoch from e.recorded_at)*1000))),'[]') into approvals
 from zukait_mechanical.checklists c join lateral (select * from zukait_mechanical.qc_events e where e.checklist_id=c.id order by records_revision desc limit 1) e on true where job_keys?upper(trim(c.job_card));
 policy:=jsonb_build_object('mechanicalDepartment',cfg.department,'mechanicalStaff',jsonb_build_object(p_actor,coalesce(cfg.capabilities->p_actor,'[]'::jsonb)),'qc',jsonb_build_object('mechanicalApproverId','SUP003','mechanicalOnlyMode','SOLE_MECHANICAL_APPROVER','mixedPaintingApproverId','SUP002','mixedFinalApproverId','SUP001','mixedMechanicalRequired',cfg.mixed_mechanical_qc_required));
 if revision is distinct from (select c.revision from zukait_mechanical.control c where c.singleton) or ws_revision is distinct from (select w.revision from public.workshop_state w where w.id='main') then raise exception 'mechanical_revision_conflict';end if;
 return jsonb_build_object('actor',jsonb_build_object('id',p_actor,'role',staff_role,'active',true),'policy',policy,'records',jsonb_build_object('revision',revision,'checklists',checklists,'tasks',tasks,'links',links),
 'snapshot',jsonb_build_object('revision',ws_revision,'data',jsonb_build_object('jobs',jobs,'assign',assignments,'sessions',sessions,'users',users)),'approvals',approvals);
end $$;
revoke all on function public.zukait_mechanical_qc_overview_read(text,text) from public,anon,authenticated;
grant execute on function public.zukait_mechanical_qc_overview_read(text,text) to service_role;
