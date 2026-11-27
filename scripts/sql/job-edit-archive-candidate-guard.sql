-- Server-side normalization helper. Do not wire as a trigger: recovery deltas
-- must be calculated against the normalized candidate before any commit.
CREATE OR REPLACE FUNCTION private.normalize_job_edit_archive_candidate(
 p_current jsonb,p_candidate jsonb
) RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY INVOKER SET search_path='' AS $$
DECLARE
 marker jsonb := p_current->'jobEditArchive';
 old_tail jsonb := coalesce(p_current->'jobEdits','[]'::jsonb);
 incoming jsonb := coalesce(p_candidate->'jobEdits','[]'::jsonb);
 prefix_count bigint; source_revision bigint; n bigint; lo bigint; hi bigint;
 archived_prefix jsonb; remainder jsonb;
BEGIN
 IF jsonb_typeof(p_current) IS DISTINCT FROM 'object' OR jsonb_typeof(p_candidate) IS DISTINCT FROM 'object' THEN
  RAISE EXCEPTION 'job_edit_archive_invalid_state';
 END IF;
 IF marker IS NULL THEN
  IF p_candidate ? 'jobEditArchive' THEN RAISE EXCEPTION 'job_edit_archive_marker_forbidden'; END IF;
  RETURN p_candidate;
 END IF;
 IF jsonb_typeof(marker) IS DISTINCT FROM 'object'
    OR coalesce(marker->>'snapshotRevision','') !~ '^[0-9]{1,15}$'
    OR coalesce(marker->>'prefixCount','') !~ '^[1-9][0-9]{0,14}$'
    OR jsonb_typeof(old_tail) IS DISTINCT FROM 'array'
    OR jsonb_typeof(incoming) IS DISTINCT FROM 'array' THEN
  RAISE EXCEPTION 'job_edit_archive_invalid_state';
 END IF;
 prefix_count := (marker->>'prefixCount')::bigint;
 source_revision := (marker->>'snapshotRevision')::bigint;
 SELECT count(*),min(position),max(position) INTO n,lo,hi
 FROM private.workshop_job_edit_audit_baseline WHERE snapshot_revision=source_revision;
 IF n<>prefix_count OR lo<>1 OR hi<>prefix_count THEN RAISE EXCEPTION 'job_edit_archive_missing_prefix'; END IF;

 IF p_candidate ? 'jobEditArchive' THEN
  IF p_candidate->'jobEditArchive' IS DISTINCT FROM marker THEN RAISE EXCEPTION 'job_edit_archive_marker_changed'; END IF;
  remainder := incoming;
 ELSE
  -- Legacy full snapshots may only be compacted when the original archived
  -- prefix is an exact ordered match, including multiplicity.
  IF jsonb_array_length(incoming)<prefix_count THEN RAISE EXCEPTION 'job_edit_archive_refresh_required'; END IF;
  IF EXISTS(SELECT 1 FROM private.workshop_job_edit_audit_baseline b
      WHERE b.snapshot_revision=source_revision
        AND incoming->((b.position-1)::integer) IS DISTINCT FROM b.payload)
  THEN RAISE EXCEPTION 'job_edit_archive_refresh_required'; END IF;
  SELECT coalesce(jsonb_agg(e.payload ORDER BY e.pos),'[]'::jsonb) INTO remainder
  FROM jsonb_array_elements(incoming) WITH ORDINALITY e(payload,pos) WHERE e.pos>prefix_count;
 END IF;

 -- A compact candidate must preserve every existing tail record in order.
 IF jsonb_array_length(remainder)<jsonb_array_length(old_tail)
   OR EXISTS(SELECT 1 FROM jsonb_array_elements(old_tail) WITH ORDINALITY e(payload,pos)
     WHERE remainder->((e.pos-1)::integer) IS DISTINCT FROM e.payload)
 THEN RAISE EXCEPTION 'job_edit_archive_refresh_required'; END IF;

 -- Reject a reintroduced full prefix (or appended copy of it) with a marker.
 -- Never deduplicate individual equal-valued audit records.
 IF jsonb_array_length(remainder)-jsonb_array_length(old_tail)>=prefix_count THEN
   SELECT jsonb_agg(b.payload ORDER BY b.position) INTO archived_prefix
   FROM private.workshop_job_edit_audit_baseline b WHERE b.snapshot_revision=source_revision;
   IF EXISTS(SELECT 1 FROM generate_series(jsonb_array_length(old_tail),jsonb_array_length(remainder)-prefix_count) AS start(pos)
     WHERE NOT EXISTS(SELECT 1 FROM jsonb_array_elements(archived_prefix) WITH ORDINALITY e(payload,ord)
       WHERE remainder->((start.pos+e.ord-1)::integer) IS DISTINCT FROM e.payload))
   THEN RAISE EXCEPTION 'job_edit_archive_duplicate_prefix'; END IF;
 END IF;
 RETURN jsonb_set(jsonb_set(p_candidate,'{jobEdits}',remainder,true),'{jobEditArchive}',marker,true);
END;
$$;
REVOKE ALL ON FUNCTION private.normalize_job_edit_archive_candidate(jsonb,jsonb) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION private.normalize_job_edit_archive_candidate(jsonb,jsonb) TO service_role;