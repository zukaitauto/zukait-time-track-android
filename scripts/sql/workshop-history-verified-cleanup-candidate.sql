-- Owner-only cleanup gate. Empty authorization table means cleanup is disabled.
-- An authorization is evidence of an independently verified backup, not a backup itself.
-- Do not insert approvals until the backup includes this exact archived revision and all dependencies.
CREATE TABLE private.workshop_history_cleanup_approval(
 revision bigint PRIMARY KEY,
 source_digest text NOT NULL CHECK(source_digest ~ '^[0-9a-f]{64}$'),
 backup_reference text NOT NULL CHECK(length(btrim(backup_reference))>0),
 archive_verified_at timestamptz NOT NULL,
 backup_created_at timestamptz NOT NULL,
 backup_verified_at timestamptz NOT NULL,
 approved_at timestamptz NOT NULL DEFAULT clock_timestamp(),
 CHECK(archive_verified_at<=backup_created_at AND backup_created_at<=backup_verified_at AND backup_verified_at<=approved_at)
);
ALTER TABLE private.workshop_history_cleanup_approval ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON private.workshop_history_cleanup_approval FROM PUBLIC,anon,authenticated,service_role;
CREATE FUNCTION private.verify_workshop_history_cleanup_copy(p_revision bigint)
RETURNS text LANGUAGE plpgsql STABLE SECURITY INVOKER SET search_path='' AS $$
DECLARE h public.workshop_state_history%ROWTYPE; a jsonb; s private.workshop_consumables_shadow_history%ROWTYPE; digest text;
BEGIN
 SELECT * INTO h FROM public.workshop_state_history WHERE revision=p_revision;
 IF NOT FOUND THEN RAISE EXCEPTION 'cleanup_source_missing'; END IF;
 IF h.archived_at IS NULL OR h.archived_at>=statement_timestamp()-interval '1 hour' THEN RAISE EXCEPTION 'cleanup_source_too_recent'; END IF;
 digest:=private.consumables_content_hash(h.data);
 IF EXISTS(SELECT 1 FROM private.workshop_snapshot_manifests WHERE revision=p_revision) THEN
  a:=private.read_workshop_snapshot_blocks_fast(p_revision);
 ELSE
  SELECT * INTO s FROM private.workshop_consumables_shadow_history WHERE revision=p_revision;
  IF NOT FOUND THEN RAISE EXCEPTION 'cleanup_archive_missing'; END IF;
  a:=private.read_workshop_consumables_shadow(p_revision)||jsonb_build_object('archived_at',s.source_archived_at);
 END IF;
 IF a->'data' IS DISTINCT FROM h.data OR a->>'revision' IS DISTINCT FROM h.revision::text
 OR (a->>'updated_at')::timestamptz IS DISTINCT FROM h.updated_at OR a->>'updated_by' IS DISTINCT FROM h.updated_by
 OR (a->>'archived_at')::timestamptz IS DISTINCT FROM h.archived_at THEN
  RAISE EXCEPTION 'cleanup_archive_mismatch';
 END IF;
 RETURN digest;
END $$;
CREATE FUNCTION private.cleanup_one_verified_workshop_history(p_revision bigint)
RETURNS jsonb LANGUAGE plpgsql VOLATILE SECURITY INVOKER SET search_path='' AS $$
DECLARE approval private.workshop_history_cleanup_approval%ROWTYPE; h public.workshop_state_history%ROWTYPE; digest text; recovered jsonb;
BEGIN
 -- Independent approval must precede every removal. Never grant this function to app roles.
 SELECT * INTO approval FROM private.workshop_history_cleanup_approval WHERE revision=p_revision;
 IF NOT FOUND THEN RAISE EXCEPTION 'cleanup_backup_approval_required'; END IF;
 IF NOT private.workshop_snapshot_maintenance_window(clock_timestamp()) THEN RAISE EXCEPTION 'cleanup_outside_window'; END IF;
 IF NOT pg_try_advisory_xact_lock(7290145563301::bigint) OR NOT pg_try_advisory_xact_lock(hashtextextended('workshop_archive_conversion',0)) THEN RAISE EXCEPTION 'cleanup_busy'; END IF;
 IF EXISTS(SELECT 1 FROM pg_stat_activity WHERE datname=current_database() AND pid<>pg_backend_pid() AND wait_event_type IN ('Lock','IO')) THEN RAISE EXCEPTION 'cleanup_database_busy'; END IF;
 IF EXISTS(SELECT 1 FROM pg_trigger WHERE tgrelid='public.workshop_state_history'::regclass AND NOT tgisinternal AND (tgtype::integer & 8)<>0)
 OR EXISTS(SELECT 1 FROM pg_constraint WHERE confrelid='public.workshop_state_history'::regclass) THEN RAISE EXCEPTION 'cleanup_source_dependencies_changed'; END IF;
 SELECT * INTO h FROM public.workshop_state_history WHERE revision=p_revision FOR UPDATE;
 IF NOT FOUND THEN RAISE EXCEPTION 'cleanup_source_missing'; END IF;
 IF approval.archive_verified_at<=h.archived_at OR approval.backup_created_at<=h.archived_at THEN RAISE EXCEPTION 'cleanup_backup_predates_source'; END IF;
 IF h.revision >= (SELECT revision FROM public.workshop_state WHERE id='main') THEN RAISE EXCEPTION 'cleanup_not_historical'; END IF;
 digest:=private.verify_workshop_history_cleanup_copy(p_revision);
 IF approval.source_digest IS DISTINCT FROM digest THEN RAISE EXCEPTION 'cleanup_approval_digest_mismatch'; END IF;
 -- Production's combined recovery function must exist and agree before removal.
 IF to_regprocedure('public.zukait_read_workshop_merge_base(bigint)') IS NULL THEN RAISE EXCEPTION 'cleanup_recovery_integration_missing'; END IF;
 EXECUTE 'SELECT public.zukait_read_workshop_merge_base($1)' INTO recovered USING p_revision;
 IF recovered IS DISTINCT FROM h.data THEN RAISE EXCEPTION 'cleanup_pre_recovery_mismatch'; END IF;
 DELETE FROM public.workshop_state_history WHERE revision=p_revision;
 IF NOT FOUND THEN RAISE EXCEPTION 'cleanup_delete_missing'; END IF;
 EXECUTE 'SELECT public.zukait_read_workshop_merge_base($1)' INTO recovered USING p_revision;
 IF recovered IS DISTINCT FROM h.data THEN RAISE EXCEPTION 'cleanup_post_recovery_mismatch'; END IF;
 RETURN jsonb_build_object('revision',p_revision,'source_digest',digest,'redundant_copy_removed',true,'backup_reference',approval.backup_reference);
END $$;
REVOKE ALL ON FUNCTION private.verify_workshop_history_cleanup_copy(bigint),private.cleanup_one_verified_workshop_history(bigint) FROM PUBLIC,anon,authenticated,service_role;
-- No approvals, no cron schedule, no deletions in this migration.
-- Require per-revision backup evidence, a separate verified restore, and source dependency review before enabling.
