-- Default-off future history maintenance. Never schedule apply until a recent
-- scheduled backup is independently confirmed and the recovery API is verified.
-- Invoke with outer statement_timeout and lock_timeout; one revision per call.
CREATE OR REPLACE FUNCTION private.plan_workshop_history_compaction(p_verified_backup_at timestamptz)
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY INVOKER SET search_path='' AS $$
DECLARE r record; now_at timestamptz:=statement_timestamp();
BEGIN
 IF p_verified_backup_at IS NULL OR p_verified_backup_at>now_at OR p_verified_backup_at<now_at-interval '48 hours' THEN
  RETURN jsonb_build_object('ok',false,'code','recent_verified_backup_required');
 END IF;
 SELECT h.revision,h.archived_at,EXISTS(SELECT 1 FROM private.workshop_consumables_shadow_history s WHERE s.revision=h.revision) AS staged
 INTO r FROM public.workshop_state_history h
 WHERE h.revision>17683 AND h.archived_at<least(p_verified_backup_at,now_at-interval '24 hours')
 ORDER BY h.revision LIMIT 1;
 IF NOT FOUND THEN RETURN jsonb_build_object('ok',true,'code','nothing_eligible'); END IF;
 RETURN jsonb_build_object('ok',true,'code','eligible','revision',r.revision,'archived_at',r.archived_at,'staged',r.staged);
END $$;

CREATE OR REPLACE FUNCTION private.compact_next_workshop_history(p_verified_backup_at timestamptz,p_apply boolean DEFAULT false)
RETURNS jsonb LANGUAGE plpgsql SECURITY INVOKER SET search_path='' SET lock_timeout='1s' AS $$
DECLARE plan jsonb; r bigint; h public.workshop_state_history%ROWTYPE; staged jsonb; deleted integer; before_data jsonb; after_data jsonb;
BEGIN
 plan:=private.plan_workshop_history_compaction(p_verified_backup_at);
 IF p_apply IS DISTINCT FROM true OR plan->>'code'<>'eligible' THEN RETURN plan||jsonb_build_object('applied',false); END IF;
 IF (clock_timestamp() AT TIME ZONE 'Asia/Muscat')::time >= time '07:00' AND (clock_timestamp() AT TIME ZONE 'Asia/Muscat')::time < time '19:00' THEN
  RETURN jsonb_build_object('ok',true,'code','outside_maintenance_window','applied',false);
 END IF;
 IF NOT pg_try_advisory_xact_lock(7290145563301::bigint) OR NOT pg_try_advisory_xact_lock(hashtextextended('workshop_archive_conversion',0)) THEN
  RETURN jsonb_build_object('ok',true,'code','maintenance_busy','applied',false);
 END IF;
 IF EXISTS(SELECT 1 FROM pg_stat_activity WHERE datname=current_database() AND pid<>pg_backend_pid() AND wait_event_type IN ('Lock','IO')) THEN
  RETURN jsonb_build_object('ok',true,'code','database_pressure','applied',false);
 END IF;
 IF to_regprocedure('private.recover_workshop_revision(bigint)') IS NULL THEN RAISE EXCEPTION 'recovery_reader_required'; END IF;
 r:=(plan->>'revision')::bigint;
 SELECT * INTO h FROM public.workshop_state_history WHERE revision=r FOR UPDATE SKIP LOCKED;
 IF NOT FOUND OR h.archived_at>=least(p_verified_backup_at,statement_timestamp()-interval '24 hours') THEN
  RETURN jsonb_build_object('ok',true,'code','source_changed','applied',false);
 END IF;
 before_data:=private.recover_workshop_revision(r);
 IF before_data IS DISTINCT FROM h.data THEN RAISE EXCEPTION 'pre_compaction_recovery_mismatch'; END IF;
 staged:=private.stage_consumables_history_batch(ARRAY[r]);
 IF staged->>'verified_revisions'<>'1' THEN RAISE EXCEPTION 'compaction_stage_failed'; END IF;
 DELETE FROM public.workshop_state_history WHERE revision=r;
 GET DIAGNOSTICS deleted=ROW_COUNT;
 IF deleted<>1 THEN RAISE EXCEPTION 'compaction_source_count_mismatch'; END IF;
 after_data:=private.recover_workshop_revision(r);
 IF after_data IS DISTINCT FROM before_data THEN RAISE EXCEPTION 'post_compaction_recovery_mismatch'; END IF;
 RETURN jsonb_build_object('ok',true,'code','compacted','applied',true,'revision',r,'originals_removed',deleted,'recovery_verified',true);
END $$;
REVOKE ALL ON FUNCTION private.plan_workshop_history_compaction(timestamptz),private.compact_next_workshop_history(timestamptz,boolean) FROM PUBLIC,anon,authenticated,service_role;
-- Maintenance remains postgres-only, and p_verified_backup_at is an operator
-- assertion, not a claim that this code can verify Supabase's backup inventory.
