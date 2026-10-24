-- Disposable fixture candidate only; no generated/applied production migration.
alter table zukait_mechanical.settings add column documents_enabled boolean not null default false;
alter table zukait_mechanical.settings add column document_readers jsonb not null default '{}' check(jsonb_typeof(document_readers)='object');
create function public.zukait_mechanical_document_read(p_actor text,p_session_hash text,p_kind text,p_entity uuid default null,p_expected_records bigint default null,p_expected_workshop bigint default null)
returns jsonb language plpgsql security invoker set search_path=pg_catalog as $$
declare cfg zukait_mechanical.settings; staff_role text; ctl bigint; rev bigint; ws jsonb; c zukait_mechanical.checklists;
 tasks jsonb; links jsonb; assignments jsonb; people jsonb; jobs jsonb; policy jsonb;
begin
 select * into cfg from zukait_mechanical.settings where singleton;
 if not coalesce(cfg.enabled and cfg.documents_enabled,false) then raise exception 'mechanical_documents_disabled';end if;
 if p_session_hash is null or p_session_hash !~ '^[0-9a-f]{64}$' then raise exception 'mechanical_invalid_session';end if;
 select role into staff_role from public.staff_credentials where user_id=p_actor and active for share;
 if staff_role is null or staff_role not in('Manager','Supervisor') then raise exception 'mechanical_document_forbidden';end if;
 perform 1 from public.staff_sessions where token_hash=p_session_hash and user_id=p_actor and revoked_at is null for share;
 if not found then raise exception 'mechanical_invalid_session';end if;
 if jsonb_typeof(cfg.document_readers->p_actor) is distinct from 'array' or not coalesce((cfg.document_readers->p_actor)?'UNPRICED',false) then raise exception 'mechanical_document_forbidden';end if;
 policy:=jsonb_build_object('documentsEnabled',true,'documentReaders',jsonb_build_object(p_actor,cfg.document_readers->p_actor));
 if p_kind='policy' then return policy;end if;
 if p_kind not in('context','verify') or p_entity is null or p_expected_records is null or p_expected_workshop is null or p_expected_records not between 0 and 9007199254740991 or p_expected_workshop not between 0 and 9007199254740991 then raise exception 'invalid_document_request';end if;
 -- Same lock order as commands; prevents a torn print snapshot. Locks only;
 -- this reader does not update state, history, audit, receipt or session rows.
 select revision into ctl from zukait_mechanical.control where singleton for share;
 select revision,data into rev,ws from public.workshop_state where id='main' for share;
 if ctl is distinct from p_expected_records or rev is distinct from p_expected_workshop then raise exception 'mechanical_document_changed';end if;
 select * into c from zukait_mechanical.checklists where id=p_entity;
 if not found then raise exception 'mechanical_checklist_missing';end if;
 if p_kind='verify' then return jsonb_build_object('ok',true,'checklistId',p_entity,'recordsRevision',ctl,'workshopRevision',rev);end if;
 select coalesce(jsonb_agg(jsonb_build_object('id',id,'checklistId',checklist_id,'title',title) order by created_at,id),'[]') into tasks from(select * from zukait_mechanical.tasks where checklist_id=p_entity order by created_at,id limit 101) t;
 if jsonb_array_length(tasks)>100 then raise exception 'mechanical_document_limit';end if;
 select coalesce(jsonb_agg(jsonb_build_object('taskId',l.task_id,'assignmentId',l.assignment_id,'employeeId',l.employee_id)||case when l.successor_id is null then '{}'::jsonb else jsonb_build_object('handedOverTo',l.successor_id) end order by l.created_at,l.assignment_id),'[]') into links from(select l.* from zukait_mechanical.links l join zukait_mechanical.tasks t on t.id=l.task_id where t.checklist_id=p_entity order by l.created_at,l.assignment_id limit 501) l;
 if jsonb_array_length(links)>500 then raise exception 'mechanical_document_limit';end if;
 select coalesce(jsonb_agg(jsonb_build_object('id',a->'id','job',a->'job','emp',a->'emp','mechanicalTaskId',a->'mechanicalTaskId','mechanicalChecklistId',a->'mechanicalChecklistId','suggested',a->'suggested','completed',a->'completed','cancelled',a->'cancelled','rework',a->'rework')),'[]') into assignments from jsonb_array_elements(coalesce(ws->'assign','[]')) a where a->>'id' in(select l->>'assignmentId' from jsonb_array_elements(links) l);
 if jsonb_array_length(assignments)>500 then raise exception 'mechanical_document_limit';end if;
 select coalesce(jsonb_agg(jsonb_build_object('id',user_id,'name',display_name)),'[]') into people from public.staff_credentials where user_id in(select l->>'employeeId' from jsonb_array_elements(links) l);
 select coalesce(jsonb_agg(jsonb_build_object('no',j->'no')),'[]') into jobs from jsonb_array_elements(coalesce(ws->'jobs','[]')) j where upper(trim(j->>'no'))=upper(trim(c.job_card));
 return jsonb_build_object('records',jsonb_build_object('revision',ctl,'checklists',jsonb_build_array(jsonb_build_object('id',c.id,'number',c.number,'manualJobCard',jsonb_build_object('number',c.job_card,'date',c.manual_jc_date))),'tasks',tasks,'links',links),
 'snapshot',jsonb_build_object('revision',rev,'data',jsonb_build_object('jobs',jobs,'assign',assignments,'users',people)));
end $$;
revoke all on function public.zukait_mechanical_document_read(text,text,text,uuid,bigint,bigint) from public,anon,authenticated;
grant execute on function public.zukait_mechanical_document_read(text,text,text,uuid,bigint,bigint) to service_role;
