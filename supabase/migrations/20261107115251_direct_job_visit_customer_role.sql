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
