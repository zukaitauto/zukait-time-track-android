-- Architecture V2 bounded read foundation.
-- Repository migration only. Do not apply to production until the V2 backend rollout gate.

begin;

-- Drop the pre-composite signature so upgrades cannot leave an ambiguous overload.
drop function if exists public.zukait_v2_event_page(timestamptz,integer,text,text);

create table if not exists public.workshop_v2_events (
  event_id text primary key,
  entity_id text not null,
  actor_id text,
  device_id text,
  event_type text not null,
  client_time timestamptz,
  server_time timestamptz not null default now(),
  revision bigint,
  payload jsonb not null default '{}'::jsonb
);

create index if not exists workshop_v2_events_entity_server_idx on public.workshop_v2_events(entity_id, server_time desc, event_id desc);
create index if not exists workshop_v2_events_type_server_idx on public.workshop_v2_events(event_type, server_time desc, event_id desc);
create index if not exists workshop_v2_events_actor_server_idx on public.workshop_v2_events(actor_id, server_time desc, event_id desc);

alter table public.workshop_v2_events enable row level security;
revoke all on table public.workshop_v2_events from anon, authenticated;
grant select, insert, update, delete on table public.workshop_v2_events to service_role;

create or replace function public.zukait_v2_event_page(
  p_before timestamptz default null,p_limit integer default 100,p_entity_id text default null,p_event_type text default null,p_before_id text default null
)
returns setof public.workshop_v2_events
language sql stable security invoker set search_path=public as $$
  select e.* from public.workshop_v2_events e
  where (p_before is null or e.server_time < p_before or (e.server_time = p_before and p_before_id is not null and e.event_id < p_before_id))
    and (p_entity_id is null or e.entity_id = p_entity_id)
    and (p_event_type is null or e.event_type = p_event_type)
  order by e.server_time desc, e.event_id desc
  limit greatest(1,least(coalesce(p_limit,100),500));
$$;
revoke all on function public.zukait_v2_event_page(timestamptz,integer,text,text,text) from public,anon,authenticated;
grant execute on function public.zukait_v2_event_page(timestamptz,integer,text,text,text) to service_role;

create table if not exists public.workshop_v2_spare_part_lists (
  list_no text primary key,
  sequence_no bigint not null unique,
  job_card text not null,
  status text not null default 'OPEN',
  created_at timestamptz not null default now(),
  created_by text
);
create unique index if not exists workshop_v2_spare_part_lists_open_job_idx
  on public.workshop_v2_spare_part_lists(upper(job_card)) where status <> 'CLOSED';
alter table public.workshop_v2_spare_part_lists enable row level security;
revoke all on table public.workshop_v2_spare_part_lists from anon, authenticated;
grant select, insert, update, delete on table public.workshop_v2_spare_part_lists to service_role;

create sequence if not exists public.workshop_v2_spare_part_list_seq start 1;

create or replace function public.zukait_v2_allocate_spare_part_list(p_job_card text,p_actor_id text)
returns table(list_no text,sequence_no bigint,job_card text,status text,created_at timestamptz,created_by text)
language plpgsql security invoker set search_path=public as $$
declare v_seq bigint; v_no text;
begin
  if nullif(trim(coalesce(p_job_card,'')),'') is null then raise exception 'job_card_required'; end if;
  if exists(select 1 from public.workshop_v2_spare_part_lists l where upper(l.job_card)=upper(trim(p_job_card)) and l.status<>'CLOSED') then
    return query select l.list_no,l.sequence_no,l.job_card,l.status,l.created_at,l.created_by from public.workshop_v2_spare_part_lists l where upper(l.job_card)=upper(trim(p_job_card)) and l.status<>'CLOSED' order by l.created_at desc limit 1;
    return;
  end if;
  v_seq:=nextval('public.workshop_v2_spare_part_list_seq');
  v_no:='PL'||lpad(v_seq::text,3,'0');
  insert into public.workshop_v2_spare_part_lists(list_no,sequence_no,job_card,created_by) values(v_no,v_seq,upper(trim(p_job_card)),nullif(p_actor_id,''));
  return query select l.list_no,l.sequence_no,l.job_card,l.status,l.created_at,l.created_by from public.workshop_v2_spare_part_lists l where l.list_no=v_no;
exception when unique_violation then
  return query select l.list_no,l.sequence_no,l.job_card,l.status,l.created_at,l.created_by from public.workshop_v2_spare_part_lists l where upper(l.job_card)=upper(trim(p_job_card)) and l.status<>'CLOSED' order by l.created_at desc limit 1;
end;$$;
revoke all on function public.zukait_v2_allocate_spare_part_list(text,text) from public,anon,authenticated;
grant execute on function public.zukait_v2_allocate_spare_part_list(text,text) to service_role;

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
