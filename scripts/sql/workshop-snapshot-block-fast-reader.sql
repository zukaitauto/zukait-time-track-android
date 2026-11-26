-- Aggregate each array once and build the top-level object once.
-- Retain validation of every content-addressed block and the full snapshot digest.
CREATE FUNCTION private.workshop_snapshot_section_fast(s jsonb)
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY INVOKER SET search_path='' AS $$
DECLARE a jsonb;
BEGIN
 IF s->>'kind'='value' THEN
  RETURN private.workshop_snapshot_block_get(s->>'ref');
 ELSIF s->>'kind'='array' THEN
  IF jsonb_typeof(s->'refs') IS DISTINCT FROM 'array' THEN RAISE EXCEPTION 'invalid_snapshot_array_refs'; END IF;
  WITH blocks AS MATERIALIZED (
   SELECT r.ord,private.workshop_snapshot_block_get(r.ref) AS payload
   FROM jsonb_array_elements_text(s->'refs') WITH ORDINALITY r(ref,ord)
  )
  SELECT coalesce(jsonb_agg(e.value ORDER BY b.ord,e.ord),'[]'::jsonb) INTO a
  FROM blocks b CROSS JOIN LATERAL jsonb_array_elements(b.payload) WITH ORDINALITY e(value,ord);
  IF jsonb_array_length(a) IS DISTINCT FROM (s->>'count')::integer THEN RAISE EXCEPTION 'snapshot_array_count_mismatch'; END IF;
  RETURN a;
 ELSE RAISE EXCEPTION 'invalid_snapshot_manifest_entry';
 END IF;
END $$;
CREATE FUNCTION private.workshop_snapshot_unpack_fast(m jsonb)
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY INVOKER SET search_path='' AS $$
DECLARE result jsonb;
BEGIN
 IF jsonb_typeof(m) IS DISTINCT FROM 'object' THEN RAISE EXCEPTION 'invalid_snapshot_manifest'; END IF;
 SELECT coalesce(jsonb_object_agg(s.key,private.workshop_snapshot_section_fast(s.value)),'{}'::jsonb)
 INTO result FROM jsonb_each(m) s;
 RETURN result;
END $$;
CREATE FUNCTION private.read_workshop_snapshot_blocks_fast(p_revision bigint)
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY INVOKER SET search_path='' AS $$
DECLARE m private.workshop_snapshot_manifests%ROWTYPE; restored jsonb;
BEGIN
 SELECT * INTO m FROM private.workshop_snapshot_manifests WHERE revision=p_revision;
 IF NOT FOUND THEN RAISE EXCEPTION 'snapshot_manifest_missing'; END IF;
 restored:=private.workshop_snapshot_unpack_fast(m.manifest);
 IF private.consumables_content_hash(restored) IS DISTINCT FROM m.source_digest THEN RAISE EXCEPTION 'snapshot_digest_mismatch'; END IF;
 RETURN jsonb_build_object('revision',m.revision,'data',restored,'updated_at',m.updated_at,'updated_by',m.updated_by,'archived_at',m.archived_at);
END $$;
REVOKE ALL ON FUNCTION private.workshop_snapshot_section_fast(jsonb),private.workshop_snapshot_unpack_fast(jsonb),private.read_workshop_snapshot_blocks_fast(bigint) FROM PUBLIC,anon,authenticated,service_role;
GRANT EXECUTE ON FUNCTION private.workshop_snapshot_section_fast(jsonb),private.workshop_snapshot_unpack_fast(jsonb),private.read_workshop_snapshot_blocks_fast(bigint) TO service_role;
