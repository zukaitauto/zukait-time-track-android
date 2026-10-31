-- V377: Mechanical MC_CREATE Cash/Credit-only linked Job Card rule.
-- Isolated QA deployment first. No production backend changes are authorized.
-- Replaces only existing helper; preserves identity and department separation.
CREATE OR REPLACE FUNCTION zukait_mechanical.assert_separate_job(
 p_data jsonb,p_jc text,p_department text
) RETURNS void LANGUAGE plpgsql SECURITY INVOKER SET search_path=pg_catalog AS $guard$
DECLARE matched_job jsonb;
BEGIN
 IF p_department IS NULL THEN RAISE EXCEPTION 'mechanical_policy_required'; END IF;
 IF (SELECT count(*) FROM jsonb_array_elements(coalesce(p_data->'jobs','[]'::jsonb)) j
   WHERE upper(trim(j->>'no'))=upper(trim(p_jc)))<>1 THEN
  RAISE EXCEPTION 'mechanical_job_identity_conflict';
 END IF;
 SELECT j INTO matched_job FROM jsonb_array_elements(coalesce(p_data->'jobs','[]'::jsonb)) j
  WHERE upper(trim(j->>'no'))=upper(trim(p_jc)) LIMIT 1;
 IF upper(trim(coalesce(matched_job->>'jobType',''))) NOT IN ('CASH','CREDIT') THEN
  RAISE EXCEPTION 'mechanical_job_type_not_allowed' USING ERRCODE='22023';
 END IF;
 IF EXISTS(SELECT 1 FROM jsonb_array_elements(coalesce(p_data->'assign','[]'::jsonb)) a
   WHERE upper(trim(a->>'job'))=upper(trim(p_jc))
   AND NOT coalesce((a->>'cancelled')::boolean,false)
   AND NOT EXISTS(SELECT 1 FROM public.staff_credentials c
      WHERE c.user_id=a->>'emp' AND c.role='Employee' AND c.department=p_department))
 THEN RAISE EXCEPTION 'mechanical_mixed_job_not_allowed'; END IF;
END
$guard$;
REVOKE ALL ON FUNCTION zukait_mechanical.assert_separate_job(jsonb,text,text) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION zukait_mechanical.assert_separate_job(jsonb,text,text) TO service_role;
