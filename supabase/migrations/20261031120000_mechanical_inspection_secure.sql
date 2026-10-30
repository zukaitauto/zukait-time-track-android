-- V377 Mechanical checklist inspection details. New objects only; no existing data rewritten.
-- Server route remains independently disabled until approved. Auth is checked inside every RPC.
begin;
create table zukait_mechanical.inspection_details (
 checklist_id uuid primary key references zukait_mechanical.checklists(id) on delete restrict,
 revision bigint not null check(revision>=1),
 job_type text not null check(job_type in ('CASH','CREDIT')),
 vehicle jsonb not null check(jsonb_typeof(vehicle)='object'),
 damage_marks jsonb not null check(jsonb_typeof(damage_marks)='array' and jsonb_array_length(damage_marks)<=100),
 function_checks jsonb not null check(jsonb_typeof(function_checks)='object'),
 work_description text not null check(length(trim(work_description)) between 1 and 2000),
 created_by text not null references public.staff_credentials(user_id),
 created_at timestamptz not null default clock_timestamp(),
 updated_by text not null references public.staff_credentials(user_id),
 updated_at timestamptz not null default clock_timestamp()
);
create table zukait_mechanical.inspection_receipts (
 request_id uuid primary key,
 checklist_id uuid not null references zukait_mechanical.checklists(id) on delete restrict,
 actor_id text not null references public.staff_credentials(user_id),
 expected_revision bigint not null check(expected_revision>=0),
 result_revision bigint not null check(result_revision>=1),
 fingerprint text not null check(fingerprint ~ '^[0-9a-f]{64}$'),
 created_at timestamptz not null default clock_timestamp(),
 unique(checklist_id,result_revision)
);
create table zukait_mechanical.inspection_audit (
 request_id uuid primary key references zukait_mechanical.inspection_receipts(request_id) on delete restrict,
 checklist_id uuid not null references zukait_mechanical.checklists(id) on delete restrict,
 actor_id text not null references public.staff_credentials(user_id),
 before_value jsonb,
 after_value jsonb not null,
 recorded_at timestamptz not null default clock_timestamp()
);
alter table zukait_mechanical.inspection_details enable row level security;
alter table zukait_mechanical.inspection_receipts enable row level security;
alter table zukait_mechanical.inspection_audit enable row level security;
revoke all on zukait_mechanical.inspection_details,zukait_mechanical.inspection_receipts,zukait_mechanical.inspection_audit from public,anon,authenticated,service_role;
grant select,insert,update on zukait_mechanical.inspection_details to service_role;
grant select,insert on zukait_mechanical.inspection_receipts,zukait_mechanical.inspection_audit to service_role;
create function zukait_mechanical.inspection_append_only() returns trigger language plpgsql set search_path=pg_catalog as $guard$
begin
 raise exception 'inspection_history_immutable' using errcode='55000';
end $guard$;
create trigger protect_inspection_receipts before update or delete or truncate on zukait_mechanical.inspection_receipts
 for each statement execute function zukait_mechanical.inspection_append_only();
create trigger protect_inspection_audit before update or delete or truncate on zukait_mechanical.inspection_audit
 for each statement execute function zukait_mechanical.inspection_append_only();
revoke all on function zukait_mechanical.inspection_append_only() from public,anon,authenticated;

-- This authorization is used by BOTH reads and writes.
-- Existing Mechanical membership is exclusively represented by its checklist table;
-- role/capability/session must also be active at transaction time.
create function zukait_mechanical.inspection_authorize(
 p_actor text,p_session_hash text,p_checklist uuid
) returns void language plpgsql security invoker set search_path=pg_catalog as $auth$
declare role_name text;
begin
 perform zukait_mechanical.authorize_session(p_actor,p_session_hash,'MC_CREATE');
 select role into role_name from public.staff_credentials
  where user_id=p_actor and active for share;
 if role_name is distinct from 'Manager' and
    not(p_actor='SUP003' and role_name in ('Supervisor','Mechanical Supervisor')) then
  raise exception 'mechanical_forbidden' using errcode='42501';
 end if;
 if p_checklist is null or not exists(
  select 1 from zukait_mechanical.checklists where id=p_checklist
 ) then
  raise exception 'inspection_checklist_not_found' using errcode='P0002';
 end if;
