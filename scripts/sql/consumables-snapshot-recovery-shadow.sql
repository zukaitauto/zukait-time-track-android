-- Archive boundary helpers: active snapshot remains compatible with all clients.
-- Historical snapshots can store a manifest pointer instead of full consumables.
CREATE OR REPLACE FUNCTION private.pack_workshop_consumables(p_state jsonb)
RETURNS jsonb LANGUAGE plpgsql VOLATILE SECURITY INVOKER SET search_path='' AS $$
DECLARE h text; packed jsonb;
BEGIN
 IF jsonb_typeof(p_state) IS DISTINCT FROM 'object' THEN RAISE EXCEPTION 'invalid_workshop_snapshot'; END IF;
 IF p_state ? 'consumablesManifest' THEN RAISE EXCEPTION 'reserved_consumables_manifest_key'; END IF;
 IF NOT p_state?'consumables' OR jsonb_typeof(p_state->'consumables') IS DISTINCT FROM 'object' THEN RETURN p_state; END IF;
 h:=private.store_consumables_manifest(p_state->'consumables');
 packed:=(p_state-'consumables')||jsonb_build_object('consumablesManifest',h);
 RETURN packed;
END $$;
CREATE OR REPLACE FUNCTION private.unpack_workshop_consumables(p_state jsonb)
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY INVOKER SET search_path='' AS $$
DECLARE h text; restored jsonb;
BEGIN
 IF jsonb_typeof(p_state) IS DISTINCT FROM 'object' THEN RAISE EXCEPTION 'invalid_workshop_snapshot'; END IF;
 IF NOT p_state?'consumablesManifest' THEN RETURN p_state; END IF;
 IF p_state?'consumables' OR jsonb_typeof(p_state->'consumablesManifest') IS DISTINCT FROM 'string' THEN RAISE EXCEPTION 'invalid_consumables_manifest_pointer'; END IF;
 h:=p_state->>'consumablesManifest';
 IF h !~ '^[0-9a-f]{64}$' THEN RAISE EXCEPTION 'invalid_consumables_manifest_pointer'; END IF;
 restored:=private.read_consumables_manifest(h);
 RETURN (p_state-'consumablesManifest')||jsonb_build_object('consumables',restored);
END $$;
REVOKE ALL ON FUNCTION private.pack_workshop_consumables(jsonb),private.unpack_workshop_consumables(jsonb) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION private.pack_workshop_consumables(jsonb),private.unpack_workshop_consumables(jsonb) TO service_role;
-- Separate shadow history, so legacy recovery remains untouched until cutover.
CREATE TABLE private.workshop_consumables_shadow_history (
 revision bigint PRIMARY KEY, packed_state jsonb NOT NULL,
 updated_at timestamptz, updated_by text, source_digest text NOT NULL CHECK(source_digest ~ '^[0-9a-f]{64}$')
);
ALTER TABLE private.workshop_consumables_shadow_history ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON private.workshop_consumables_shadow_history FROM PUBLIC,anon,authenticated,service_role;
GRANT SELECT,INSERT ON private.workshop_consumables_shadow_history TO service_role;
CREATE OR REPLACE FUNCTION private.store_workshop_consumables_shadow(p_revision bigint,p_state jsonb,p_updated_at timestamptz,p_updated_by text)
RETURNS void LANGUAGE plpgsql VOLATILE SECURITY INVOKER SET search_path='' AS $$
DECLARE packed jsonb; h text; stored private.workshop_consumables_shadow_history%ROWTYPE;
BEGIN
 IF p_revision IS NULL OR p_revision<0 THEN RAISE EXCEPTION 'invalid_revision'; END IF;
 h:=private.consumables_content_hash(p_state);
 packed:=private.pack_workshop_consumables(p_state);
 IF private.unpack_workshop_consumables(packed) IS DISTINCT FROM p_state THEN RAISE EXCEPTION 'shadow_round_trip_mismatch'; END IF;
 INSERT INTO private.workshop_consumables_shadow_history(revision,packed_state,updated_at,updated_by,source_digest) VALUES(p_revision,packed,p_updated_at,p_updated_by,h) ON CONFLICT DO NOTHING;
 SELECT * INTO stored FROM private.workshop_consumables_shadow_history WHERE revision=p_revision;
 IF NOT FOUND OR stored.source_digest IS DISTINCT FROM h OR stored.updated_at IS DISTINCT FROM p_updated_at OR stored.updated_by IS DISTINCT FROM p_updated_by OR private.unpack_workshop_consumables(stored.packed_state) IS DISTINCT FROM p_state THEN RAISE EXCEPTION 'shadow_revision_conflict'; END IF;
END $$;
CREATE OR REPLACE FUNCTION private.read_workshop_consumables_shadow(p_revision bigint)
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY INVOKER SET search_path='' AS $$
DECLARE stored private.workshop_consumables_shadow_history%ROWTYPE; original jsonb;
BEGIN
 SELECT * INTO stored FROM private.workshop_consumables_shadow_history WHERE revision=p_revision;
 IF NOT FOUND THEN RAISE EXCEPTION 'shadow_revision_missing'; END IF;
 original:=private.unpack_workshop_consumables(stored.packed_state);
 IF private.consumables_content_hash(original) IS DISTINCT FROM stored.source_digest THEN RAISE EXCEPTION 'shadow_revision_digest_mismatch'; END IF;
 RETURN jsonb_build_object('revision',stored.revision,'data',original,'updated_at',stored.updated_at,'updated_by',stored.updated_by);
END $$;
REVOKE ALL ON FUNCTION private.store_workshop_consumables_shadow(bigint,jsonb,timestamptz,text),private.read_workshop_consumables_shadow(bigint) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION private.store_workshop_consumables_shadow(bigint,jsonb,timestamptz,text),private.read_workshop_consumables_shadow(bigint) TO service_role;