-- One-night, copy-only pilot. No changes to existing workshop schedules.
-- UTC 15:10/20/30/40/50 = 19:10/20/30/40/50 Oman.
-- A missed slot is not retried. The next run after any error unschedules itself.
SELECT cron.schedule('workshop_block_pilot_20261126','10,20,30,40,50 15 26 11 *',$job$
SET lock_timeout='2s';
SET statement_timeout='30s';
DO $pilot$
DECLARE result jsonb; oman_now timestamp:=clock_timestamp() AT TIME ZONE 'Asia/Muscat';
BEGIN
 IF oman_now::date <> DATE '2026-11-26' OR oman_now::time < TIME '19:10' OR oman_now::time >= TIME '20:00' THEN
  PERFORM cron.unschedule('workshop_block_pilot_20261126');
  RETURN;
 END IF;
 BEGIN
  result:=private.stage_next_workshop_snapshot_after_hours(18064,18080);
  RAISE NOTICE 'Block archive pilot: %',result;
 EXCEPTION WHEN query_canceled OR OTHERS THEN
  RAISE WARNING 'Block archive pilot halted: %',SQLSTATE;
  PERFORM cron.unschedule('workshop_block_pilot_20261126');
  RETURN;
 END;
 IF result->>'status' NOT IN ('verified','nothing_eligible') OR result->>'status'='nothing_eligible'
    OR (SELECT count(*) FROM private.workshop_snapshot_manifests WHERE revision IN (18064,18067,18075,18079,18080))=5
    OR oman_now::time >= TIME '19:50' THEN
  PERFORM cron.unschedule('workshop_block_pilot_20261126');
 END IF;
END $pilot$;
$job$);