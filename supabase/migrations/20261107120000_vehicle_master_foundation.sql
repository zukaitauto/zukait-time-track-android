-- ZUKAIT Vehicle Master: additive, private, no destructive backfill.
-- Normalizes Oman-style numeric+letter registrations; preserves source values.
-- Application UI form auto-formatting and authenticated lookup API are separate gates.
create schema if not exists zukait_vehicle;
revoke all on schema zukait_vehicle from public, anon, authenticated;
grant usage on schema zukait_vehicle to service_role;

create or replace function zukait_vehicle.registration_key(p_registration text)
returns text language sql immutable strict set search_path=pg_catalog as $$
  select nullif(upper(regexp_replace(p_registration,'[^A-Za-z0-9]','','g')),'')
$$;

create or replace function zukait_vehicle.canonical_registration(p_registration text)
returns text language sql immutable strict set search_path=pg_catalog as $$
  select case
    when zukait_vehicle.registration_key(p_registration) ~ '^[0-9]+[A-Z]+$'
      then regexp_replace(zukait_vehicle.registration_key(p_registration),'^([0-9]+)([A-Z]+)$','\1-\2')
    else upper(btrim(p_registration))
  end
$$;

create table if not exists zukait_vehicle.vehicles (
  id uuid primary key default gen_random_uuid(),
  registration_key text not null unique,
  canonical_registration text not null,
  registration_original text not null,
  make text,
  model text,
  model_year integer,
  vin text,
  vin_conflict boolean not null default false,
  first_seen_at timestamptz not null default now(),
  last_seen_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create table if not exists zukait_vehicle.visits (
  source_kind text not null check(source_kind in ('RECEPTION','JOB_CARD')),
  source_id text not null,
  vehicle_id uuid not null references zukait_vehicle.vehicles(id),
  registered_at timestamptz not null default now(),
  primary key(source_kind,source_id)
);
create index if not exists zukait_vehicle_visits_vehicle_idx
 on zukait_vehicle.visits(vehicle_id,registered_at desc);
alter table zukait_vehicle.vehicles enable row level security;
alter table zukait_vehicle.visits enable row level security;
revoke all on all tables in schema zukait_vehicle from public,anon,authenticated;
grant select on zukait_vehicle.vehicles,zukait_vehicle.visits to service_role;

create or replace function zukait_vehicle.record_visit(
 p_source_kind text,p_source_id text,p_registration text,
 p_make text default null,p_model text default null,
 p_year integer default null,p_vin text default null,
 p_seen_at timestamptz default now()
) returns uuid
language plpgsql security definer set search_path=pg_catalog,zukait_vehicle,public as $$
declare
 k text; v_id uuid; normalized_vin text;
begin
 if p_source_kind not in ('RECEPTION','JOB_CARD') or nullif(btrim(p_source_id),'') is null then
   raise exception 'invalid_vehicle_visit_identity';
 end if;
 k:=zukait_vehicle.registration_key(p_registration);
 if k is null or length(k)<2 or length(k)>32 then return null; end if;
 normalized_vin:=nullif(upper(btrim(p_vin)),'');
 insert into zukait_vehicle.vehicles(
  registration_key,canonical_registration,registration_original,make,model,model_year,vin,
  first_seen_at,last_seen_at
 ) values (
  k,zukait_vehicle.canonical_registration(p_registration),p_registration,
  nullif(btrim(p_make),''),nullif(btrim(p_model),''),p_year,normalized_vin,
  coalesce(p_seen_at,now()),coalesce(p_seen_at,now())
 )
 on conflict(registration_key) do update set
  make=coalesce(zukait_vehicle.vehicles.make,excluded.make),
  model=coalesce(zukait_vehicle.vehicles.model,excluded.model),
  model_year=coalesce(zukait_vehicle.vehicles.model_year,excluded.model_year),
  vin=coalesce(zukait_vehicle.vehicles.vin,excluded.vin),
  vin_conflict=zukait_vehicle.vehicles.vin_conflict
    or (zukait_vehicle.vehicles.vin is not null and excluded.vin is not null
        and zukait_vehicle.vehicles.vin<>excluded.vin),
  first_seen_at=least(zukait_vehicle.vehicles.first_seen_at,excluded.first_seen_at),
  last_seen_at=greatest(zukait_vehicle.vehicles.last_seen_at,excluded.last_seen_at),
  updated_at=now()
 returning id into v_id;

 insert into zukait_vehicle.visits(source_kind,source_id,vehicle_id,registered_at)
 values(p_source_kind,p_source_id,v_id,coalesce(p_seen_at,now()))
 on conflict(source_kind,source_id) do update
 set vehicle_id=excluded.vehicle_id;
 return v_id;
end $$;

revoke all on function zukait_vehicle.record_visit(text,text,text,text,text,integer,text,timestamptz)
from public,anon,authenticated;
revoke all on function zukait_vehicle.registration_key(text) from public,anon,authenticated;
revoke all on function zukait_vehicle.canonical_registration(text) from public,anon,authenticated;

create or replace function zukait_vehicle.capture_reception()
returns trigger language plpgsql security definer
set search_path=pg_catalog,zukait_vehicle,public as $$
begin
 perform zukait_vehicle.record_visit(
  'RECEPTION',new.rc_no,
  coalesce(new.details->>'registration',new.details->>'regNo',new.details->>'reg'),
  coalesce(new.details->>'make',new.details->>'vehicleMake'),
  coalesce(new.details->>'model',new.details->>'vehicleModel'),
  nullif(new.details->>'year','')::integer,
  new.details->>'vin',new.received_at
 );
 return new;
end $$;
drop trigger if exists zukait_vehicle_master_reception on public.workshop_receptions;
create trigger zukait_vehicle_master_reception after insert or update of details
on public.workshop_receptions for each row
execute function zukait_vehicle.capture_reception();

create or replace function zukait_vehicle.capture_job_card()
returns trigger language plpgsql security definer
set search_path=pg_catalog,zukait_vehicle,public as $$
begin
 perform zukait_vehicle.record_visit(
  'JOB_CARD',new.job_card,new.registration,
  new.vehicle_make,new.vehicle_model,new.vehicle_year,null,new.created_at
 );
 return new;
end $$;
drop trigger if exists zukait_vehicle_master_jobcard on public.workshop_v2_jobcards;
create trigger zukait_vehicle_master_jobcard after insert or update of registration,vehicle_make,vehicle_model,vehicle_year
on public.workshop_v2_jobcards for each row
execute function zukait_vehicle.capture_job_card();
