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

