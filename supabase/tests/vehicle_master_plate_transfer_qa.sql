-- Run against isolated QA with both vehicle-master migrations applied.
-- Validates Oman plate transfers, same VIN with a changed plate, owner-change
-- identity continuity, and safe handling when no VIN exists.
-- No persisted test data: transaction always rolls back.
begin;
do $qa$
declare
 toyota uuid; nissan uuid; toyota_new_plate uuid; sold_toyota uuid;
 no_vin1 uuid; no_vin2 uuid;linked_job uuid;
begin
 toyota:=zukait_vehicle.record_physical_visit('RECEPTION','QA-RC001',
    '32621 m','Toyota','Corolla',2020,'VIN-TOYOTA',null,now());
 nissan:=zukait_vehicle.record_physical_visit('RECEPTION','QA-RC002',
    '32621-M','Nissan','Patrol',2021,'VIN-NISSAN',null,now());
 if toyota=nissan then raise exception 'same_plate_different_vin_merged';end if;

 toyota_new_plate:=zukait_vehicle.record_physical_visit('RECEPTION','QA-RC003',
    '88992 T','Toyota','Corolla',2020,'VIN-TOYOTA',null,now());
 if toyota_new_plate<>toyota then raise exception 'vin_new_plate_split';end if;

 -- Selling a vehicle does not change its physical identity or invoice history.
 sold_toyota:=zukait_vehicle.record_physical_visit('RECEPTION','QA-RC004',
    '88992-T','Toyota','Corolla',2020,'VIN-TOYOTA',null,now());
 if sold_toyota<>toyota then raise exception 'sold_vehicle_split';end if;

 -- A plate-only match cannot prove physical identity.
 no_vin1:=zukait_vehicle.record_physical_visit('RECEPTION','QA-RC005',
    '32621m','Toyota','Corolla',null,null,null,now());
 no_vin2:=zukait_vehicle.record_physical_visit('RECEPTION','QA-RC006',
    '32621-m','Nissan','Patrol',null,null,null,now());
 if no_vin1=no_vin2 then raise exception 'plate_without_vin_merged';end if;

 -- A Job Card explicitly opened from a Reception intake reuses its identity.
 linked_job:=zukait_vehicle.record_physical_visit('JOB_CARD','QA-JC005',
    '32621m','Toyota','Corolla',null,null,'QA-RC005',now());
 if linked_job<>no_vin1 then raise exception 'linked_intake_and_job_split';end if;

 if zukait_vehicle.canonical_registration('32621  m')<>'32621-M' then
   raise exception 'plate_format_incorrect';
 end if;
end $qa$;
rollback;
