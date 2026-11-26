-- Bounded, non-destructive pilot. No cron job is installed by this migration.
CREATE FUNCTION private.workshop_snapshot_maintenance_window(p_at timestamptz)
RETURNS boolean LANGUAGE sql IMMUTABLE SECURITY INVOKER SET search_path='' AS $$
 SELECT extract(hour FROM p_at AT TIME ZONE 'Asia/Muscat') >= 19 OR extract(hour FROM p_at AT TIME ZONE 'Asia/Muscat') < 7
$$;
CREATE FUNCTION private.next_workshop_snapshot_block_revision(p_min bigint,p_max bigint)
RETURNS bigint LANGUAGE plpgsql STABLE SECURITY INVOKER SET search_path='' AS $$
DECLARE r bigint;
BEGIN
 IF p_min IS NULL OR p_max IS NULL OR p_min<0 OR p_max<p_min THEN RAISE EXCEPTION 'invalid_snapshot_scope'; END IF;
 SELECT h.revision INTO r FROM public.workshop_state_history h
 WHERE h.revision BETWEEN p_min AND p_max
 AND h.archived_at < statement_timestamp()-interval '1 hour'
 AND NOT EXISTS(SELECT 1 FROM private.workshop_snapshot_manifests m WHERE m.revision=h.revision)
 AND NOT EXISTS(SELECT 1 FROM private.workshop_consumables_shadow_history s WHERE s.revision=h.revision)
 ORDER BY h.revision LIMIT 1;
 RETURN r;
END $$;
CREATE FUNCTION private.stage_next_workshop_snapshot_after_hours(p_min bigint,p_max bigint)
RETURNS jsonb LANGUAGE plpgsql VOLATILE SECURITY INVOKER SET search_path='' AS $$
DECLARE r bigint;
BEGIN
 IF p_min IS NULL OR p_max IS NULL OR p_min<0 OR p_max<p_min THEN RAISE EXCEPTION 'invalid_snapshot_scope'; END IF;
 IF NOT private.workshop_snapshot_maintenance_window(clock_timestamp()) THEN
  RETURN jsonb_build_object('status','outside_window','source_removed',false);
 END IF;
 IF NOT pg_try_advisory_xact_lock(7290145563301::bigint) OR NOT pg_try_advisory_xact_lock(hashtextextended('workshop_archive_conversion',0)) THEN
  RETURN jsonb_build_object('status','busy','source_removed',false);
 END IF;
 IF EXISTS(SELECT 1 FROM pg_stat_activity WHERE datname=current_database() AND pid<>pg_backend_pid() AND wait_event_type IN ('Lock','IO')) THEN
  RETURN jsonb_build_object('status','database_busy','source_removed',false);
 END IF;
 r:=private.next_workshop_snapshot_block_revision(p_min,p_max);
 IF r IS NULL THEN RETURN jsonb_build_object('status','nothing_eligible','source_removed',false); END IF;
 RETURN jsonb_build_object('status','verified')||private.stage_workshop_snapshot_blocks(r);
END $$;
REVOKE ALL ON FUNCTION private.workshop_snapshot_maintenance_window(timestamptz),private.next_workshop_snapshot_block_revision(bigint,bigint),private.stage_next_workshop_snapshot_after_hours(bigint,bigint) FROM PUBLIC,anon,authenticated,service_role;
-- Future deployment: cron invokes a fixed revision scope strictly above 18062,
-- with a statement timeout, short lock timeout and at least 5 minutes between runs.
-- Do not schedule automatically until production reader/backup integration is verified.
