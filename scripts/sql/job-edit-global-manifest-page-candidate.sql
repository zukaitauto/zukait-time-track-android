-- Install only after manifest candidate; unsealed archives retain full validation.
-- QA only; archive-aware global Manager history read path.
CREATE OR REPLACE FUNCTION private.job_edit_audit_all_page_from_state(p_data jsonb,p_revision bigint,p_before_position bigint,p_limit integer,p_expected_revision bigint)
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY INVOKER SET search_path='' AS $$
DECLARE marker jsonb:=p_data->'jobEditArchive'; edits jsonb:=coalesce(p_data->'jobEdits','[]'::jsonb); prefix_count bigint:=0; source_revision bigint; n bigint; lo bigint; hi bigint; top_position bigint; bottom_position bigint; page_size integer:=greatest(1,least(coalesce(p_limit,50),100)); result jsonb;
BEGIN
 IF p_before_position IS NOT NULL AND (p_before_position<1 OR p_expected_revision IS NULL) THEN RETURN jsonb_build_object('ok',false,'code','invalid_audit_cursor'); END IF;
 IF p_expected_revision IS NOT NULL AND p_expected_revision<>p_revision THEN RETURN jsonb_build_object('ok',false,'code','audit_revision_changed','revision',p_revision); END IF;
 IF jsonb_typeof(edits)<>'array' THEN RETURN jsonb_build_object('ok',false,'code','audit_history_unavailable'); END IF;
 IF marker IS NOT NULL THEN
  IF jsonb_typeof(marker)<>'object' OR coalesce(marker->>'snapshotRevision','') !~ '^[0-9]{1,15}$' OR coalesce(marker->>'prefixCount','') !~ '^[1-9][0-9]{0,14}$' THEN RETURN jsonb_build_object('ok',false,'code','audit_history_unavailable'); END IF;
  source_revision:=(marker->>'snapshotRevision')::bigint; prefix_count:=(marker->>'prefixCount')::bigint;
  IF source_revision>p_revision THEN RETURN jsonb_build_object('ok',false,'code','audit_history_unavailable'); END IF;
  IF EXISTS(SELECT 1 FROM private.workshop_job_edit_archive_manifest m WHERE m.snapshot_revision=source_revision AND m.prefix_count=(marker->>'prefixCount')::bigint) THEN
   NULL;
  ELSE
   SELECT count(*),min(position),max(position) INTO n,lo,hi FROM private.workshop_job_edit_audit_baseline WHERE snapshot_revision=source_revision;
   IF n<>prefix_count OR lo<>1 OR hi<>prefix_count THEN RETURN jsonb_build_object('ok',false,'code','audit_history_unavailable'); END IF;
  END IF;
 END IF;
 top_position:=least(prefix_count+jsonb_array_length(edits),coalesce(p_before_position-1,prefix_count+jsonb_array_length(edits)));
 bottom_position:=greatest(1,top_position-page_size+1);
 SELECT coalesce(jsonb_agg(to_jsonb(q) ORDER BY q.audit_position DESC),'[]'::jsonb) INTO result FROM (
 SELECT position AS audit_position,payload FROM private.workshop_job_edit_audit_baseline WHERE snapshot_revision=source_revision AND position BETWEEN bottom_position AND top_position
 UNION ALL SELECT pos AS audit_position,edits->((pos-prefix_count-1)::integer) AS payload FROM generate_series(greatest(bottom_position,prefix_count+1),top_position) pos
 ) q;
 RETURN jsonb_build_object('ok',true,'revision',p_revision,'rows',result,'next_position',CASE WHEN top_position>=bottom_position AND bottom_position>1 THEN bottom_position ELSE NULL END);
END;
$$;
REVOKE ALL ON FUNCTION private.job_edit_audit_all_page_from_state(jsonb,bigint,bigint,integer,bigint) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION private.job_edit_audit_all_page_from_state(jsonb,bigint,bigint,integer,bigint) TO service_role;
CREATE OR REPLACE FUNCTION public.zukait_job_edit_all_page(p_before_position bigint DEFAULT NULL,p_limit integer DEFAULT 50,p_expected_revision bigint DEFAULT NULL)
RETURNS jsonb LANGUAGE sql STABLE SECURITY INVOKER SET search_path='' AS $$
 SELECT coalesce((SELECT private.job_edit_audit_all_page_from_state(s.data,s.revision,p_before_position,p_limit,p_expected_revision) FROM public.workshop_state s WHERE s.id='main'),jsonb_build_object('ok',false,'code','workshop_state_missing'));
$$;
REVOKE ALL ON FUNCTION public.zukait_job_edit_all_page(bigint,integer,bigint) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.zukait_job_edit_all_page(bigint,integer,bigint) TO service_role;
