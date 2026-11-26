-- Service-only read of the immutable archived prefix. No state changes.
CREATE OR REPLACE FUNCTION public.zukait_job_edit_archive_prefix(p_snapshot_revision bigint,p_prefix_count bigint)
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY INVOKER SET search_path='' AS $$
DECLARE n bigint; lo bigint; hi bigint; entries jsonb;
BEGIN
 IF p_snapshot_revision IS NULL OR p_snapshot_revision<0 OR p_prefix_count IS NULL OR p_prefix_count<1 THEN
  RETURN jsonb_build_object('ok',false,'code','invalid_archive_marker');
 END IF;
 SELECT count(*),min(position),max(position),jsonb_agg(payload ORDER BY position)
 INTO n,lo,hi,entries FROM private.workshop_job_edit_audit_baseline WHERE snapshot_revision=p_snapshot_revision;
 IF n<>p_prefix_count OR lo<>1 OR hi<>p_prefix_count THEN
  RETURN jsonb_build_object('ok',false,'code','archive_incomplete');
 END IF;
 RETURN jsonb_build_object('ok',true,'snapshotRevision',p_snapshot_revision,'prefixCount',p_prefix_count,'entries',entries);
END $$;
REVOKE ALL ON FUNCTION public.zukait_job_edit_archive_prefix(bigint,bigint) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.zukait_job_edit_archive_prefix(bigint,bigint) TO service_role;
