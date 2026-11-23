-- Vehicle identity safety, Oman plate transfer / owner-change support.
-- Must follow 20261107120000_vehicle_master_foundation.sql.
-- Plate is a searchable observation, NEVER a unique physical-vehicle key.
-- Existing registration-key-based capture is disabled before new capture is enabled.
-- No historical Job Card/reception records are modified.
drop trigger if exists zukait_vehicle_master_reception on public.workshop_receptions;
drop trigger if exists zukait_vehicle_master_jobcard on public.workshop_v2_jobcards;

create table if not exists zukait_vehicle.physical_vehicles (
 id uuid primary key default gen_random_uuid(),
 vin_key text unique,
 identity_status text not null default 'PROVISIONAL'
   check(identity_status in ('PROVISIONAL','VIN_VERIFIED')),
 make text, model text, model_year integer,
 created_at timestamptz not null default now(),
 updated_at timestamptz not null default now()
);
create table if not exists zukait_vehicle.vehicle_visits (
 source_kind text not null check(source_kind in ('RECEPTION','JOB_CARD')),
 source_id text not null,
 vehicle_id uuid not null references zukait_vehicle.physical_vehicles(id),
 registration_entered text not null,
 registration_key text not null,
 registration_display text not null,
 recorded_at timestamptz not null default now(),
 primary key (source_kind,source_id)
);
create index if not exists vehicle_visits_plate_lookup
 on zukait_vehicle.vehicle_visits(registration_key,recorded_at desc);
create index if not exists vehicle_visits_vehicle_lookup
 on zukait_vehicle.vehicle_visits(vehicle_id,recorded_at desc);
create table if not exists zukait_vehicle.ownership_periods (
 id uuid primary key default gen_random_uuid(),
 vehicle_id uuid not null references zukait_vehicle.physical_vehicles(id),
 customer_reference text not null,
 valid_from date not null,
 valid_until date,
 confirmed_by text not null,
 recorded_at timestamptz not null default now(),
 check (valid_until is null or valid_until >= valid_from)
);
create index if not exists vehicle_ownership_history
 on zukait_vehicle.ownership_periods(vehicle_id,valid_from desc);
alter table zukait_vehicle.physical_vehicles enable row level security;
alter table zukait_vehicle.vehicle_visits enable row level security;
alter table zukait_vehicle.ownership_periods enable row level security;
revoke all on zukait_vehicle.physical_vehicles,zukait_vehicle.vehicle_visits,zukait_vehicle.ownership_periods from public,anon,authenticated;
grant select on zukait_vehicle.physical_vehicles,zukait_vehicle.vehicle_visits,zukait_vehicle.ownership_periods to service_role;

create or replace function zukait_vehicle.record_physical_visit(
 p_source_kind text,p_source_id text,p_registration text,
 p_make text default null,p_model text default null,
 p_year integer default null,p_vin text default null,
 p_linked_reception text default null,
 p_seen_at timestamptz default now()
) returns uuid
language plpgsql security definer
set search_path=pg_catalog,zukait_vehicle,public as $$
declare
 k text; v text; chosen uuid; previous_id uuid;
 link_id uuid; existing_vin text;
