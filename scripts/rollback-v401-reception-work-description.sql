-- V401 Checklist Work Description ONLY -- independently reversible function DDL.
-- Manual rollback. Run ONLY after inspecting the live function definitions and
-- confirming exactly the expected V401 additions are present. Never delete data.
-- This reverses ONLY the three guarded function text replacements in
-- 20261114053500_reception_linked_checklist_work_description.sql.
BEGIN;
SET LOCAL lock_timeout = '3s';
SET LOCAL statement_timeout = '30s';
DO $rollback$
DECLARE defn text; before_text text; after_text text;
BEGIN
  defn := pg_get_functiondef('public.zukait_reception_vehicle_command(text,jsonb)'::regprocedure);
  before_text := $before0$'v2EventId',event_id,'v2Created',true,
   'workDescription',coalesce(rc.details->>'remarks',''));$before0$;
  after_text := $after0$'v2EventId',event_id,'v2Created',true);$after0$;
  IF (length(defn)-length(replace(defn,before_text,'')))/length(before_text) <> 1 THEN
    RAISE EXCEPTION 'v401_checklist_rollback_drift_1';
  END IF;
  EXECUTE replace(defn,before_text,after_text);
  defn := pg_get_functiondef('public.zukait_reception_cash_base_command(text,jsonb)'::regprocedure);
  before_text := $before1$'v2Created',true,
   'workDescription',coalesce(r.details->>'remarks',''),'jobIntakeOdometer'$before1$;
  after_text := $after1$'v2Created',true,'jobIntakeOdometer'$after1$;
  IF (length(defn)-length(replace(defn,before_text,'')))/length(before_text) <> 1 THEN
    RAISE EXCEPTION 'v401_checklist_rollback_drift_2';
  END IF;
  EXECUTE replace(defn,before_text,after_text);
  defn := pg_get_functiondef('public.zukait_reception_command(text,jsonb)'::regprocedure);
  before_text := $before2$when x->>'no'=no then (x-'directReceptionJob')||jsonb_build_object(
    'receptionNo',r.rc_no,'receptionLocation',r.location,
    'workDescription',coalesce(r.details->>'remarks','')
  ) else x end order by n$before2$;
  after_text := $after2$when x->>'no'=no then (x-'directReceptionJob')||jsonb_build_object('receptionNo',r.rc_no,'receptionLocation',r.location) else x end order by n$after2$;
  IF (length(defn)-length(replace(defn,before_text,'')))/length(before_text) <> 1 THEN
    RAISE EXCEPTION 'v401_checklist_rollback_drift_3';
  END IF;
  EXECUTE replace(defn,before_text,after_text);
END;
$rollback$;
COMMIT;
