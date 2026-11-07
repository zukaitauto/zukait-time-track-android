-- ZUKAIT Vehicle Master: read-only candidate lookup, no owner/claim/invoice data.
-- Requires 20261107120000 and 20261107123000 migrations.
-- Do not expose private tables or match physical vehicles by registration alone.
create or replace function public.zukait_vehicle_lookup_candidates(
 p_registration text
) returns jsonb language plpgsql stable security definer
set search_path=pg_catalog,zukait_vehicle,public as $$
declare
 k text; choices jsonb;
begin
 k:=zukait_vehicle.registration_key(p_registration);
 if k is null or length(k)<2 or length(k)>32 then
  return jsonb_build_object('match','none','candidates','[]'::jsonb);
 end if;
 select coalesce(jsonb_agg(to_jsonb(c) order by c.last_seen desc),'[]'::jsonb)
 into choices
 from (
  select pv.id::text as vehicle_id,
         pv.make, pv.model, pv.model_year as year,
         pv.identity_status as identity_status,
         (pv.vin_key is not null) as vin_available,
         case when length(pv.vin_key)>=4 then right(pv.vin_key,4) else null end as vin_last4,
         count(*)::integer as visits,
         max(vv.recorded_at) as last_seen
  from zukait_vehicle.vehicle_visits vv
  join zukait_vehicle.physical_vehicles pv on pv.id=vv.vehicle_id
  where vv.registration_key=k
  group by pv.id,pv.make,pv.model,pv.model_year,pv.identity_status,pv.vin_key
  order by last_seen desc
  limit 25
 ) c;
 return jsonb_build_object(
   'match',case when jsonb_array_length(choices)=0 then 'none' else 'choices' end,
   'registration_key',k,
   'registration_display',zukait_vehicle.canonical_registration(p_registration),
   'candidates',choices);
end $$;
revoke all on function public.zukait_vehicle_lookup_candidates(text) from public,anon,authenticated;
grant execute on function public.zukait_vehicle_lookup_candidates(text) to service_role;