begin
 if p_source_kind not in ('RECEPTION','JOB_CARD') or nullif(btrim(p_source_id),'') is null then
   raise exception 'invalid_vehicle_visit';
 end if;
 k:=zukait_vehicle.registration_key(p_registration);
 if k is null or length(k)<2 or length(k)>32 then return null; end if;
 v:=nullif(upper(regexp_replace(coalesce(p_vin,''),'[[:space:]]','','g')),'');
 if v is not null and length(v)>40 then raise exception 'invalid_vin_length'; end if;

 -- An existing source keeps its identity unless a verified VIN contradicts it.
 select vehicle_id into previous_id from zukait_vehicle.vehicle_visits
 where source_kind=p_source_kind and source_id=p_source_id for update;

 -- A Job Card created from a Reception record belongs to that exact intake,
 -- not to all other vehicles that happened to use the same plate.
 if p_source_kind='JOB_CARD' and nullif(p_linked_reception,'') is not null then
   select vehicle_id into link_id from zukait_vehicle.vehicle_visits
    where source_kind='RECEPTION' and source_id=p_linked_reception;
 end if;

 if previous_id is not null then chosen:=previous_id;
 elsif link_id is not null then chosen:=link_id;
 elsif v is not null then
   select id into chosen from zukait_vehicle.physical_vehicles where vin_key=v;
 end if;
 if chosen is null then
   insert into zukait_vehicle.physical_vehicles(vin_key,identity_status,make,model,model_year)
   values(v,case when v is null then 'PROVISIONAL' else 'VIN_VERIFIED' end,
     nullif(btrim(p_make),''),nullif(btrim(p_model),''),p_year)
   on conflict (vin_key) do update
    set updated_at=now()
   returning id into chosen;
 end if;

 select vin_key into existing_vin from zukait_vehicle.physical_vehicles where id=chosen for update;
 if v is not null and existing_vin is not null and existing_vin<>v then
   raise exception 'VIN_CONFLICT_REQUIRES_MANUAL_REVIEW';
 end if;
 -- If a provisional vehicle now has a VIN, only promote when no other
 -- identity already owns it; never silently merge two existing records.
 if v is not null and existing_vin is null then
   if exists(select 1 from zukait_vehicle.physical_vehicles
             where vin_key=v and id<>chosen) then
     raise exception 'VIN_MATCH_REQUIRES_MANUAL_REVIEW';
   end if;
   update zukait_vehicle.physical_vehicles
   set vin_key=v,identity_status='VIN_VERIFIED',updated_at=now()
   where id=chosen;
 end if;

 update zukait_vehicle.physical_vehicles
 set make=coalesce(make,nullif(btrim(p_make),'')),
     model=coalesce(model,nullif(btrim(p_model),'')),
     model_year=coalesce(model_year,p_year),
     updated_at=now()
 where id=chosen;

 insert into zukait_vehicle.vehicle_visits
 (source_kind,source_id,vehicle_id,registration_entered,registration_key,registration_display,recorded_at)
 values(p_source_kind,p_source_id,chosen,p_registration,k,
        zukait_vehicle.canonical_registration(p_registration),coalesce(p_seen_at,now()))
 on conflict(source_kind,source_id) do update
 set registration_entered=excluded.registration_entered,
     registration_key=excluded.registration_key,
     registration_display=excluded.registration_display,
     -- A previously registered visit is never silently moved to another car.
     recorded_at=zukait_vehicle.vehicle_visits.recorded_at;
 return chosen;
end $$;
revoke all on function zukait_vehicle.record_physical_visit(text,text,text,text,text,integer,text,text,timestamptz)
from public,anon,authenticated;

create or replace function zukait_vehicle.capture_reception_safe()
returns trigger language plpgsql security definer
set search_path=pg_catalog,zukait_vehicle,public as $$
declare
 y integer;
 vehicle_id uuid;
begin
 if coalesce(new.details->>'year','') ~ '^[0-9]{4}$' then
   y:=(new.details->>'year')::integer;
 end if;
 vehicle_id:=zukait_vehicle.record_physical_visit(
  'RECEPTION',new.rc_no,
  coalesce(new.details->>'registration',new.details->>'regNo',new.details->>'reg'),
  coalesce(new.details->>'make',new.details->>'vehicleMake'),
  coalesce(new.details->>'model',new.details->>'vehicleModel'),
  y,new.details->>'vin',null,new.received_at
 );
 -- Retain an already-linked Job Card's vehicle identity; never merge by plate.
 return new;
end $$;
create trigger zukait_vehicle_master_reception
after insert or update of details on public.workshop_receptions
for each row execute function zukait_vehicle.capture_reception_safe();

create or replace function zukait_vehicle.capture_jobcard_safe()
returns trigger language plpgsql security definer
set search_path=pg_catalog,zukait_vehicle,public as $$
declare linked_rc text;
begin
 select rc_no into linked_rc from public.workshop_receptions
 where job_card=new.job_card limit 1;
 perform zukait_vehicle.record_physical_visit(
  'JOB_CARD',new.job_card,new.registration,new.vehicle_make,
  new.vehicle_model,new.vehicle_year,null,linked_rc,new.created_at
 );
 return new;
end $$;
create trigger zukait_vehicle_master_jobcard
after insert or update of registration,vehicle_make,vehicle_model,vehicle_year
on public.workshop_v2_jobcards for each row
execute function zukait_vehicle.capture_jobcard_safe();
