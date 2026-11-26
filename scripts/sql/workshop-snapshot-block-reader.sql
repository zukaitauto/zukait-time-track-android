-- Read an immutable full checkpoint; reject any missing or corrupted block.
CREATE FUNCTION private.read_workshop_snapshot_blocks(p_revision bigint)
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY INVOKER SET search_path='' AS $$
DECLARE m private.workshop_snapshot_manifests%ROWTYPE; restored jsonb;
BEGIN
 SELECT * INTO m FROM private.workshop_snapshot_manifests WHERE revision=p_revision;
 IF NOT FOUND THEN RAISE EXCEPTION 'snapshot_manifest_missing'; END IF;
 restored:=private.workshop_snapshot_unpack(m.manifest);
 IF private.consumables_content_hash(restored) IS DISTINCT FROM m.source_digest THEN
  RAISE EXCEPTION 'snapshot_digest_mismatch';
 END IF;
 RETURN jsonb_build_object('revision',m.revision,'data',restored,'updated_at',m.updated_at,'updated_by',m.updated_by,'archived_at',m.archived_at);
END $$;
REVOKE ALL ON FUNCTION private.read_workshop_snapshot_blocks(bigint) FROM PUBLIC,anon,authenticated,service_role;
GRANT EXECUTE ON FUNCTION private.read_workshop_snapshot_blocks(bigint) TO service_role;
