-- Pure snapshot transformation; no production table updates.
CREATE OR REPLACE FUNCTION private.expand_job_edit_archive(p_state jsonb)
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY INVOKER SET search_path='' AS $$
DECLARE marker jsonb:=p_state->'jobEditArchive'; r bigint; n bigint; actual bigint; lo bigint; hi bigint; prefix jsonb;
BEGIN
 IF marker IS NULL THEN RETURN p_state; END IF;
 IF jsonb_typeof(marker) IS DISTINCT FROM 'object' OR coalesce(marker->>'snapshotRevision','') !~ '^[0-9]{1,15}$' OR coalesce(marker->>'prefixCount','') !~ '^[1-9][0-9]{0,14}$' OR jsonb_typeof(p_state->'jobEdits') IS DISTINCT FROM 'array' THEN RAISE EXCEPTION 'invalid_archive_marker'; END IF;
 r:=(marker->>'snapshotRevision')::bigint;n:=(marker->>'prefixCount')::bigint;
 SELECT count(*),min(position),max(position),jsonb_agg(payload ORDER BY position) INTO actual,lo,hi,prefix FROM private.workshop_job_edit_audit_baseline WHERE snapshot_revision=r;
 IF actual<>n OR lo<>1 OR hi<>n THEN RAISE EXCEPTION 'archive_incomplete'; END IF;
 RETURN jsonb_set(p_state-'jobEditArchive','{jobEdits}',prefix||(p_state->'jobEdits'));
END $$;
CREATE OR REPLACE FUNCTION private.preview_compact_job_edit_archive(p_state jsonb,p_source_revision bigint)
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY INVOKER SET search_path='' AS $$
DECLARE n bigint;lo bigint;hi bigint; tail jsonb; compact jsonb;
BEGIN
 IF p_state ? 'jobEditArchive' OR jsonb_typeof(p_state->'jobEdits') IS DISTINCT FROM 'array' THEN RAISE EXCEPTION 'invalid_source_state'; END IF;
 SELECT count(*),min(position),max(position) INTO n,lo,hi FROM private.workshop_job_edit_audit_baseline WHERE snapshot_revision=p_source_revision;
 IF n<1 OR lo<>1 OR hi<>n OR n>jsonb_array_length(p_state->'jobEdits') THEN RAISE EXCEPTION 'archive_incomplete'; END IF;
 IF EXISTS(SELECT 1 FROM private.workshop_job_edit_audit_baseline b WHERE snapshot_revision=p_source_revision AND b.payload IS DISTINCT FROM (p_state->'jobEdits')->((b.position-1)::integer)) THEN RAISE EXCEPTION 'archive_prefix_mismatch'; END IF;
 SELECT coalesce(jsonb_agg(e.payload ORDER BY e.pos),'[]'::jsonb) INTO tail FROM jsonb_array_elements(p_state->'jobEdits') WITH ORDINALITY e(payload,pos) WHERE pos>n;
 compact:=jsonb_set(jsonb_set(p_state,'{jobEdits}',tail),'{jobEditArchive}',jsonb_build_object('snapshotRevision',p_source_revision,'prefixCount',n));
 IF private.expand_job_edit_archive(compact) IS DISTINCT FROM p_state THEN RAISE EXCEPTION 'archive_round_trip_mismatch'; END IF;
 RETURN compact;
END $$;
REVOKE ALL ON FUNCTION private.expand_job_edit_archive(jsonb),private.preview_compact_job_edit_archive(jsonb,bigint) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION private.expand_job_edit_archive(jsonb),private.preview_compact_job_edit_archive(jsonb,bigint) TO service_role;