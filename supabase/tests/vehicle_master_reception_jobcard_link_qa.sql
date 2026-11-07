-- ZUKAIT Vehicle Master — physical identity integration regression.
-- RUN ON ISOLATED QA ONLY after vehicle-master foundation, identity safety,
-- candidate lookup, full VIN verification and reconcile-order migrations.
-- This deliberately creates synthetic DB records inside a ROLLBACK.
begin;
do $qa$
declare
 linked uuid;
 job_vehicle uuid;
 provisional uuid;
 toyota uuid;
 nissan uuid;
 query_result jsonb;
begin
 -- A Job Card can be inserted before its Reception link is established.
 insert into public.workshop_v2_jobcards
   (job_card,registration,vehicle_make,vehicle_model,vehicle_year)
 values ('QA-VM-JC-9001','32621 M','Toyota','Corolla',2020);

 select vehicle_id into provisional from zukait_vehicle.vehicle_visits
 where source_kind='JOB_CARD' and source_id='QA-VM-JC-9001';
 if provisional is null then raise exception 'jobcard_not_captured';end if;

 -- Use a real QA staff reference to exercise FK and actual trigger graph.
 insert into public.workshop_receptions
   (rc_no,sequence_no,details,job_card,created_by,updated_by,job_type)
 select 'RC999991',999991,
   '{"registration":"32621-m","make":"Toyota","model":"Corolla","year":"2020","vin":"JTDBR32E720123456","customer":"QA Customer A","contact":"00000000"}'::jsonb,
   'QA-VM-JC-9001',created_by,updated_by,'CASH'
 from public.workshop_receptions order by sequence_no limit 1;

 select vehicle_id into linked from zukait_vehicle.vehicle_visits
 where source_kind='RECEPTION' and source_id='RC999991';
 select vehicle_id into job_vehicle from zukait_vehicle.vehicle_visits
 where source_kind='JOB_CARD' and source_id='QA-VM-JC-9001';
 if linked is null or job_vehicle is null or linked<>job_vehicle
 then raise exception 'linked_jobcard_split_from_reception'; end if;
 if linked=provisional then raise exception 'reception_vin_identity_not_applied';end if;

 -- Same registration moves to a different physical car: independent identity.
 nissan:=zukait_vehicle.record_physical_visit('RECEPTION','QA-VM-RC-NISSAN',
   '32621M','Nissan','Patrol',2021,'JN8AZ2NE0T9012345',null,now());
 if nissan=linked then raise exception 'plate_transfer_merged_cars';end if;

 -- Same VIN returns with a different customer: same physical vehicle.
 toyota:=zukait_vehicle.record_physical_visit('RECEPTION','QA-VM-RC-NEW-CUSTOMER',
   '32621 m','Toyota','Corolla',2020,'JTDBR32E720123456',null,now());
 if toyota<>linked then raise exception 'new_customer_changed_physical_identity';end if;

 -- The read-only search returns both identities; no previous customers.
 query_result:=public.zukait_vehicle_lookup_candidates('32621m');
 if jsonb_array_length(query_result->'candidates')<2
 then raise exception 'plate_lookup_lost_second_vehicle';end if;
 if query_result::text ilike '%QA Customer A%' or query_result::text ilike '%00000000%'
 then raise exception 'previous_customer_information_exposed';end if;

 if not public.zukait_vehicle_verify_match('32621-m',linked,'JTDBR32E720123456')
    or public.zukait_vehicle_verify_match('32621-m',linked,'JN8AZ2NE0T9012345')
 then raise exception 'full_vin_verification_failed';end if;
end $qa$;
rollback;
