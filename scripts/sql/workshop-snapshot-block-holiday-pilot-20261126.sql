-- Operator-authorized holiday exception, 26 November 2026 only.
-- The standard after-hours guard remains unchanged. Copy only the original five revisions.
SELECT cron.schedule('workshop_block_pilot_20261126','10,20,30,40,50 10 26 11 *',$job$
SET lock_timeout='2s';
SET statement_timeout='30s';
DO $pilot$
DECLARE result jsonb; r bigint; oman_now timestamp:=clock_timestamp() AT TIME ZONE 'Asia/Muscat';
BEGIN
 IF oman_now::date <> DATE '2026-11-26' OR oman_now::time < TIME '14:10' OR oman_now::time >= TIME '15:00' THEN
  PERFORM cron.unschedule('workshop_block_pilot_20261126'); RETURN;
 END IF;
 IF EXISTS(SELECT 1 FROM cron.job_run_details WHERE jobid=40 AND start_time>=TIMESTAMPTZ '2026-11-26 14:10:00+04' AND status='failed') THEN
  PERFORM cron.unschedule('workshop_block_pilot_20261126'); RETURN;
 END IF;
 IF NOT pg_try_advisory_xact_lock(7290145563301::bigint) OR NOT pg_try_advisory_xact_lock(hashtextextended('workshop_archive_conversion',0))
    OR EXISTS(SELECT 1 FROM pg_stat_activity WHERE datname=current_database() AND pid<>pg_backend_pid() AND wait_event_type IN ('Lock','IO')) THEN
  RAISE WARNING 'Holiday pilot stopped due to database contention';
  PERFORM cron.unschedule('workshop_block_pilot_20261126'); RETURN;
 END IF;
 SELECT h.revision INTO r FROM public.workshop_state_history h
 WHERE h.revision IN (18064,18067,18075,18079,18080)
 AND h.archived_at<statement_timestamp()-interval '1 hour'
 AND NOT EXISTS(SELECT 1 FROM private.workshop_snapshot_manifests m WHERE m.revision=h.revision)
 AND NOT EXISTS(SELECT 1 FROM private.workshop_consumables_shadow_history s WHERE s.revision=h.revision)
 ORDER BY h.revision LIMIT 1;
 IF r IS NULL THEN PERFORM cron.unschedule('workshop_block_pilot_20261126'); RETURN; END IF;
 BEGIN
  result:=private.stage_workshop_snapshot_blocks(r);
  RAISE NOTICE 'Holiday copy-only archive pilot: %',result;
 EXCEPTION WHEN query_canceled OR OTHERS THEN
  RAISE WARNING 'Holiday pilot halted: %',SQLSTATE;
  PERFORM cron.unschedule('workshop_block_pilot_20261126'); RETURN;
 END;
 IF (SELECT count(*) FROM private.workshop_snapshot_manifests WHERE revision IN (18064,18067,18075,18079,18080))=5 OR oman_now::time>=TIME '14:50' THEN
  PERFORM cron.unschedule('workshop_block_pilot_20261126');
 END IF;
END $pilot$;
$job$);