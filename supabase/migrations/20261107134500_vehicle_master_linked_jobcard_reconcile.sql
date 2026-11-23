-- Vehicle Master: reconcile a linked Job Card created before its reception link.
-- Never merge two verified VIN identities; never update the underlying Job Card
-- or its historic registration/customer, and never link by plate alone.
create or replace function zukait_vehicle.reconcile_linked_jobcard()
returns trigger language plpgsql security definer
set search_path=pg_catalog,zukait_vehicle,public as $$
declare
 reception_vehicle uuid; job_vehicle uuid; vin text;
 job_registration text; other_visit_count bigint;
begin
 if new.job_card is null then return new; end if;

 select vehicle_id into reception_vehicle
 from zukait_vehicle.vehicle_visits
 where source_kind='RECEPTION' and source_id=new.rc_no;
 select vehicle_id into job_vehicle
 from zukait_vehicle.vehicle_visits
 where source_kind='JOB_CARD' and source_id=new.job_card for update;
 if reception_vehicle is null or job_vehicle is null
    or reception_vehicle=job_vehicle then return new; end if;

 select registration into job_registration
 from public.workshop_v2_jobcards where job_card=new.job_card;
 if zukait_vehicle.registration_key(job_registration)
    is distinct from zukait_vehicle.registration_key(new.details->>'registration')
 then return new; end if;

 select vin_key into vin from zukait_vehicle.physical_vehicles where id=job_vehicle;
 select count(*) into other_visit_count
 from zukait_vehicle.vehicle_visits where vehicle_id=job_vehicle
    and not(source_kind='JOB_CARD' and source_id=new.job_card);
 -- Only an otherwise unused provisional Job Card identity can be reattached
 -- to an explicitly linked Reception vehicle, regardless of plate reuse.
 if vin is null and other_visit_count=0 then
   update zukait_vehicle.vehicle_visits
   set vehicle_id=reception_vehicle
   where source_kind='JOB_CARD' and source_id=new.job_card
     and vehicle_id=job_vehicle;
 end if;
 return new;
end $$;

drop trigger if exists zukait_vehicle_master_linked_jobcard on public.workshop_receptions;
create trigger zukait_vehicle_master_linked_jobcard
after insert or update of job_card,details on public.workshop_receptions
for each row
execute function zukait_vehicle.reconcile_linked_jobcard();
