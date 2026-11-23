-- Reception's AFTER triggers fire alphabetically by trigger name.
-- Capture the Reception vehicle BEFORE reconciling an already-created Job Card.
-- Both operations are in the same SQL statement transaction.
drop trigger if exists zukait_vehicle_master_linked_jobcard on public.workshop_receptions;
drop trigger if exists zz_zukait_vehicle_master_linked_jobcard on public.workshop_receptions;
create trigger zz_zukait_vehicle_master_linked_jobcard
after insert or update of job_card,details on public.workshop_receptions
for each row
execute function zukait_vehicle.reconcile_linked_jobcard();
