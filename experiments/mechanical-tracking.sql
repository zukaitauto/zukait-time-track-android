-- Disposable fixture candidate ONLY. No generated/applied migration.
alter table zukait_mechanical.settings add column tracking_enabled boolean not null default false;
alter table zukait_mechanical.settings add column priority_values jsonb not null default '[]' check(jsonb_typeof(priority_values)='array');
alter table zukait_mechanical.settings add column hold_mode text default 'STATUS_ONLY' check(hold_mode is null or hold_mode='STATUS_ONLY');
create table zukait_mechanical.tracking (
 checklist_id uuid primary key references zukait_mechanical.checklists(id),priority text,promise_date date,waiting_for_parts boolean not null default false,
 updated_by text not null references public.staff_credentials(user_id),updated_at timestamptz not null default clock_timestamp()
);
alter table zukait_mechanical.tracking enable row level security;
revoke all on zukait_mechanical.tracking from public,anon,authenticated,service_role;
grant select,insert,update on zukait_mechanical.tracking to service_role;
create function zukait_mechanical.authorize_tracking(p_actor text,p_session_hash text,p_operation text) returns jsonb language plpgsql security invoker set search_path=pg_catalog as $$
declare cfg zukait_mechanical.settings; staff_role text;
begin
 select * into cfg from zukait_mechanical.settings where singleton;
 if not coalesce(cfg.enabled and cfg.tracking_enabled,false) then raise exception 'mechanical_tracking_disabled';end if;
 if p_session_hash is null or p_session_hash !~ '^[0-9a-f]{64}$' then raise exception 'mechanical_invalid_session';end if;
 select role into staff_role from public.staff_credentials where user_id=p_actor and active for share;
 if staff_role is null or staff_role not in ('Manager','Supervisor') then raise exception 'mechanical_forbidden';end if;
 perform 1 from public.staff_sessions where user_id=p_actor and token_hash=p_session_hash and revoked_at is null for share;
 if not found then raise exception 'mechanical_invalid_session';end if;
 if p_operation is not null and (p_operation not in ('PRIORITY_SET','PROMISE_SET','HOLD_SET') or jsonb_typeof(cfg.capabilities->p_actor) is distinct from 'array' or not coalesce((cfg.capabilities->p_actor)?p_operation,false)) then raise exception 'mechanical_forbidden';end if;
 return jsonb_build_object('flags',jsonb_build_object('mechanical',true),'trackingEnabled',true,'mechanicalStaff',jsonb_build_object(p_actor,coalesce(cfg.capabilities->p_actor,'[]')),'priorityValues',cfg.priority_values,'holdMode',cfg.hold_mode);