end $auth$;
revoke all on function zukait_mechanical.inspection_authorize(text,text,uuid) from public,anon,authenticated;
grant execute on function zukait_mechanical.inspection_authorize(text,text,uuid) to service_role;

create function public.zukait_mechanical_inspection_read(
 p_actor text,p_session_hash text,p_checklist uuid
) returns jsonb language plpgsql security invoker set search_path=pg_catalog as $read$
declare c zukait_mechanical.checklists%rowtype; d zukait_mechanical.inspection_details%rowtype;
begin
 perform zukait_mechanical.inspection_authorize(p_actor,p_session_hash,p_checklist);
 select * into c from zukait_mechanical.checklists where id=p_checklist;
 select * into d from zukait_mechanical.inspection_details where checklist_id=p_checklist;
 return jsonb_build_object(
  'ok',true,
  'checklist',jsonb_build_object('id',c.id,'number',c.number,'jobCard',c.job_card,'manualDate',c.manual_jc_date),
  'inspection',case when d.checklist_id is null then 'null'::jsonb else jsonb_build_object(
   'checklistId',d.checklist_id,'revision',d.revision,
   'inspection',jsonb_build_object('jobType',d.job_type,'vehicle',d.vehicle,
    'damageMarks',d.damage_marks,'functions',d.function_checks,
    'workDescription',d.work_description),
   'updatedAt',d.updated_at,'updatedBy',d.updated_by) end
 );
end $read$;
revoke all on function public.zukait_mechanical_inspection_read(text,text,uuid) from public,anon,authenticated;
grant execute on function public.zukait_mechanical_inspection_read(text,text,uuid) to service_role;

create function public.zukait_mechanical_inspection_save(
 p_actor text,p_session_hash text,p_checklist uuid,p_request uuid,
 p_expected bigint,p_inspection jsonb
) returns jsonb language plpgsql security invoker set search_path=pg_catalog as $save$
declare
 d zukait_mechanical.inspection_details%rowtype;
 prior zukait_mechanical.inspection_receipts%rowtype;
 current_revision bigint:=0;
 fingerprint text;
 before_value jsonb;
 new_revision bigint;
 k text;
 check_value jsonb;
 mark jsonb;
