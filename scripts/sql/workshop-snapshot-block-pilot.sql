-- Content-addressed workshop history pilot; not connected to live writes.
CREATE TABLE private.workshop_snapshot_blocks(
 hash text PRIMARY KEY CHECK(hash ~ '^[0-9a-f]{64}$'), payload jsonb NOT NULL
);
CREATE TABLE private.workshop_snapshot_manifests(
 revision bigint PRIMARY KEY, manifest jsonb NOT NULL, source_digest text NOT NULL CHECK(source_digest ~ '^[0-9a-f]{64}$'),
 updated_at timestamptz, updated_by text, archived_at timestamptz
);
ALTER TABLE private.workshop_snapshot_blocks ENABLE ROW LEVEL SECURITY;
ALTER TABLE private.workshop_snapshot_manifests ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON private.workshop_snapshot_blocks,private.workshop_snapshot_manifests FROM PUBLIC,anon,authenticated,service_role;
GRANT SELECT,INSERT ON private.workshop_snapshot_blocks,private.workshop_snapshot_manifests TO service_role;
CREATE FUNCTION private.workshop_snapshot_block_put(p jsonb) RETURNS text LANGUAGE plpgsql VOLATILE SECURITY INVOKER SET search_path='' AS $$
DECLARE h text:=private.consumables_content_hash(p); actual jsonb;
BEGIN
 INSERT INTO private.workshop_snapshot_blocks VALUES(h,p) ON CONFLICT DO NOTHING;
 SELECT payload INTO actual FROM private.workshop_snapshot_blocks WHERE hash=h;
 IF NOT FOUND OR actual IS DISTINCT FROM p THEN RAISE EXCEPTION 'snapshot_block_collision'; END IF;
 RETURN h;
END $$;
CREATE FUNCTION private.workshop_snapshot_block_get(h text) RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY INVOKER SET search_path='' AS $$
DECLARE p jsonb;
BEGIN
 SELECT payload INTO p FROM private.workshop_snapshot_blocks WHERE hash=h;
 IF NOT FOUND OR private.consumables_content_hash(p) IS DISTINCT FROM h THEN RAISE EXCEPTION 'snapshot_block_missing_or_corrupt'; END IF;
 RETURN p;
END $$;
CREATE FUNCTION private.workshop_snapshot_pack(p jsonb) RETURNS jsonb LANGUAGE plpgsql VOLATILE SECURITY INVOKER SET search_path='' AS $$
DECLARE s record; chunk record; result jsonb:='{}'; refs jsonb;
BEGIN
 IF jsonb_typeof(p) IS DISTINCT FROM 'object' THEN RAISE EXCEPTION 'snapshot_not_object'; END IF;
 FOR s IN SELECT key,value FROM jsonb_each(p) LOOP
  IF jsonb_typeof(s.value)='array' THEN
   refs:='[]';
   FOR chunk IN SELECT ((ord-1)/128) AS block_no,jsonb_agg(value ORDER BY ord) AS payload
     FROM jsonb_array_elements(s.value) WITH ORDINALITY a(value,ord) GROUP BY ((ord-1)/128) ORDER BY block_no LOOP
     refs:=refs||jsonb_build_array(private.workshop_snapshot_block_put(chunk.payload));
   END LOOP;
   result:=jsonb_set(result,ARRAY[s.key],jsonb_build_object('kind','array','count',jsonb_array_length(s.value),'refs',refs));
  ELSE
   result:=jsonb_set(result,ARRAY[s.key],jsonb_build_object('kind','value','ref',private.workshop_snapshot_block_put(s.value)));
  END IF;
 END LOOP;
 RETURN result;
END $$;
CREATE FUNCTION private.workshop_snapshot_unpack(m jsonb) RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY INVOKER SET search_path='' AS $$
DECLARE s record; ref text; block jsonb; a jsonb; result jsonb:='{}';
BEGIN
 IF jsonb_typeof(m) IS DISTINCT FROM 'object' THEN RAISE EXCEPTION 'invalid_snapshot_manifest'; END IF;
 FOR s IN SELECT key,value FROM jsonb_each(m) LOOP
  IF s.value->>'kind'='value' THEN
   result:=jsonb_set(result,ARRAY[s.key],private.workshop_snapshot_block_get(s.value->>'ref'));
  ELSIF s.value->>'kind'='array' THEN
   a:='[]';
   FOR ref IN SELECT value FROM jsonb_array_elements_text(s.value->'refs') LOOP
    block:=private.workshop_snapshot_block_get(ref);
    IF jsonb_typeof(block) IS DISTINCT FROM 'array' THEN RAISE EXCEPTION 'invalid_snapshot_array_block'; END IF;
    a:=a||block;
   END LOOP;
   IF jsonb_array_length(a) IS DISTINCT FROM (s.value->>'count')::integer THEN RAISE EXCEPTION 'snapshot_array_count_mismatch'; END IF;
   result:=jsonb_set(result,ARRAY[s.key],a);
  ELSE RAISE EXCEPTION 'invalid_snapshot_manifest_entry';
  END IF;
 END LOOP;
 RETURN result;
END $$;
REVOKE ALL ON FUNCTION private.workshop_snapshot_block_put(jsonb),private.workshop_snapshot_block_get(text),private.workshop_snapshot_pack(jsonb),private.workshop_snapshot_unpack(jsonb) FROM PUBLIC,anon,authenticated,service_role;
GRANT EXECUTE ON FUNCTION private.workshop_snapshot_block_get(text),private.workshop_snapshot_unpack(jsonb) TO service_role;
-- Writes restricted to maintenance owner. Never deletes original history.
CREATE FUNCTION private.stage_workshop_snapshot_blocks(p_revision bigint) RETURNS jsonb LANGUAGE plpgsql VOLATILE SECURITY INVOKER SET search_path='' AS $$
DECLARE h public.workshop_state_history%ROWTYPE; m jsonb; saved private.workshop_snapshot_manifests%ROWTYPE; d text;
BEGIN
 IF NOT pg_try_advisory_xact_lock(7290145563301::bigint) THEN RAISE EXCEPTION 'snapshot_stage_busy'; END IF;
 SELECT * INTO h FROM public.workshop_state_history WHERE revision=p_revision FOR SHARE;
 IF NOT FOUND THEN RAISE EXCEPTION 'snapshot_source_missing'; END IF;
 d:=private.consumables_content_hash(h.data);
 SELECT * INTO saved FROM private.workshop_snapshot_manifests WHERE revision=p_revision;
 IF NOT FOUND THEN
  m:=private.workshop_snapshot_pack(h.data);
  INSERT INTO private.workshop_snapshot_manifests VALUES(h.revision,m,d,h.updated_at,h.updated_by,h.archived_at);
  SELECT * INTO saved FROM private.workshop_snapshot_manifests WHERE revision=p_revision;
 END IF;
 IF saved.source_digest IS DISTINCT FROM d OR saved.updated_at IS DISTINCT FROM h.updated_at OR saved.updated_by IS DISTINCT FROM h.updated_by OR saved.archived_at IS DISTINCT FROM h.archived_at OR private.workshop_snapshot_unpack(saved.manifest) IS DISTINCT FROM h.data THEN RAISE EXCEPTION 'snapshot_roundtrip_failed'; END IF;
 RETURN jsonb_build_object('verified_revision',p_revision,'source_bytes',octet_length(h.data::text),'manifest_bytes',octet_length(saved.manifest::text),'source_removed',false);
END $$;
REVOKE ALL ON FUNCTION private.stage_workshop_snapshot_blocks(bigint) FROM PUBLIC,anon,authenticated,service_role;