end $$;
revoke all on function zukait_mechanical.authorize_tracking(text,text,text) from public,anon,authenticated;
grant execute on function zukait_mechanical.authorize_tracking(text,text,text) to service_role;
create function public.zukait_mechanical_tracking_read(p_actor text,p_session_hash text,p_kind text,p_operation text default null,p_entity uuid default null,p_request uuid default null) returns jsonb language plpgsql security invoker set search_path=pg_catalog as $$
declare policy jsonb; ctl bigint; rev bigint; jc text; j jsonb; jobs jsonb; matches integer; row zukait_mechanical.tracking; prior zukait_mechanical.receipts; result jsonb;
begin
 policy:=zukait_mechanical.authorize_tracking(p_actor,p_session_hash,p_operation);
 if p_kind='policy' then return policy;end if;
 if p_kind='receipt' then
  if p_operation is null or p_request is null then raise exception 'invalid_mechanical_command';end if;
  select * into prior from zukait_mechanical.receipts where request_id=p_request;if not found then return 'null'::jsonb;end if;
  if prior.actor_id<>p_actor then raise exception 'mechanical_request_reused';end if;
  return jsonb_build_object('actorId',prior.actor_id,'fingerprint',prior.fingerprint,'result',prior.result);
 end if;
 if p_kind not in ('context','view') or p_entity is null then raise exception 'invalid_mechanical_command';end if;
 select revision into ctl from zukait_mechanical.control where singleton;
 select revision,data->'jobs' into rev,jobs from public.workshop_state where id='main';
 select job_card into jc from zukait_mechanical.checklists where id=p_entity;if jc is null then raise exception 'mechanical_checklist_missing';end if;
 select count(*),jsonb_agg(x)->0 into matches,j from jsonb_array_elements(coalesce(jobs,'[]')) x where upper(trim(x->>'no'))=upper(trim(jc));
 if matches<>1 then raise exception 'mechanical_qc_scope_review';end if;
 select * into row from zukait_mechanical.tracking where checklist_id=p_entity;
 result:=jsonb_build_object('ok',true,'checklistId',p_entity,'jobCard',jc,'recordsRevision',ctl,'workshopRevision',rev,
 'active',not(coalesce((j->>'delivered')::boolean,false) or coalesce((j->>'cancelled')::boolean,false) or coalesce((j->>'archived')::boolean,false) or coalesce((j->>'deleted')::boolean,false) or upper(coalesce(j->>'status',''))='CANCELLED'),
 'tracking',jsonb_build_object('priority',row.priority,'promiseDate',row.promise_date,'waitingForParts',coalesce(row.waiting_for_parts,false),'updatedBy',row.updated_by,'updatedAt',floor(extract(epoch from row.updated_at)*1000)));
 if ctl is distinct from (select revision from zukait_mechanical.control where singleton) or rev is distinct from (select revision from public.workshop_state where id='main') then raise exception 'mechanical_revision_conflict';end if;
 if p_kind='view' then result:=result||jsonb_build_object('capabilities',policy->'mechanicalStaff'->p_actor,'priorityValues',policy->'priorityValues','holdMode',policy->'holdMode');end if;
 return result;
