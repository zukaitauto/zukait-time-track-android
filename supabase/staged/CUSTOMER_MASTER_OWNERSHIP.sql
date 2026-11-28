-- Staged only, requires CUSTOMER_MASTER_IDENTITY_FOUNDATION.sql and existing Vehicle Master.
-- Explicit ownership confirmation is different from a visit contact. Inclusive end dates.
begin;
create unique index customer_master_one_open_owner
 on zukait_vehicle.ownership_periods(vehicle_id) where valid_until is null;
create table zukait_customer.ownership_receipts (
 request_id uuid primary key,
 vehicle_id uuid not null references zukait_vehicle.physical_vehicles(id),
 customer_id uuid not null references zukait_customer.customers(id),
 prior_period_id uuid references zukait_vehicle.ownership_periods(id),
 new_period_id uuid not null references zukait_vehicle.ownership_periods(id),
 effective_date date not null,
 confirmed_by text not null,
 reason text not null check(length(trim(reason)) between 1 and 500),
 confirmed_at timestamptz not null default now()
);
alter table zukait_customer.ownership_receipts enable row level security;
revoke all on zukait_customer.ownership_receipts from public,anon,authenticated;
grant select,insert on zukait_customer.ownership_receipts to service_role;
grant insert,update(valid_until) on zukait_vehicle.ownership_periods to service_role;

create or replace function public.zukait_customer_confirm_ownership(
 p_actor text,p_vehicle uuid,p_customer uuid,p_expected_period uuid,
 p_effective date,p_request uuid,p_reason text
) returns jsonb language plpgsql security invoker
set search_path=pg_catalog,public,zukait_customer,zukait_vehicle as $$
declare previous zukait_vehicle.ownership_periods; receipt zukait_customer.ownership_receipts; next_id uuid;
begin
 if not exists(select 1 from public.staff_credentials where user_id=p_actor and active and role='Manager') then
  raise exception 'customer_master_manager_required';
 end if;
 if p_vehicle is null or p_customer is null or p_request is null or p_effective is null
    or p_effective>(now() at time zone 'Asia/Muscat')::date or length(trim(coalesce(p_reason,''))) not between 1 and 500 then
  raise exception 'customer_master_invalid_ownership';
 end if;
 perform pg_advisory_xact_lock(hashtextextended('ownership-request:'||p_request::text,0));
 perform pg_advisory_xact_lock(hashtextextended('ownership-vehicle:'||p_vehicle::text,0));
 select * into receipt from zukait_customer.ownership_receipts where request_id=p_request;
 if found then
  if receipt.vehicle_id<>p_vehicle or receipt.customer_id<>p_customer or receipt.prior_period_id is distinct from p_expected_period
    or receipt.effective_date<>p_effective or receipt.confirmed_by<>p_actor or receipt.reason<>trim(p_reason) then
   raise exception 'customer_master_request_conflict';
  end if;
  return jsonb_build_object('ok',true,'period_id',receipt.new_period_id,'duplicate',true);
 end if;
 if not exists(select 1 from zukait_vehicle.physical_vehicles where id=p_vehicle and identity_status='VIN_VERIFIED' and vin_key is not null) then
  raise exception 'customer_master_vehicle_vin_required';
 end if;
 if not exists(select 1 from zukait_customer.customers where id=p_customer) then raise exception 'customer_master_unknown_customer';end if;
 select * into previous from zukait_vehicle.ownership_periods where vehicle_id=p_vehicle and valid_until is null;
 if previous.id is distinct from p_expected_period then raise exception 'customer_master_ownership_changed';end if;
 if previous.id is not null and (previous.customer_reference=p_customer::text or p_effective<=previous.valid_from) then
  raise exception 'customer_master_invalid_ownership';
 end if;
 if exists(select 1 from zukait_vehicle.ownership_periods where vehicle_id=p_vehicle and id is distinct from previous.id
   and (valid_until is null or valid_until>=p_effective)) then raise exception 'customer_master_ownership_overlap';end if;
 if previous.id is not null then
  update zukait_vehicle.ownership_periods set valid_until=p_effective-1 where id=previous.id and valid_until is null;
  if not found then raise exception 'customer_master_ownership_changed';end if;
 end if;
 insert into zukait_vehicle.ownership_periods(vehicle_id,customer_reference,valid_from,confirmed_by)
  values(p_vehicle,p_customer::text,p_effective,p_actor) returning id into next_id;
 insert into zukait_customer.ownership_receipts(request_id,vehicle_id,customer_id,prior_period_id,new_period_id,effective_date,confirmed_by,reason)
  values(p_request,p_vehicle,p_customer,p_expected_period,next_id,p_effective,p_actor,trim(p_reason));
 return jsonb_build_object('ok',true,'period_id',next_id,'duplicate',false);
end $$;
revoke all on function public.zukait_customer_confirm_ownership(text,uuid,uuid,uuid,date,uuid,text) from public,anon,authenticated;
grant execute on function public.zukait_customer_confirm_ownership(text,uuid,uuid,uuid,date,uuid,text) to service_role;

-- Search confirmed customer identities, never infer matching people or expose original visit contacts.
create or replace function public.zukait_customer_profile_search(p_actor text,p_query text,p_page integer default 0)
returns jsonb language plpgsql stable security invoker set search_path=pg_catalog,public,zukait_customer as $$
declare q text:=lower(trim(coalesce(p_query,''))); result jsonb;
begin
 if not exists(select 1 from public.staff_credentials where user_id=p_actor and active and role in ('Manager','Supervisor','Receptionist')) then raise exception 'customer_master_forbidden';end if;
 if length(q) not between 3 and 80 or p_page is null or p_page not between 0 and 100 then raise exception 'customer_master_invalid_search';end if;
 with found as (
  select id,display_name,mobile from zukait_customer.customers
  where strpos(lower(display_name),q)>0 or id::text=q
  or (q ~ '^[0-9+() .-]+$' and length(regexp_replace(q,'[^0-9]','','g'))>=7
      and strpos(regexp_replace(mobile,'[^0-9]','','g'),regexp_replace(q,'[^0-9]','','g'))>0)
  order by display_name,id limit 26 offset p_page*25
 ), page as (select * from found order by display_name,id limit 25)
 select jsonb_build_object('rows',coalesce((select jsonb_agg(to_jsonb(page) order by display_name,id) from page),'[]'::jsonb),
 'has_more',(select count(*)>25 from found)) into result;
 return result;
end $$;
revoke all on function public.zukait_customer_profile_search(text,text,integer) from public,anon,authenticated;
grant execute on function public.zukait_customer_profile_search(text,text,integer) to service_role;
commit;
