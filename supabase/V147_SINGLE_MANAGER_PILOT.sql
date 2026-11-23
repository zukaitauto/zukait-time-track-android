-- V147: automatic single-Manager-device Architecture V2 pilot claim.
create table if not exists public.workshop_v2_pilot (
  id text primary key,
  device_id text not null,
  actor_id text not null,
  active boolean not null default true,
  claimed_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
alter table public.workshop_v2_pilot enable row level security;
revoke all on table public.workshop_v2_pilot from public, anon, authenticated;
grant select, insert, update, delete on table public.workshop_v2_pilot to service_role;

create or replace function public.zukait_v2_claim_manager_pilot(p_device_id text,p_actor_id text)
returns table(is_pilot boolean,active boolean,claimed_at timestamptz)
language plpgsql security invoker set search_path=public as $$
declare v public.workshop_v2_pilot%rowtype;
begin
  if nullif(trim(coalesce(p_device_id,'')),'') is null then raise exception 'device_id_required'; end if;
  if nullif(trim(coalesce(p_actor_id,'')),'') is null then raise exception 'actor_id_required'; end if;
  insert into public.workshop_v2_pilot(id,device_id,actor_id,active)
  values('manager-pilot',trim(p_device_id),trim(p_actor_id),true)
  on conflict (id) do nothing;
  select * into v from public.workshop_v2_pilot where id='manager-pilot';
  return query select (v.active and v.device_id=trim(p_device_id)),v.active,v.claimed_at;
end;$$;

revoke all on function public.zukait_v2_claim_manager_pilot(text,text) from public,anon,authenticated;
grant execute on function public.zukait_v2_claim_manager_pilot(text,text) to service_role;
