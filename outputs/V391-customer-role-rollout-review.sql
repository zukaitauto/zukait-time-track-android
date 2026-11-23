-- REVIEW PACKAGE ONLY: not applied. Private role storage only; no Vehicle Master identity rollout.
begin;
create schema if not exists zukait_vehicle;
revoke all on schema zukait_vehicle from public,anon,authenticated;
-- ZUKAIT Vehicle Master: customer role recorded per Reception visit.
-- Does not change workshop_receptions details schema, customer name, ownership
-- history, historical invoices, or the existing create/edit operation.
create table if not exists zukait_vehicle.visit_customer_roles(
  rc_no text primary key references public.workshop_receptions(rc_no),
  customer_role text not null check(customer_role in
    ('CUSTOMER','CLAIM_CONTACT','REPRESENTATIVE','UNKNOWN')),
  recorded_by text not null,
  recorded_at timestamptz not null default now()
);
create table if not exists zukait_vehicle.visit_customer_role_audit(
  id bigint generated always as identity primary key,
  rc_no text not null,
  old_role text,
  new_role text not null,
  recorded_by text not null,
  recorded_at timestamptz not null default now()
);
alter table zukait_vehicle.visit_customer_roles enable row level security;
alter table zukait_vehicle.visit_customer_role_audit enable row level security;
revoke all on zukait_vehicle.visit_customer_roles,zukait_vehicle.visit_customer_role_audit
  from public,anon,authenticated;
grant select on zukait_vehicle.visit_customer_roles,
  zukait_vehicle.visit_customer_role_audit to service_role;

-- Correct PL/pgSQL variable collision with PostgreSQL CURRENT_ROLE.
-- Preserve the same permission rules, audit, and private access.
create or replace function public.zukait_vehicle_record_customer_role(
  p_rc_no text,p_actor_id text,p_role text
) returns jsonb
language plpgsql security definer
set search_path=pg_catalog,zukait_vehicle,public as $$
declare
 actor_role_name text;
 prior_customer_role text;
 v_rc text;
 v_creator text;
begin
 if p_role is null or p_role not in ('CUSTOMER','CLAIM_CONTACT','REPRESENTATIVE','UNKNOWN')
 then return jsonb_build_object('ok',false,'code','invalid_customer_role'); end if;
 select role into actor_role_name from public.staff_credentials
 where user_id=p_actor_id and active=true;
 if actor_role_name is null or actor_role_name not in ('Manager','Supervisor','Receptionist')
 then return jsonb_build_object('ok',false,'code','reception_forbidden'); end if;
 select rc_no,created_by into v_rc,v_creator
 from public.workshop_receptions where rc_no=p_rc_no for update;
 if v_rc is null then return jsonb_build_object('ok',false,'code','reception_case_not_found');end if;
 select customer_role into prior_customer_role
 from zukait_vehicle.visit_customer_roles where rc_no=p_rc_no;
 if prior_customer_role is null and p_actor_id<>v_creator and actor_role_name<>'Manager'
 then return jsonb_build_object('ok',false,'code','reception_creator_required');end if;
 if prior_customer_role is not null and prior_customer_role<>p_role and actor_role_name<>'Manager'
 then return jsonb_build_object('ok',false,'code','manager_role_correction_required');end if;
 if prior_customer_role is distinct from p_role then
   insert into zukait_vehicle.visit_customer_roles(rc_no,customer_role,recorded_by)
   values(p_rc_no,p_role,p_actor_id)
   on conflict(rc_no) do update
   set customer_role=excluded.customer_role,recorded_by=excluded.recorded_by,recorded_at=now();
   insert into zukait_vehicle.visit_customer_role_audit(rc_no,old_role,new_role,recorded_by)
   values(p_rc_no,prior_customer_role,p_role,p_actor_id);
 end if;
 return jsonb_build_object('ok',true,'customer_role',p_role);
end $$;
revoke all on function public.zukait_vehicle_record_customer_role(text,text,text)
  from public,anon,authenticated;
grant execute on function public.zukait_vehicle_record_customer_role(text,text,text) to service_role;

create table zukait_vehicle.direct_job_customer_role_audit (
  id bigint generated always as identity primary key,
  request_id uuid not null references public.workshop_reception_commands(request_id),
  customer_role text not null check (customer_role in ('CUSTOMER','CLAIM_CONTACT','REPRESENTATIVE','UNKNOWN')),
  recorded_by text not null,
  recorded_at timestamptz not null default now()
);
create index on zukait_vehicle.direct_job_customer_role_audit (request_id, id desc);
alter table zukait_vehicle.direct_job_customer_role_audit enable row level security;
revoke all on zukait_vehicle.direct_job_customer_role_audit from public, anon, authenticated;

create function public.zukait_vehicle_record_direct_job_role(p_request_id uuid, p_actor_id text, p_role text)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare
  actor_role text;
  creator text;
  prior_role text;
begin
  if p_role is null or p_role not in ('CUSTOMER','CLAIM_CONTACT','REPRESENTATIVE','UNKNOWN') then
    return jsonb_build_object('ok',false,'code','invalid_customer_role');
  end if;
  select role into actor_role from public.staff_credentials where user_id=p_actor_id and active;
  if actor_role is null or actor_role not in ('Receptionist','Supervisor','Manager') then
    return jsonb_build_object('ok',false,'code','reception_forbidden');
  end if;
  select actor_id into creator from public.workshop_reception_commands
   where request_id=p_request_id and command->>'operation'='CREATE_DIRECT_JOB'
     and result->>'ok'='true' and nullif(result->>'job_card','') is not null
     and nullif(result->'record'->>'rc_no','') is null
   for update;
  if not found then
    return jsonb_build_object('ok',false,'code','direct_job_not_found');
  end if;
  select customer_role into prior_role from zukait_vehicle.direct_job_customer_role_audit
   where request_id=p_request_id order by id desc limit 1;
  if actor_role <> 'Manager' then
    if creator is distinct from p_actor_id then
      return jsonb_build_object('ok',false,'code','reception_creator_required');
    end if;
    if prior_role is not null and prior_role <> p_role then
      return jsonb_build_object('ok',false,'code','manager_role_correction_required');
    end if;
  end if;
  if prior_role is distinct from p_role then
    insert into zukait_vehicle.direct_job_customer_role_audit(request_id,customer_role,recorded_by)
    values(p_request_id,p_role,p_actor_id);
  end if;
  return jsonb_build_object('ok',true,'customer_role',p_role);
end;
$$;
revoke all on function public.zukait_vehicle_record_direct_job_role(uuid,text,text) from public, anon, authenticated;
grant execute on function public.zukait_vehicle_record_direct_job_role(uuid,text,text) to service_role;

commit;
