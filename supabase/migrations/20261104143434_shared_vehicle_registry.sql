begin;

create schema if not exists zukait_vehicle;
revoke all on schema zukait_vehicle from public, anon, authenticated;
grant usage on schema zukait_vehicle to service_role;

create function zukait_vehicle.identity_key(value text)
returns text language sql immutable strict set search_path = ''
as $$ select regexp_replace(upper(value), '[^A-Z0-9]', '', 'g') $$;

-- Preserve independent identity observations so conflicting plates remain reviewable.
create table zukait_vehicle.intake_identity (
  source text not null check (source in ('body_shop', 'mechanical')),
  record_id text not null,
  registration text not null,
  vin text,
  make text,
  model text,
  model_year text,
  recorded_at timestamptz not null,
  primary key (source, record_id)
);
alter table zukait_vehicle.intake_identity enable row level security;
revoke all on zukait_vehicle.intake_identity from public, anon, authenticated;
grant select, insert, update, delete on zukait_vehicle.intake_identity to service_role;
create index intake_identity_registration on zukait_vehicle.intake_identity (registration);
create index intake_identity_vin on zukait_vehicle.intake_identity (vin) where vin is not null;

create function zukait_vehicle.sync_intake()
returns trigger language plpgsql security invoker set search_path = ''
as $$
declare
  identity_data jsonb;
  source_name text;
  record_key text;
  plate text;
  observed_at timestamptz;
begin
  if tg_table_schema = 'public' then
    source_name := 'body_shop';
    if tg_op = 'DELETE' then record_key := old.rc_no;
    else
      record_key := new.rc_no;
      identity_data := new.details;
      plate := identity_data->>'registration';
      observed_at := new.received_at;
    end if;
  else
    source_name := 'mechanical';
    if tg_op = 'DELETE' then record_key := old.id::text;
    else
      record_key := new.id::text;
      identity_data := new.vehicle;
      plate := new.registration;
      observed_at := new.created_at;
    end if;
  end if;

  if tg_op = 'DELETE' or coalesce(zukait_vehicle.identity_key(plate), '') = '' then
    delete from zukait_vehicle.intake_identity where source = source_name and record_id = record_key;
    return null;
  end if;

  insert into zukait_vehicle.intake_identity
  values (source_name, record_key, zukait_vehicle.identity_key(plate),
    nullif(zukait_vehicle.identity_key(identity_data->>'vin'), ''),
    nullif(btrim(identity_data->>'make'), ''), nullif(btrim(identity_data->>'model'), ''),
    nullif(btrim(identity_data->>'year'), ''), observed_at)
  on conflict (source, record_id) do update set
    registration = excluded.registration, vin = excluded.vin, make = excluded.make,
    model = excluded.model, model_year = excluded.model_year, recorded_at = excluded.recorded_at;
  return null;
end
$$;
revoke all on function zukait_vehicle.sync_intake() from public, anon, authenticated;
grant execute on function zukait_vehicle.sync_intake() to service_role;

-- Prevent intake writes from racing the initial backfill.
lock table public.workshop_receptions, zukait_mechanical.prejob_checklists in share row exclusive mode;
insert into zukait_vehicle.intake_identity
select 'body_shop', rc_no, zukait_vehicle.identity_key(details->>'registration'),
  nullif(zukait_vehicle.identity_key(details->>'vin'), ''),
  nullif(btrim(details->>'make'), ''), nullif(btrim(details->>'model'), ''),
  nullif(btrim(details->>'year'), ''), received_at
from public.workshop_receptions
where coalesce(zukait_vehicle.identity_key(details->>'registration'), '') <> ''
union all
select 'mechanical', id::text, zukait_vehicle.identity_key(registration),
  nullif(zukait_vehicle.identity_key(vehicle->>'vin'), ''),
  nullif(btrim(vehicle->>'make'), ''), nullif(btrim(vehicle->>'model'), ''),
  nullif(btrim(vehicle->>'year'), ''), created_at
from zukait_mechanical.prejob_checklists
where coalesce(zukait_vehicle.identity_key(registration), '') <> '';

