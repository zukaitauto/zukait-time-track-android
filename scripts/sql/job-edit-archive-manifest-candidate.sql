-- QA candidate only. Install in a single transaction; no archive activation.
BEGIN;
CREATE TABLE private.workshop_job_edit_archive_manifest (
 snapshot_revision bigint PRIMARY KEY,
 prefix_count bigint NOT NULL CHECK(prefix_count > 0)
);
REVOKE ALL ON private.workshop_job_edit_archive_manifest FROM PUBLIC, anon, authenticated, service_role;
GRANT SELECT ON private.workshop_job_edit_archive_manifest TO service_role;
CREATE FUNCTION private.guard_sealed_job_edit_archive() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
BEGIN
 -- Serialize all archive mutations with sealing, including TRUNCATE.
 PERFORM pg_catalog.pg_advisory_xact_lock(184293, 115);
 IF TG_OP='TRUNCATE' THEN
  IF EXISTS(SELECT 1 FROM private.workshop_job_edit_archive_manifest) THEN RAISE EXCEPTION 'archive_sealed'; END IF;
  RETURN NULL;
 END IF;
 IF TG_OP <> 'INSERT' THEN
  IF EXISTS(SELECT 1 FROM private.workshop_job_edit_archive_manifest WHERE snapshot_revision=OLD.snapshot_revision) THEN RAISE EXCEPTION 'archive_sealed'; END IF;
 END IF;
 IF TG_OP <> 'DELETE' THEN
  IF EXISTS(SELECT 1 FROM private.workshop_job_edit_archive_manifest WHERE snapshot_revision=NEW.snapshot_revision) THEN RAISE EXCEPTION 'archive_sealed'; END IF;
  RETURN NEW;
 END IF;
 RETURN OLD;
END $$;
CREATE TRIGGER guard_sealed_job_edit_archive BEFORE INSERT OR UPDATE OR DELETE ON private.workshop_job_edit_audit_baseline FOR EACH ROW EXECUTE FUNCTION private.guard_sealed_job_edit_archive();
CREATE TRIGGER guard_sealed_job_edit_truncate BEFORE TRUNCATE ON private.workshop_job_edit_audit_baseline FOR EACH STATEMENT EXECUTE FUNCTION private.guard_sealed_job_edit_archive();
CREATE FUNCTION private.seal_job_edit_archive(r bigint,n bigint) RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE actual bigint; lo bigint; hi bigint;
BEGIN
 IF current_setting('transaction_isolation') <> 'read committed' THEN RAISE EXCEPTION 'archive_seal_requires_read_committed'; END IF;
 -- Acquire table lock before validation to exclude all concurrent DML.
 LOCK TABLE private.workshop_job_edit_audit_baseline IN SHARE ROW EXCLUSIVE MODE;
 PERFORM pg_catalog.pg_advisory_xact_lock(184293,115);
 SELECT count(*),min(position),max(position) INTO actual,lo,hi FROM private.workshop_job_edit_audit_baseline WHERE snapshot_revision=r;
 IF n IS NULL OR n<1 OR actual<>n OR lo<>1 OR hi<>n THEN RAISE EXCEPTION 'archive_incomplete'; END IF;
 INSERT INTO private.workshop_job_edit_archive_manifest VALUES(r,n);
END $$;
REVOKE ALL ON FUNCTION private.guard_sealed_job_edit_archive(),private.seal_job_edit_archive(bigint,bigint) FROM PUBLIC,anon,authenticated,service_role;
-- Sealing remains owner-only pending activation review.
COMMIT;
