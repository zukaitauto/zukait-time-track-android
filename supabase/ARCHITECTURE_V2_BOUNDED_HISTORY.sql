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

commit;