create trigger shared_vehicle_reception_intake
after insert or update of details or delete on public.workshop_receptions
for each row execute function zukait_vehicle.sync_intake();
create trigger shared_vehicle_mechanical_intake
after insert or update of registration, vehicle or delete on zukait_mechanical.prejob_checklists
for each row execute function zukait_vehicle.sync_intake();

-- Callable only by the authenticated workshop Edge Function's service role.
create function public.zukait_vehicle_lookup(p_registration text)
returns jsonb language sql stable security invoker set search_path = ''
as $$
with input as (
  select zukait_vehicle.identity_key(p_registration) as plate
  where length(btrim(p_registration)) between 1 and 80
), job_rows as materialized (
  select j, zukait_vehicle.identity_key(coalesce(nullif(j->>'reg', ''), j->>'registration')) as plate,
    nullif(zukait_vehicle.identity_key(coalesce(nullif(j->>'vin', ''), j->>'VIN')), '') as vin
  from public.workshop_state s cross join lateral jsonb_array_elements(coalesce(s.data->'jobs', '[]')) j
  where s.id = 'main' and j->>'no' <> 'ID001'
    and coalesce(j->>'deleted', 'false') <> 'true'
    and coalesce(j->>'cancelled', 'false') <> 'true'
), observations as (
  select i.vin, i.make, i.model, i.model_year, extract(epoch from i.recorded_at)*1000 as observed
  from zukait_vehicle.intake_identity i join input on input.plate = i.registration
  union all
  select j.vin, nullif(coalesce(j.j->>'make', j.j->>'brand'), ''),
    nullif(j.j->>'model', ''), nullif(coalesce(j.j->>'year', j.j->>'vehicleYear'), ''),
    case when j.j->>'createdAt' ~ '^[0-9]{1,15}$' then (j.j->>'createdAt')::numeric end
  from job_rows j join input on input.plate = j.plate
  where input.plate <> ''
), identity as (
  select count(*) as matches, count(distinct vin) as vins, max(vin) as vin,
    count(distinct lower(make)) as makes, count(distinct lower(model)) as models,
    count(distinct model_year) as years
  from observations
), chosen as (
  select o.* from observations o cross join identity i
  where o.vin is not distinct from i.vin
  order by ((o.make is not null)::int + (o.model is not null)::int + (o.model_year is not null)::int) desc,
    o.observed desc nulls last, o.make, o.model, o.model_year
  limit 1
), history as (
  select j.j->>'no' as job_card, j.j->'createdAt' as created_at,
    j.j->'deliveredAt' as delivered_at,
    case when j.j->>'delivered' = 'true' then 'Delivered' else j.j->>'status' end as status,
    j.j->>'jobType' as job_type,
    case when exists (select 1 from zukait_mechanical.prejob_checklists m where m.linked_job_card = j.j->>'no')
      then 'Mechanical'
      when exists (select 1 from public.workshop_receptions r where r.job_card = j.j->>'no')
      then 'Body Shop'
      else null end as department
  from job_rows j cross join identity i
  where i.vin is not null and j.vin = i.vin
  order by case when j.j->>'createdAt' ~ '^[0-9]{1,15}$' then (j.j->>'createdAt')::numeric end desc nulls last,
    j.j->>'no' desc
  limit 50
)
select case
  when i.matches = 0 then jsonb_build_object('match', 'none')
  when i.vins > 1 or i.makes > 1 or i.models > 1 or i.years > 1 then jsonb_build_object('match', 'conflict')
  when i.vin is null then jsonb_build_object('match', 'unverified')
  else jsonb_build_object('match', 'found',
    'vehicle', (select jsonb_build_object('vin', vin, 'make', make, 'model', model, 'year', model_year) from chosen),
    'history', coalesce((select jsonb_agg(to_jsonb(h)) from history h), '[]'::jsonb))
  end
from identity i
$$;
revoke all on function public.zukait_vehicle_lookup(text) from public, anon, authenticated;
grant execute on function public.zukait_vehicle_lookup(text) to service_role;

commit;
