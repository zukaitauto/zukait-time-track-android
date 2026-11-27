-- Shadow architecture: immutable individual record versions and deduplicated
-- manifests. No changes to the operational workshop_state or its save paths.
CREATE TABLE private.consumables_record_versions (
  content_hash text PRIMARY KEY CHECK (content_hash ~ '^[0-9a-f]{64}$'),
  payload jsonb NOT NULL
);
CREATE TABLE private.consumables_manifests (
  manifest_hash text PRIMARY KEY CHECK (manifest_hash ~ '^[0-9a-f]{64}$'),
  manifest jsonb NOT NULL
);
ALTER TABLE private.consumables_record_versions ENABLE ROW LEVEL SECURITY;
ALTER TABLE private.consumables_manifests ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON private.consumables_record_versions,private.consumables_manifests FROM PUBLIC,anon,authenticated,service_role;
GRANT SELECT,INSERT ON private.consumables_record_versions,private.consumables_manifests TO service_role;
CREATE FUNCTION private.consumables_content_hash(p_value jsonb)
RETURNS text LANGUAGE sql IMMUTABLE STRICT SECURITY INVOKER SET search_path='' AS $$
 SELECT encode(sha256(convert_to(p_value::text,'UTF8')),'hex');
$$;
CREATE FUNCTION private.read_consumables_manifest(p_hash text)
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY INVOKER SET search_path='' AS $$
DECLARE m jsonb; output jsonb; collection record; refs jsonb; restored jsonb; expected bigint; actual bigint;
BEGIN
 SELECT manifest INTO m FROM private.consumables_manifests WHERE manifest_hash=p_hash;
 IF NOT FOUND OR private.consumables_content_hash(m) IS DISTINCT FROM p_hash THEN RAISE EXCEPTION 'consumables_manifest_missing_or_invalid'; END IF;
 IF jsonb_typeof(m->'metadata') IS DISTINCT FROM 'object' OR jsonb_typeof(m->'collections') IS DISTINCT FROM 'object' THEN RAISE EXCEPTION 'consumables_manifest_invalid'; END IF;
 output:=m->'metadata';
 FOR collection IN SELECT key,value FROM jsonb_each(m->'collections') LOOP
   refs:=collection.value;
   IF jsonb_typeof(refs) IS DISTINCT FROM 'array' THEN RAISE EXCEPTION 'consumables_refs_invalid'; END IF;
   expected:=jsonb_array_length(refs);
   SELECT count(v.content_hash),coalesce(jsonb_agg(v.payload ORDER BY e.pos),'[]'::jsonb) INTO actual,restored
   FROM jsonb_array_elements_text(refs) WITH ORDINALITY e(hash,pos)
   JOIN private.consumables_record_versions v ON v.content_hash=e.hash AND private.consumables_content_hash(v.payload)=v.content_hash;
   IF actual<>expected THEN RAISE EXCEPTION 'consumables_record_missing_or_invalid'; END IF;
   output:=jsonb_set(output,ARRAY[collection.key],restored,true);
 END LOOP;
 RETURN output;
END $$;
CREATE FUNCTION private.store_consumables_manifest(p_data jsonb)
RETURNS text LANGUAGE plpgsql VOLATILE SECURITY INVOKER SET search_path='' AS $$
DECLARE meta jsonb; collections jsonb:='{}'; section record; row_data record; refs jsonb; h text; stored jsonb; m jsonb; mh text;
BEGIN
 IF jsonb_typeof(p_data) IS DISTINCT FROM 'object' THEN RAISE EXCEPTION 'invalid_consumables_state'; END IF;
 meta:=p_data;
 FOR section IN SELECT key,value FROM jsonb_each(p_data) WHERE jsonb_typeof(value)='array' LOOP
   refs:='[]'::jsonb;
   FOR row_data IN SELECT value,pos FROM jsonb_array_elements(section.value) WITH ORDINALITY e(value,pos) ORDER BY pos LOOP
     h:=private.consumables_content_hash(row_data.value);
     INSERT INTO private.consumables_record_versions(content_hash,payload) VALUES(h,row_data.value) ON CONFLICT DO NOTHING;
     SELECT payload INTO stored FROM private.consumables_record_versions WHERE content_hash=h;
     IF NOT FOUND OR stored IS DISTINCT FROM row_data.value THEN RAISE EXCEPTION 'consumables_hash_collision'; END IF;
     refs:=refs||jsonb_build_array(h);
   END LOOP;
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
REVOKE ALL ON FUNCTION private.consumables_content_hash(jsonb),private.read_consumables_manifest(text),private.store_consumables_manifest(jsonb) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION private.consumables_content_hash(jsonb),private.read_consumables_manifest(text),private.store_consumables_manifest(jsonb) TO service_role;