begin
 if p_request is null or p_expected is null or p_expected<0 or p_expected>=9223372036854775807
    or p_inspection is null or jsonb_typeof(p_inspection) is distinct from 'object'
    or pg_column_size(p_inspection)>16384
    or coalesce(p_inspection->>'jobType','') not in ('CASH','CREDIT')
    or jsonb_typeof(p_inspection->'vehicle') is distinct from 'object'
    or jsonb_typeof(p_inspection->'damageMarks') is distinct from 'array'
    or jsonb_array_length(p_inspection->'damageMarks')>100
    or jsonb_typeof(p_inspection->'functions') is distinct from 'object'
    or length(trim(coalesce(p_inspection->>'workDescription',''))) not between 1 and 2000
    or exists(select 1 from jsonb_object_keys(p_inspection) k2
              where k2 not in ('jobType','vehicle','damageMarks','functions','workDescription'))
 then raise exception 'invalid_inspection' using errcode='22023';end if;
 -- Validate required vehicle keys even if this RPC is called outside JavaScript.
 foreach k in array array['registration','make','model','year','customer','contact'] loop
  if length(trim(coalesce(p_inspection->'vehicle'->>k,''))) not between 1 and 120 then
   raise exception 'invalid_vehicle' using errcode='22023';
  end if;
 end loop;
 if (p_inspection->'vehicle'->>'year') !~ '^\\d{4}$'
    or (p_inspection->'vehicle'->>'year')::integer not between 1886 and extract(year from now())::integer+1
    or exists(select 1 from jsonb_object_keys(p_inspection->'vehicle') k2 where k2 not in
         ('registration','make','model','year','vin','odometerKm','customer','contact'))
    or (p_inspection->'vehicle' ? 'vin' and
        coalesce(p_inspection->'vehicle'->>'vin','') <> '' and
        upper(p_inspection->'vehicle'->>'vin') !~ '^[A-HJ-NPR-Z0-9]{17}$')
    or (p_inspection->'vehicle' ? 'odometerKm' and
        (jsonb_typeof(p_inspection->'vehicle'->'odometerKm') <> 'number' or
         (p_inspection->'vehicle'->>'odometerKm')::numeric not between 0 and 999999999))
 then raise exception 'invalid_vehicle' using errcode='22023';end if;
 if (select count(*) from jsonb_object_keys(p_inspection->'functions'))<>8
 then raise exception 'invalid_functions' using errcode='22023';end if;
 foreach k in array array['lights','wipers','powerWindows','centralLocking','mirrors','horn','dashboardWarning','airConditioning'] loop
  check_value:=p_inspection->'functions'->k;
  if jsonb_typeof(check_value) is distinct from 'object'
   or check_value->>'status' not in ('OK','ISSUE','NOT_CHECKED')
   or (check_value->>'status'='ISSUE' and length(trim(coalesce(check_value->>'note','')))=0)
   or length(coalesce(check_value->>'note',''))>300
   or exists(select 1 from jsonb_object_keys(check_value) k2 where k2 not in ('status','note'))
  then raise exception 'invalid_functions' using errcode='22023';end if;
 end loop;
 for mark in select value from jsonb_array_elements(p_inspection->'damageMarks') loop
  if jsonb_typeof(mark) is distinct from 'object'
   or length(trim(coalesce(mark->>'part',''))) not between 1 and 80
   or mark->>'mark' not in ('X','S','M')
   or exists(select 1 from jsonb_object_keys(mark) k2 where k2 not in ('part','mark'))
  then raise exception 'invalid_marks' using errcode='22023';end if;
 end loop;
 -- Locks credential+session in authorize_session, then the checklist row.
 perform zukait_mechanical.inspection_authorize(p_actor,p_session_hash,p_checklist);
 perform 1 from zukait_mechanical.checklists where id=p_checklist for update;
 fingerprint:=encode(sha256(convert_to(jsonb_build_object(
   'actor',p_actor,'checklist',p_checklist,'expected',p_expected,'inspection',p_inspection)::text,'UTF8')),'hex');
 select * into prior from zukait_mechanical.inspection_receipts where request_id=p_request;
 if found then
  if prior.checklist_id=p_checklist and prior.actor_id=p_actor
     and prior.expected_revision=p_expected and prior.fingerprint=fingerprint
  then return jsonb_build_object('revision',prior.result_revision,'replayed',true);end if;
  raise exception 'inspection_request_conflict' using errcode='23505';
 end if;
 select * into d from zukait_mechanical.inspection_details where checklist_id=p_checklist for update;
 if found then
  current_revision:=d.revision;
  before_value:=jsonb_build_object('revision',d.revision,'jobType',d.job_type,'vehicle',d.vehicle,
   'damageMarks',d.damage_marks,'functions',d.function_checks,'workDescription',d.work_description);
 end if;
 if current_revision<>p_expected then raise exception 'inspection_revision_conflict' using errcode='40001';end if;
 new_revision:=current_revision+1;
 insert into zukait_mechanical.inspection_details(
  checklist_id,revision,job_type,vehicle,damage_marks,function_checks,work_description,created_by,updated_by)
 values(p_checklist,new_revision,p_inspection->>'jobType',p_inspection->'vehicle',
  p_inspection->'damageMarks',p_inspection->'functions',p_inspection->>'workDescription',p_actor,p_actor)
 on conflict(checklist_id) do update set revision=excluded.revision,job_type=excluded.job_type,
  vehicle=excluded.vehicle,damage_marks=excluded.damage_marks,function_checks=excluded.function_checks,
  work_description=excluded.work_description,updated_by=excluded.updated_by,updated_at=clock_timestamp();
 insert into zukait_mechanical.inspection_receipts(
  request_id,checklist_id,actor_id,expected_revision,result_revision,fingerprint)
 values(p_request,p_checklist,p_actor,p_expected,new_revision,fingerprint);
 insert into zukait_mechanical.inspection_audit(
  request_id,checklist_id,actor_id,before_value,after_value)
 values(p_request,p_checklist,p_actor,before_value,p_inspection);
 return jsonb_build_object('revision',new_revision,'replayed',false);
end $save$;
revoke all on function public.zukait_mechanical_inspection_save(text,text,uuid,uuid,bigint,jsonb)
 from public,anon,authenticated;
grant execute on function public.zukait_mechanical_inspection_save(text,text,uuid,uuid,bigint,jsonb)
 to service_role;
commit;