end $$;
revoke all on function public.zukait_mechanical_tracking_read(text,text,text,text,uuid,uuid) from public,anon,authenticated;
grant execute on function public.zukait_mechanical_tracking_read(text,text,text,text,uuid,uuid) to service_role;
create function public.zukait_mechanical_tracking_commit(p_actor text,p_session_hash text,p_operation text,p_request uuid,p_fingerprint text,p_entity uuid,p_device text,p_expected_records bigint,p_expected_workshop bigint,p_payload jsonb) returns jsonb language plpgsql security invoker set search_path=pg_catalog as $$
declare policy jsonb; ctl bigint; rev bigint; jc text; j jsonb; matches integer; old zukait_mechanical.tracking; priority text; promised date; waiting boolean; reason text; before_value jsonb; after_value jsonb; result jsonb; prior zukait_mechanical.receipts;
begin
 policy:=zukait_mechanical.authorize_tracking(p_actor,p_session_hash,p_operation);
 if p_operation is null or p_request is null or p_entity is null or p_fingerprint is null or p_fingerprint !~ '^[0-9a-f]{64}$' or length(coalesce(p_device,'')) not between 1 and 128 or jsonb_typeof(p_payload) is distinct from 'object' or octet_length(p_payload::text)>2048 then raise exception 'invalid_tracking_change';end if;
 if jsonb_typeof(p_payload->'reason') is distinct from 'string' then raise exception 'invalid_tracking_change';end if;
 reason:=trim(p_payload->>'reason');if coalesce(length(reason),0)<1 or length(p_payload->>'reason')>500 then raise exception 'invalid_tracking_change';end if;
 select revision into ctl from zukait_mechanical.control where singleton for update;
 select * into prior from zukait_mechanical.receipts where request_id=p_request;
 if found then
  if prior.actor_id is distinct from p_actor or prior.fingerprint is distinct from p_fingerprint or prior.result->>'operation' is distinct from p_operation or prior.result->>'entityId' is distinct from p_entity::text then raise exception 'mechanical_request_reused';end if;
  return prior.result||'{"duplicate":true}'::jsonb;
 end if;
 if p_expected_records is null or ctl<>p_expected_records then raise exception 'mechanical_revision_conflict';end if;
 select revision into rev from public.workshop_state where id='main' for share;
 if p_expected_workshop is null or rev is null or rev<>p_expected_workshop then raise exception 'workshop_revision_conflict';end if;
 select job_card into jc from zukait_mechanical.checklists where id=p_entity;if jc is null then raise exception 'mechanical_checklist_missing';end if;
 select count(*),jsonb_agg(x)->0 into matches,j from public.workshop_state w cross join lateral jsonb_array_elements(coalesce(w.data->'jobs','[]')) x where w.id='main' and upper(trim(x->>'no'))=upper(trim(jc));
 if matches<>1 then raise exception 'mechanical_qc_scope_review';end if;
 if coalesce((j->>'delivered')::boolean,false) or coalesce((j->>'cancelled')::boolean,false) or coalesce((j->>'archived')::boolean,false) or coalesce((j->>'deleted')::boolean,false) or upper(coalesce(j->>'status',''))='CANCELLED' then raise exception 'checklist_inactive';end if;
 select * into old from zukait_mechanical.tracking where checklist_id=p_entity;
 priority:=old.priority;promised:=old.promise_date;waiting:=coalesce(old.waiting_for_parts,false);
 before_value:=jsonb_build_object('priority',priority,'promiseDate',promised,'waitingForParts',waiting);
 if p_operation='PRIORITY_SET' then
  if p_payload-array['priority','reason']<>'{}'::jsonb or not(p_payload?'priority') or jsonb_typeof(p_payload->'priority') not in ('string','null') then raise exception 'invalid_tracking_change';end if;
  priority:=p_payload->>'priority';if priority is not null and (length(priority)>40 or not coalesce((policy->'priorityValues')?priority,false)) then raise exception 'tracking_priority_policy_required';end if;
 elsif p_operation='PROMISE_SET' then
  if p_payload-array['date','reason']<>'{}'::jsonb or not(p_payload?'date') or jsonb_typeof(p_payload->'date') not in ('string','null') then raise exception 'invalid_promise_date';end if;
  if p_payload->>'date' is not null and ((p_payload->>'date') !~ '^\d{4}-\d{2}-\d{2}$' or p_payload->>'date'<'1900-01-01') then raise exception 'invalid_promise_date';end if;
  begin promised:=(p_payload->>'date')::date;exception when others then raise exception 'invalid_promise_date';end;
 elsif p_operation='HOLD_SET' then
  if policy->>'holdMode' is distinct from 'STATUS_ONLY' then raise exception 'tracking_hold_policy_required';end if;
  if p_payload-array['waiting','reason']<>'{}'::jsonb or jsonb_typeof(p_payload->'waiting') is distinct from 'boolean' then raise exception 'invalid_tracking_change';end if;
  waiting:=(p_payload->>'waiting')::boolean;
 end if;
 after_value:=jsonb_build_object('priority',priority,'promiseDate',promised,'waitingForParts',waiting);
 if after_value=before_value then raise exception 'tracking_no_change';end if;
 result:=jsonb_build_object('ok',true,'operation',p_operation,'requestId',p_request,'entityId',p_entity,'requiresRefresh',true,'recordsRevision',ctl+1,'workshopRevision',rev);
 insert into zukait_mechanical.tracking(checklist_id,priority,promise_date,waiting_for_parts,updated_by) values(p_entity,priority,promised,waiting,p_actor) on conflict(checklist_id) do update set priority=excluded.priority,promise_date=excluded.promise_date,waiting_for_parts=excluded.waiting_for_parts,updated_by=excluded.updated_by,updated_at=clock_timestamp();
 insert into zukait_mechanical.receipts(request_id,actor_id,fingerprint,result) values(p_request,p_actor,p_fingerprint,result);
 insert into zukait_mechanical.audit(request_id,actor_id,operation,entity_id,device_id,reason,before_value,after_value) values(p_request,p_actor,p_operation,p_entity,p_device,reason,before_value,after_value);
 update zukait_mechanical.control set revision=ctl+1 where singleton;
 return result;
end $$;
revoke all on function public.zukait_mechanical_tracking_commit(text,text,text,uuid,text,uuid,text,bigint,bigint,jsonb) from public,anon,authenticated;
grant execute on function public.zukait_mechanical_tracking_commit(text,text,text,uuid,text,uuid,text,bigint,bigint,jsonb) to service_role;
