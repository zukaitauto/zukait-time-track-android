-- Bulk manifest creation: preserve array order, multiplicity, payload and exact recovery.
CREATE OR REPLACE FUNCTION private.store_consumables_manifest(p_data jsonb)
RETURNS text LANGUAGE plpgsql VOLATILE SECURITY INVOKER SET search_path='' AS $$
DECLARE meta jsonb; collections jsonb:='{}'; section record; refs jsonb; stored jsonb; m jsonb; mh text;
BEGIN
 IF jsonb_typeof(p_data) IS DISTINCT FROM 'object' THEN RAISE EXCEPTION 'invalid_consumables_state'; END IF;
 meta:=p_data;
 FOR section IN SELECT key,value FROM jsonb_each(p_data) WHERE jsonb_typeof(value)='array' LOOP
   WITH entries AS MATERIALIZED (
     SELECT e.value AS payload,e.pos,private.consumables_content_hash(e.value) AS h
     FROM jsonb_array_elements(section.value) WITH ORDINALITY e(value,pos)
   ), inserted AS (
     INSERT INTO private.consumables_record_versions(content_hash,payload)
     SELECT DISTINCT ON (h) h,payload FROM entries ORDER BY h,pos
     ON CONFLICT DO NOTHING RETURNING content_hash
   )
   SELECT coalesce(jsonb_agg(h ORDER BY pos),'[]'::jsonb) INTO refs FROM entries;
   collections:=jsonb_set(collections,ARRAY[section.key],refs,true);
   meta:=meta-section.key;
 END LOOP;
 m:=jsonb_build_object('metadata',meta,'collections',collections);
 mh:=private.consumables_content_hash(m);
 INSERT INTO private.consumables_manifests(manifest_hash,manifest) VALUES(mh,m) ON CONFLICT DO NOTHING;
 SELECT manifest INTO stored FROM private.consumables_manifests WHERE manifest_hash=mh;
 IF NOT FOUND OR stored IS DISTINCT FROM m THEN RAISE EXCEPTION 'consumables_manifest_collision'; END IF;
 IF private.read_consumables_manifest(mh) IS DISTINCT FROM p_data THEN RAISE EXCEPTION 'consumables_manifest_roundtrip_failed'; END IF;
 RETURN mh;
END $$;
-- Stage with one full snapshot reconstruction rather than three; verify digest,
-- data, all metadata and idempotency. Original history is never changed.
CREATE OR REPLACE FUNCTION private.stage_consumables_history_batch(p_revisions bigint[])
RETURNS jsonb LANGUAGE plpgsql VOLATILE SECURITY INVOKER SET search_path='' AS $$
DECLARE r bigint; h public.workshop_state_history%ROWTYPE; stored private.workshop_consumables_shadow_history%ROWTYPE; packed jsonb; n integer:=0; original_bytes bigint:=0; packed_bytes bigint:=0;
BEGIN
 IF p_revisions IS NULL OR cardinality(p_revisions) NOT BETWEEN 1 AND 4 OR array_position(p_revisions,NULL) IS NOT NULL OR cardinality(p_revisions)<>(SELECT count(DISTINCT x) FROM unnest(p_revisions) x) THEN RAISE EXCEPTION 'invalid_history_batch'; END IF;
 IF NOT pg_try_advisory_xact_lock(7290145563301::bigint) THEN RAISE EXCEPTION 'consumables_stage_busy'; END IF;
 FOREACH r IN ARRAY p_revisions LOOP
   SELECT * INTO h FROM public.workshop_state_history WHERE revision=r FOR SHARE;
   IF NOT FOUND THEN RAISE EXCEPTION 'source_revision_missing_%',r; END IF;
   SELECT * INTO stored FROM private.workshop_consumables_shadow_history WHERE revision=r;
   IF NOT FOUND THEN
     packed:=private.pack_workshop_consumables(h.data);
     INSERT INTO private.workshop_consumables_shadow_history(revision,packed_state,updated_at,updated_by,source_digest,source_archived_at)
     VALUES(h.revision,packed,h.updated_at,h.updated_by,private.consumables_content_hash(h.data),h.archived_at)
     ON CONFLICT DO NOTHING;
   END IF;
   SELECT * INTO stored FROM private.workshop_consumables_shadow_history WHERE revision=r;
   IF NOT FOUND OR stored.source_archived_at IS DISTINCT FROM h.archived_at OR stored.updated_at IS DISTINCT FROM h.updated_at OR stored.updated_by IS DISTINCT FROM h.updated_by OR private.read_workshop_consumables_shadow(r)->'data' IS DISTINCT FROM h.data THEN RAISE EXCEPTION 'staged_revision_mismatch_%',r; END IF;
   n:=n+1; original_bytes:=original_bytes+octet_length(h.data::text); packed_bytes:=packed_bytes+octet_length(stored.packed_state::text);
 END LOOP;
 RETURN jsonb_build_object('verified_revisions',n,'original_logical_bytes',original_bytes,'packed_logical_bytes',packed_bytes,'source_records_removed',0);
END $$;
REVOKE ALL ON FUNCTION private.stage_consumables_history_batch(bigint[]) FROM PUBLIC,anon,authenticated,service_role;
REVOKE ALL ON FUNCTION private.store_consumables_manifest(jsonb) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION private.store_consumables_manifest(jsonb) TO service_role;