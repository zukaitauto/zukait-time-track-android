-- Lossless audit codec for archive storage only. The active state and
-- existing costing/stock APIs keep their current audit format.
CREATE OR REPLACE FUNCTION private.decode_consumables_audit_v1(p_encoded jsonb)
RETURNS jsonb LANGUAGE plpgsql IMMUTABLE SECURITY INVOKER SET search_path='' AS $$
DECLARE row jsonb; restored jsonb; result jsonb;
BEGIN
 IF jsonb_typeof(p_encoded) IS DISTINCT FROM 'object' OR p_encoded->>'version' IS DISTINCT FROM '1' OR jsonb_typeof(p_encoded->'rows') IS DISTINCT FROM 'array' THEN RAISE EXCEPTION 'invalid_consumables_audit_archive'; END IF;
 result:='[]'::jsonb;
 FOR row IN SELECT value FROM jsonb_array_elements(p_encoded->'rows') LOOP
   IF row->>'kind'='full' AND row?'row' THEN restored:=row->'row';
   ELSIF row->>'kind'='before_delta' AND jsonb_typeof(row->'row')='object' AND jsonb_typeof(row->'row'->'after')='object' AND NOT ((row->'row')?'before') AND jsonb_typeof(row->'old')='object' AND jsonb_typeof(row->'remove')='array' THEN
      restored:=(row->'row')||jsonb_build_object('before',(((row->'row'->'after')-array(SELECT jsonb_array_elements_text(row->'remove')))||(row->'old')));
   ELSE RAISE EXCEPTION 'invalid_consumables_audit_entry';
   END IF;
   result:=result||jsonb_build_array(restored);
 END LOOP;
 RETURN result;
END $$;
CREATE OR REPLACE FUNCTION private.encode_consumables_audit_v1(p_audit jsonb)
RETURNS jsonb LANGUAGE plpgsql IMMUTABLE SECURITY INVOKER SET search_path='' AS $$
DECLARE row jsonb; full_row jsonb; candidate jsonb; result jsonb; output jsonb;
BEGIN
 IF jsonb_typeof(p_audit) IS DISTINCT FROM 'array' THEN RAISE EXCEPTION 'invalid_consumables_audit_source'; END IF;
 result:='[]'::jsonb;
 FOR row IN SELECT value FROM jsonb_array_elements(p_audit) LOOP
   full_row:=jsonb_build_object('kind','full','row',row);
   candidate:=full_row;
   IF jsonb_typeof(row->'before')='object' AND jsonb_typeof(row->'after')='object' THEN
     candidate:=jsonb_build_object('kind','before_delta','row',row-'before',
       'old',coalesce((SELECT jsonb_object_agg(k,v) FROM jsonb_each(row->'before') e(k,v) WHERE (row->'after')->k IS DISTINCT FROM v),'{}'::jsonb),
       'remove',coalesce((SELECT jsonb_agg(k ORDER BY k) FROM jsonb_object_keys(row->'after') k WHERE NOT ((row->'before')?k)),'[]'::jsonb));
     IF octet_length(candidate::text)>=octet_length(full_row::text) THEN candidate:=full_row; END IF;
   END IF;
   result:=result||jsonb_build_array(candidate);
 END LOOP;
 output:=jsonb_build_object('version',1,'rows',result);
 IF private.decode_consumables_audit_v1(output) IS DISTINCT FROM p_audit THEN RAISE EXCEPTION 'consumables_audit_round_trip_failed'; END IF;
 RETURN output;
END $$;
REVOKE ALL ON FUNCTION private.decode_consumables_audit_v1(jsonb),private.encode_consumables_audit_v1(jsonb) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION private.decode_consumables_audit_v1(jsonb),private.encode_consumables_audit_v1(jsonb) TO service_role;