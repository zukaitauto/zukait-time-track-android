-- Notification read receipts: actor-scoped, server authoritative, no notification payloads.
-- Service-role access only; public clients must use authenticated workshop-api.
create table if not exists public.workshop_notification_reads (
 actor_id text not null,
 notification_id text not null,
 read_at timestamptz not null default now(),
 primary key (actor_id, notification_id),
 constraint workshop_notification_read_id_length check (length(notification_id) between 1 and 256)
);
create table if not exists public.workshop_notification_watermarks (
 actor_id text primary key,
 read_through_ms bigint not null default 0,
 updated_at timestamptz not null default now()
);
alter table public.workshop_notification_reads enable row level security;
alter table public.workshop_notification_watermarks enable row level security;
revoke all on public.workshop_notification_reads from public, anon, authenticated;
revoke all on public.workshop_notification_watermarks from public, anon, authenticated;
grant select,insert,update on public.workshop_notification_reads to service_role;
grant select,insert,update on public.workshop_notification_watermarks to service_role;

-- Monotonic acknowledgements, safe under concurrent writes and retry.
create or replace function public.zukait_notification_ack(
 p_actor_id text,
 p_ids text[] default '{}'::text[],
 p_read_through_ms bigint default null
) returns jsonb
language plpgsql
security invoker
set search_path = public, pg_temp
as $$
declare
 v_now bigint := floor(extract(epoch from clock_timestamp())*1000)::bigint;
 v_through bigint;
 v_ids text[];
begin
 if nullif(trim(p_actor_id),'') is null or length(p_actor_id)>128 then
   raise exception 'invalid_notification_actor';
 end if;
 if coalesce(array_length(p_ids,1),0)>5000 then
   raise exception 'notification_ack_limit';
 end if;
 select coalesce(array_agg(distinct x),'{}'::text[]) into v_ids
 from unnest(coalesce(p_ids,'{}'::text[])) x
 where length(x) between 1 and 256;
 insert into public.workshop_notification_reads(actor_id,notification_id)
 select p_actor_id,x from unnest(v_ids) x
 on conflict (actor_id,notification_id) do nothing;
 if p_read_through_ms is not null then
   v_through := greatest(0,least(p_read_through_ms,v_now));
   insert into public.workshop_notification_watermarks(actor_id,read_through_ms)
   values(p_actor_id,v_through)
   on conflict(actor_id) do update set
    read_through_ms=greatest(public.workshop_notification_watermarks.read_through_ms,excluded.read_through_ms),
    updated_at=now();
 end if;
 return jsonb_build_object('ok',true,'read_through_ms',
  coalesce((select read_through_ms from public.workshop_notification_watermarks where actor_id=p_actor_id),0));
end;
$$;
revoke all on function public.zukait_notification_ack(text,text[],bigint) from public,anon,authenticated;
grant execute on function public.zukait_notification_ack(text,text[],bigint) to service_role;
