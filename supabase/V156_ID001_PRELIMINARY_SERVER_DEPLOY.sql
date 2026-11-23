-- V156 ID001 preliminary-link server deployment.
-- Installs the dormant server conflict-lock projection while Architecture V2 authority remains OFF.
begin;

create table if not exists public.workshop_v2_preliminary_links(
  session_id text primary key,
  job_card text not null,
  source_job text not null default 'ID001',
  linked_event_id text not null unique,
  linked_by text,
  linked_at timestamptz not null default now(),
  reversed_event_id text unique,
  reversed_by text,
  reversed_at timestamptz,
  reversal_reason text
);

create or replace function public.zukait_v2_apply_preliminary_link_event(
  p_event_id text,p_entity_id text,p_event_type text,p_actor_id text,p_payload jsonb
) returns void language plpgsql security invoker set search_path=public as $$
declare v_session text:=trim(coalesce(p_payload->>'sessionId',p_entity_id,''));
declare v_job text:=upper(trim(coalesce(p_payload->>'jobCard','')));
declare v_row public.workshop_v2_preliminary_links%rowtype;
begin
  if v_session='' then raise exception 'preliminary_session_required'; end if;
  if p_event_type='ID001_PRELIMINARY_LINKED' then
    if v_job='' then raise exception 'preliminary_job_required'; end if;
    select * into v_row from public.workshop_v2_preliminary_links where session_id=v_session for update;
    if found and v_row.reversed_at is null then
      if v_row.job_card=v_job and v_row.linked_event_id=p_event_id then return; end if;
      raise exception 'preliminary_session_already_linked';
    end if;
    insert into public.workshop_v2_preliminary_links(session_id,job_card,linked_event_id,linked_by,linked_at,reversed_event_id,reversed_by,reversed_at,reversal_reason)
    values(v_session,v_job,p_event_id,nullif(p_actor_id,''),now(),null,null,null,null)
    on conflict(session_id) do update set job_card=excluded.job_card,linked_event_id=excluded.linked_event_id,linked_by=excluded.linked_by,linked_at=excluded.linked_at,reversed_event_id=null,reversed_by=null,reversed_at=null,reversal_reason=null;
  elsif p_event_type='ID001_PRELIMINARY_REVERSED' then
    select * into v_row from public.workshop_v2_preliminary_links where session_id=v_session for update;
    if not found or v_row.reversed_at is not null then raise exception 'preliminary_link_not_active'; end if;
    if trim(coalesce(p_payload->>'reason',''))='' then raise exception 'preliminary_reversal_reason_required'; end if;
    update public.workshop_v2_preliminary_links set reversed_event_id=p_event_id,reversed_by=nullif(p_actor_id,''),reversed_at=now(),reversal_reason=left(trim(p_payload->>'reason'),240) where session_id=v_session;
  else raise exception 'invalid_preliminary_event';
  end if;
end;$$;

revoke all on function public.zukait_v2_apply_preliminary_link_event(text,text,text,text,jsonb) from public,anon,authenticated;
grant execute on function public.zukait_v2_apply_preliminary_link_event(text,text,text,text,jsonb) to service_role;

