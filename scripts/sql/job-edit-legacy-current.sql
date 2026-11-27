-- Candidate for QA/rollout only. Requires job-edit-archive-round-trip.sql.
-- Only the service role can reconstruct the full audit for a legacy stale save.
CREATE OR REPLACE FUNCTION public.zukait_job_edit_legacy_current(p_expected_revision bigint)
RETURNS jsonb LANGUAGE sql STABLE SECURITY INVOKER SET search_path='' AS $$
 SELECT coalesce((SELECT CASE WHEN revision<>p_expected_revision OR p_expected_revision IS NULL
   THEN jsonb_build_object('ok',false,'code','audit_revision_changed')
   WHEN NOT(data ? 'jobEditArchive') THEN jsonb_build_object('ok',false,'code','audit_history_unavailable')
   ELSE jsonb_build_object('ok',true,'revision',revision,'jobEdits',private.expand_job_edit_archive(data)->'jobEdits') END
 FROM public.workshop_state WHERE id='main'),jsonb_build_object('ok',false,'code','workshop_state_missing'));
$$;
REVOKE ALL ON FUNCTION public.zukait_job_edit_legacy_current(bigint) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.zukait_job_edit_legacy_current(bigint) TO service_role;
