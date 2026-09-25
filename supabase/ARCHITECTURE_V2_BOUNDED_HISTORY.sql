-- Architecture V2 bounded read foundation.
-- Repository migration only. Do not apply to production until the V2 backend rollout gate.

begin;

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

create index if not exists workshop_v2_events_entity_server_idx
  on public.workshop_v2_events(entity_id, server_time desc);
create index if not exists workshop_v2_events_type_server_idx
  on public.workshop_v2_events(event_type, server_time desc);
create index if not exists workshop_v2_events_actor_server_idx
  on public.workshop_v2_events(actor_id, server_time desc);

alter table public.workshop_v2_events enable row level security;
revoke all on table public.workshop_v2_events from anon, authenticated;
grant select, insert, update, delete on table public.workshop_v2_events to service_role;

create or replace function public.zukait_v2_event_page(
  p_before timestamptz default null,
  p_limit integer default 100,
  p_entity_id text default null,
  p_event_type text default null
)
returns setof public.workshop_v2_events
language sql
stable
security invoker
set search_path=public
as $$
  select e.*
  from public.workshop_v2_events e
  where (p_before is null or e.server_time < p_before)
    and (p_entity_id is null or e.entity_id = p_entity_id)
    and (p_event_type is null or e.event_type = p_event_type)
  order by e.server_time desc
  limit greatest(1,least(coalesce(p_limit,100),500));
$$;

revoke all on function public.zukait_v2_event_page(timestamptz,integer,text,text)
  from public, anon, authenticated;
grant execute on function public.zukait_v2_event_page(timestamptz,integer,text,text)
  to service_role;

create or replace function public.zukait_v2_commit_event(
  p_event_id text,p_entity_id text,p_actor_id text,p_device_id text,p_event_type text,
  p_client_time timestamptz,p_revision bigint,p_payload jsonb default '{}'::jsonb
)
returns table(event_id text,server_time timestamptz,revision bigint,inserted boolean)
language plpgsql security invoker set search_path=public as $
declare v_row public.workshop_v2_events%rowtype; v_inserted boolean:=false;
begin
  if nullif(trim(p_event_id),'') is null or nullif(trim(p_entity_id),'') is null or nullif(trim(p_event_type),'') is null then raise exception 'invalid_event'; end if;
  insert into public.workshop_v2_events(event_id,entity_id,actor_id,device_id,event_type,client_time,revision,payload)
  values(p_event_id,p_entity_id,nullif(p_actor_id,''),nullif(p_device_id,''),p_event_type,p_client_time,p_revision,coalesce(p_payload,'{}'::jsonb))
  on conflict (event_id) do nothing;
  get diagnostics v_inserted = row_count;
  select * into v_row from public.workshop_v2_events e where e.event_id=p_event_id;
  if v_row.entity_id<>p_entity_id or v_row.event_type<>p_event_type or coalesce(v_row.actor_id,'')<>coalesce(p_actor_id,'') or coalesce(v_row.device_id,'')<>coalesce(p_device_id,'') or v_row.payload<>coalesce(p_payload,'{}'::jsonb) then raise exception 'event_id_conflict'; end if;
  return query select v_row.event_id,v_row.server_time,v_row.revision,v_inserted;
end;$;
revoke all on function public.zukait_v2_commit_event(text,text,text,text,text,timestamptz,bigint,jsonb) from public,anon,authenticated;
grant execute on function public.zukait_v2_commit_event(text,text,text,text,text,timestamptz,bigint,jsonb) to service_role;

commit;
