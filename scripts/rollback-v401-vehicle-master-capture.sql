-- ZUKAIT V401 Vehicle Master emergency stop: disable capture trigger side-effects only.
-- Does not delete any private Vehicle Master data, history, ownership, or audit records.
-- Does not touch existing non-Vehicle-Master production triggers.
BEGIN;
SET LOCAL lock_timeout='3s';
SET LOCAL statement_timeout='15s';
DROP TRIGGER IF EXISTS zukait_vehicle_master_reception ON public.workshop_receptions;
DROP TRIGGER IF EXISTS zukait_vehicle_master_jobcard ON public.workshop_v2_jobcards;
DROP TRIGGER IF EXISTS zukait_vehicle_master_linked_jobcard ON public.workshop_receptions;
DROP TRIGGER IF EXISTS zz_zukait_vehicle_master_linked_jobcard ON public.workshop_receptions;
COMMIT;