create or replace function public.zukait_v2_commit_event(
  p_event_id text,p_entity_id text,p_actor_id text,p_device_id text,p_event_type text,
  p_client_time timestamptz default null,p_revision bigint default null,p_payload jsonb default '{}'::jsonb
)
returns table(event_id text,server_time timestamptz,revision bigint,inserted boolean)
language plpgsql security invoker set search_path=public as $$
declare v public.workshop_v2_events%rowtype; v_inserted boolean:=false;
begin
 if nullif(trim(p_event_id),'') is null or nullif(trim(p_entity_id),'') is null or nullif(trim(p_event_type),'') is null then raise exception 'invalid_event'; end if;
 insert into public.workshop_v2_events(event_id,entity_id,actor_id,device_id,event_type,client_time,revision,payload)
 values(p_event_id,p_entity_id,nullif(p_actor_id,''),nullif(p_device_id,''),p_event_type,p_client_time,p_revision,coalesce(p_payload,'{}'::jsonb))
 on conflict on constraint workshop_v2_events_pkey do nothing returning * into v;
 if found then
   -- Project before returning success. If projection rejects a stale/conflicting event, the surrounding transaction rolls back the inserted event row too.
   v_inserted:=true;
   if p_event_type in ('WORK_START','WORK_PAUSE','WORK_RESUME','WORK_FINISH','ID001_START','ID001_STOP') then
     perform public.zukait_v2_apply_work_event(p_event_id,p_entity_id,p_event_type,coalesce(p_client_time,now()),coalesce(p_revision,0),coalesce(p_payload,'{}'::jsonb));
   end if;
   if p_event_type like 'SPARE_PART%' then
     if nullif(trim(coalesce(p_payload->>'jobCard','')),'') is null or nullif(trim(coalesce(p_payload->>'partId',p_entity_id,'')),'') is null then raise exception 'invalid_spare_part_event'; end if;
     if p_event_type='SPARE_PART_STATUS_CHANGED' and (nullif(trim(coalesce(p_payload->>'from','')),'') is null or nullif(trim(coalesce(p_payload->>'to','')),'') is null) then raise exception 'invalid_spare_part_transition'; end if;
   end if;
   if p_event_type in ('ID001_PRELIMINARY_LINKED','ID001_PRELIMINARY_REVERSED') then
     perform public.zukait_v2_apply_preliminary_link_event(p_event_id,p_entity_id,p_event_type,p_actor_id,coalesce(p_payload,'{}'::jsonb));
   end if;
   if p_event_type in ('PUBLIC_HOLIDAY_SET','PUBLIC_HOLIDAY_CLEARED') then
     perform public.zukait_v2_apply_calendar_event(p_event_id,p_entity_id,p_event_type,p_client_time,p_payload);
   end if;
   if p_event_type in ('LEAVE_CREATED','LEAVE_UPDATED','LEAVE_CANCELLED') then
     perform public.zukait_v2_apply_leave_event(p_event_id,p_entity_id,p_event_type,p_client_time,p_payload);
   end if;
   if p_event_type='JOB_ASSIGNED' then
     perform public.zukait_v2_apply_assignment_event(p_event_id,p_entity_id,p_event_type,p_client_time,p_revision,p_payload);
   end if;
   if p_event_type in ('REPEAT_ASSIGNED','REPEAT_COMPLETED','REPEAT_CANCELLED','CONSUMABLE_ISSUED','CONSUMABLE_ADDITIONAL','CONSUMABLE_ACTUAL','CONSUMABLE_VOIDED') then
     if p_event_type like 'REPEAT%' and nullif(trim(coalesce(p_payload->>'jobCard',p_payload->>'job','')),'') is null then raise exception 'repeat_job_required'; end if;
     if p_event_type='REPEAT_ASSIGNED' and (nullif(trim(coalesce(p_payload->>'employeeId',p_payload->>'emp','')),'') is null or nullif(trim(coalesce(p_payload->>'mistakeEmployeeId',p_payload->>'mistakeEmp','')),'') is null or nullif(trim(coalesce(p_payload->>'reason','')),'') is null) then raise exception 'invalid_repeat_event'; end if;
     if p_event_type like 'CONSUMABLE%' and nullif(trim(coalesce(p_payload->>'jobCard','')),'') is null then raise exception 'consumable_job_required'; end if;
   end if;
   if p_event_type in ('JOB_CREATED','JOB_UPDATED','JOB_STAGE_CHANGED','JOB_COMPLETED','JOB_REOPENED') then
     perform public.zukait_v2_upsert_jobcard(
       coalesce(nullif(p_payload->>'jobCard',''),p_entity_id),
       coalesce(p_payload->>'registration',''),coalesce(p_payload->>'vehicleMake',''),coalesce(p_payload->>'vehicleModel',''),
       case when coalesce(p_payload->>'vehicleYear','') ~ '^[0-9]{4}$' then (p_payload->>'vehicleYear')::integer else null end,
       coalesce(p_payload->>'workflowStage','CREATED'),
       case when p_event_type='JOB_COMPLETED' then 'COMPLETED' when p_event_type='JOB_REOPENED' then 'OPEN' else coalesce(p_payload->>'status','OPEN') end,
       coalesce(p_revision,0),p_event_id,
       case when p_event_type='JOB_COMPLETED' then now() else null end
     );
   end if;
 else
   select * into v from public.workshop_v2_events e where e.event_id=p_event_id;
   if v.entity_id<>p_entity_id or v.event_type<>p_event_type or coalesce(v.actor_id,'')<>coalesce(p_actor_id,'') or coalesce(v.device_id,'')<>coalesce(p_device_id,'') or v.payload<>coalesce(p_payload,'{}'::jsonb) or coalesce(v.revision,-1)<>coalesce(p_revision,-1) or coalesce(v.client_time,'epoch'::timestamptz)<>coalesce(p_client_time,'epoch'::timestamptz) then raise exception 'event_id_conflict'; end if;
 end if;
 return query select v.event_id,v.server_time,v.revision,v_inserted;
end;$$;
revoke all on function public.zukait_v2_commit_event(text,text,text,text,text,timestamptz,bigint,jsonb) from public,anon,authenticated;
grant execute on function public.zukait_v2_commit_event(text,text,text,text,text,timestamptz,bigint,jsonb) to service_role;

commit;
