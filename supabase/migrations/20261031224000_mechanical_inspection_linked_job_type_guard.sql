-- V377: Revalidate linked Mechanical Job Card type for EVERY inspection read/save.
-- Called inside authenticated server-only inspection RPCs, not by a client.
-- This is an isolated QA candidate; production activation requires owner approval.
CREATE OR REPLACE FUNCTION zukait_mechanical.inspection_authorize(
 p_actor text,p_session_hash text,p_checklist uuid
) RETURNS void LANGUAGE plpgsql SECURITY INVOKER SET search_path=pg_catalog AS $auth$
DECLARE role_name text; linked_job text; jobs jsonb;
BEGIN
 PERFORM zukait_mechanical.authorize_session(p_actor,p_session_hash,'MC_CREATE');
 SELECT role INTO role_name FROM public.staff_credentials
  WHERE user_id=p_actor AND active FOR SHARE;
 IF role_name IS DISTINCT FROM 'Manager'
    AND NOT (p_actor='SUP003' AND role_name IN ('Supervisor','Mechanical Supervisor')) THEN
   RAISE EXCEPTION 'mechanical_forbidden' USING ERRCODE='42501';
 END IF;
 SELECT c.job_card INTO linked_job FROM zukait_mechanical.checklists c
  WHERE c.id=p_checklist FOR SHARE;
 IF p_checklist IS NULL OR NOT FOUND THEN
   RAISE EXCEPTION 'inspection_checklist_not_found' USING ERRCODE='P0002';
 END IF;
 -- Lock the authoritative workshop row until the read/save transaction ends:
 -- a simultaneous Job Card type edit cannot race past this authorization.
 SELECT ws.data->'jobs' INTO jobs FROM public.workshop_state ws
  WHERE ws.id='main' FOR SHARE;
 IF NOT FOUND OR jsonb_typeof(jobs) IS DISTINCT FROM 'array' OR
    (SELECT count(*) FROM jsonb_array_elements(jobs) j
      WHERE upper(trim(j->>'no'))=upper(trim(linked_job))
        AND upper(trim(coalesce(j->>'jobType',''))) IN ('CASH','CREDIT'))<>1 OR
    (SELECT count(*) FROM jsonb_array_elements(jobs) j
      WHERE upper(trim(j->>'no'))=upper(trim(linked_job)) )<>1 THEN
   RAISE EXCEPTION 'mechanical_job_type_not_allowed' USING ERRCODE='22023';
 END IF;
END
$auth$;
REVOKE ALL ON FUNCTION zukait_mechanical.inspection_authorize(text,text,uuid) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION zukait_mechanical.inspection_authorize(text,text,uuid) TO service_role;
