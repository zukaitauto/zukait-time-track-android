-- Vehicle Master: full-VIN verification for an explicitly selected candidate.
-- The response is boolean only. Do not expose previous customer or claim data.
create or replace function public.zukait_vehicle_verify_match(
 p_registration text,p_vehicle_id uuid,p_vin text
) returns boolean language sql stable security definer
set search_path=pg_catalog,zukait_vehicle,public as $$
 select exists(
  select 1
  from zukait_vehicle.physical_vehicles v
  join zukait_vehicle.vehicle_visits h on h.vehicle_id=v.id
  where v.id=p_vehicle_id
    and v.vin_key is not null
    and v.vin_key=upper(regexp_replace(coalesce(p_vin,''),'[[:space:]]','','g'))
    and h.registration_key=zukait_vehicle.registration_key(p_registration)
 )
$$;
revoke all on function public.zukait_vehicle_verify_match(text,uuid,text)
 from public,anon,authenticated;
grant execute on function public.zukait_vehicle_verify_match(text,uuid,text)
 to service_role;
