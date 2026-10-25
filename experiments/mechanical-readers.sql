-- Server-only scoped readers. Load after mechanical-persistence.sql in fixtures.
-- Not a generated/applied migration; never return context snapshots to clients.
create function public.zukait_mechanical_read(p_actor text,p_session_hash text,p_operation text,p_kind text,p_request uuid default null,p_entity uuid default null,p_payload jsonb default '{}')
returns jsonb language plpgsql security invoker set search_path=pg_catalog as $$
<<scope>>
declare policy jsonb; prior zukait_mechanical.receipts; ctl zukait_mechanical.control;
 records jsonb; snapshot jsonb; checklist_id uuid; checklists jsonb; tasks jsonb; links jsonb;
begin
 policy:=zukait_mechanical.authorize_session(p_actor,p_session_hash,p_operation);
 if p_operation not in ('MC_CREATE','TASK_CREATE','TASK_ASSIGN','TASK_HANDOVER','TASK_REPEAT') then raise exception 'mechanical_operation_not_implemented';end if;
 if p_kind='policy' then return policy;end if;
 if p_kind='receipt' then
  if p_request is null then raise exception 'invalid_mechanical_command';end if;
  select * into prior from zukait_mechanical.receipts where request_id=p_request;
  if not found then return 'null'::jsonb;end if;
  if prior.actor_id<>p_actor then raise exception 'mechanical_request_reused';end if;
  return jsonb_build_object('actorId',prior.actor_id,'fingerprint',prior.fingerprint,'result',prior.result);
 end if;
 if p_kind is distinct from 'context' or p_entity is null or jsonb_typeof(p_payload) is distinct from 'object' or octet_length(p_payload::text)>8192 then raise exception 'invalid_mechanical_command';end if;
 if p_operation='TASK_CREATE' then
  if coalesce(p_payload->>'checklistId','') !~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' then raise exception 'invalid_mechanical_command';end if;
  checklist_id:=(p_payload->>'checklistId')::uuid;
 elsif p_operation in ('TASK_ASSIGN','TASK_HANDOVER','TASK_REPEAT') then
  select t.checklist_id into checklist_id from zukait_mechanical.tasks t where id=p_entity;
 end if;
 select coalesce(jsonb_agg(jsonb_build_object('id',c.id,'number',c.number,'manualJobCard',jsonb_build_object('number',c.job_card,'date',c.manual_jc_date))),'[]') into checklists
 from zukait_mechanical.checklists c where c.id=checklist_id or (p_operation='MC_CREATE' and (c.id=p_entity or c.job_card=p_payload->'manualJobCard'->>'number'));
 select coalesce(jsonb_agg(jsonb_build_object('id',t.id,'checklistId',t.checklist_id,'title',t.title)),'[]') into tasks from zukait_mechanical.tasks t where t.id=p_entity or (p_operation='TASK_REPEAT' and t.checklist_id=scope.checklist_id);
 select coalesce(jsonb_agg(jsonb_build_object('taskId',l.task_id,'assignmentId',l.assignment_id,'employeeId',l.employee_id)||case when l.successor_id is null then '{}'::jsonb else jsonb_build_object('handedOverTo',l.successor_id) end),'[]') into links
 from (select * from zukait_mechanical.links where task_id=p_entity or (p_operation='TASK_REPEAT' and task_id in(select rt.id from zukait_mechanical.tasks rt where rt.checklist_id=scope.checklist_id)) order by assignment_id limit 501) l;
 if jsonb_array_length(links)>500 then raise exception 'mechanical_context_limit';end if;
 select * into ctl from zukait_mechanical.control where singleton;
 if p_operation in ('MC_CREATE','TASK_CREATE') then
  -- Metadata commands need only the selected JC's active flags. Never carry
  -- all employee history through an internal RPC to register a title/date.
  select jsonb_build_object('revision',w.revision,'data',jsonb_build_object('users','[]'::jsonb,'assign','[]'::jsonb,'sessions','[]'::jsonb,
    'jobs',coalesce((select jsonb_agg(jsonb_build_object('no',j->>'no','delivered',j->'delivered','cancelled',j->'cancelled','archived',j->'archived','deleted',j->'deleted'))
      from jsonb_array_elements(coalesce(w.data->'jobs','[]')) j where j->>'no'=case when p_operation='MC_CREATE' then p_payload->'manualJobCard'->>'number'
      else (select c.job_card from zukait_mechanical.checklists c where c.id=checklist_id) end),'[]'::jsonb))) into snapshot from public.workshop_state w where w.id='main';
 elsif p_operation='TASK_REPEAT' then
  select jsonb_build_object('revision',w.revision,'data',jsonb_build_object(
   'jobs',coalesce((select jsonb_agg(jsonb_build_object('no',j->'no','status',j->'status','delivered',j->'delivered','cancelled',j->'cancelled','archived',j->'archived','deleted',j->'deleted')) from jsonb_array_elements(coalesce(w.data->'jobs','[]')) j where j->>'no'=(select job_card from zukait_mechanical.checklists where id=scope.checklist_id)),'[]'),
   'assign',coalesce((select jsonb_agg(x.a) from (select a from jsonb_array_elements(coalesce(w.data->'assign','[]')) a where a->>'job'=(select job_card from zukait_mechanical.checklists where id=scope.checklist_id) limit 501) x),'[]'),
   'sessions',coalesce((select jsonb_agg(jsonb_build_object('id',x.s->'id','job',x.s->'job','end',x.s->'end','cancelled',x.s->'cancelled','voided',x.s->'voided','deleted',x.s->'deleted')) from (select s from jsonb_array_elements(coalesce(w.data->'sessions','[]')) s where s->>'job'=(select job_card from zukait_mechanical.checklists where id=scope.checklist_id) limit 10001) x),'[]'),
   'users',coalesce((select jsonb_agg(jsonb_build_object('id',user_id,'role',role,'active',active,'department',department)) from public.staff_credentials where role='Employee'),'[]'))) into snapshot from public.workshop_state w where w.id='main';
  if jsonb_array_length(snapshot->'data'->'assign')>500 or jsonb_array_length(snapshot->'data'->'sessions')>10000 or jsonb_array_length(tasks)>100 then raise exception 'mechanical_context_limit';end if;
 else
  select jsonb_build_object('revision',revision,'data',data) into snapshot from public.workshop_state where id='main';
 end if;
 if snapshot is null then raise exception 'workshop_missing';end if;
 records:=jsonb_build_object('revision',ctl.revision,'checklists',checklists,'tasks',tasks,'links',links,'receipts','[]'::jsonb,'audit','[]'::jsonb);
 return jsonb_build_object('records',records,'snapshot',snapshot,'nextSequence',ctl.next_sequence);
end $$;
revoke all on function public.zukait_mechanical_read(text,text,text,text,uuid,uuid,jsonb) from public,anon,authenticated;
grant execute on function public.zukait_mechanical_read(text,text,text,text,uuid,uuid,jsonb) to service_role;
