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

create or replace function public.zukait_vehicle_record_customer_role(
  p_rc_no text,p_actor_id text,p_role text
) returns jsonb
language plpgsql security definer
set search_path=pg_catalog,zukait_vehicle,public as $$
declare
 role_name text; current_role text; v_rc text; v_actor text;
begin
 if p_role is null or p_role not in ('CUSTOMER','CLAIM_CONTACT','REPRESENTATIVE','UNKNOWN')
 then return jsonb_build_object('ok',false,'code','invalid_customer_role');end if;
 select role into role_name from public.staff_credentials
 where user_id=p_actor_id and active=true;
 if role_name not in ('Manager','Supervisor','Receptionist')
 then return jsonb_build_object('ok',false,'code','reception_forbidden');end if;
 select rc_no,created_by into v_rc,v_actor
 from public.workshop_receptions where rc_no=p_rc_no for update;
 if v_rc is null then return jsonb_build_object('ok',false,'code','reception_case_not_found');end if;
 -- Only the creator or Manager may assign an initial role. Corrections require
 -- Manager: prevents overwriting an earlier visit's customer relationship.
 select customer_role into current_role
 from zukait_vehicle.visit_customer_roles where rc_no=p_rc_no;
 if current_role is null and p_actor_id<>v_actor and role_name<>'Manager'
 then return jsonb_build_object('ok',false,'code','reception_creator_required');end if;
 if current_role is not null and current_role<>p_role and role_name<>'Manager'
 then return jsonb_build_object('ok',false,'code','manager_role_correction_required');end if;
 if current_role is distinct from p_role then
   insert into zukait_vehicle.visit_customer_roles(rc_no,customer_role,recorded_by)
   values(p_rc_no,p_role,p_actor_id)
   on conflict(rc_no) do update
   set customer_role=excluded.customer_role,recorded_by=excluded.recorded_by,recorded_at=now();
   insert into zukait_vehicle.visit_customer_role_audit(rc_no,old_role,new_role,recorded_by)
   values(p_rc_no,current_role,p_role,p_actor_id);
 end if;
 return jsonb_build_object('ok',true,'customer_role',p_role);
end $$;
revoke all on function public.zukait_vehicle_record_customer_role(text,text,text)
  from public,anon,authenticated;
grant execute on function public.zukait_vehicle_record_customer_role(text,text,text)
  to service_role;
