-- Atomic conversion of an approved independent Mechanical checklist into a Job Card.
-- A failure rolls back both Job Card creation and checklist linking.
CREATE OR REPLACE FUNCTION public.zukait_mechanical_link_approved(
 p_actor text,p_session_hash text,p_command jsonb
) RETURNS jsonb LANGUAGE plpgsql SECURITY INVOKER SET search_path=pg_catalog AS $fn$
DECLARE c zukait_mechanical.prejob_checklists; incoming jsonb; details jsonb;
 number text; result jsonb; v jsonb;
BEGIN
 PERFORM zukait_mechanical.authorize_session(p_actor,p_session_hash,'MC_CREATE');
 IF p_actor<>'SUP003' AND NOT EXISTS(
  SELECT 1 FROM public.staff_credentials WHERE user_id=p_actor AND role='Manager' AND active
 ) THEN RAISE EXCEPTION 'mechanical_forbidden'; END IF;
 IF jsonb_typeof(p_command) IS DISTINCT FROM 'object'
    OR pg_column_size(p_command)>16000
    OR EXISTS(SELECT 1 FROM jsonb_object_keys(p_command) k
      WHERE k NOT IN ('operation','checklist_id','expected_revision','request_id','command'))
    OR p_command->>'operation'<>'CREATE_LINKED_JOB'
    OR coalesce(p_command->>'checklist_id','') !~*
       '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
 THEN RAISE EXCEPTION 'invalid_mechanical_prejob'; END IF;
 SELECT * INTO c FROM zukait_mechanical.prejob_checklists
  WHERE id=(p_command->>'checklist_id')::uuid FOR UPDATE;
 IF NOT FOUND THEN RAISE EXCEPTION 'mechanical_checklist_missing';END IF;
 IF c.linked_job_card IS NOT NULL THEN RAISE EXCEPTION 'mechanical_checklist_already_linked';END IF;
 IF c.approval_status<>'APPROVED' OR c.revision::text IS DISTINCT FROM p_command->>'expected_revision'
 THEN RAISE EXCEPTION 'mechanical_checklist_not_approved';END IF;
 incoming:=p_command->'command';details:=incoming->'details';v:=c.vehicle;
 IF jsonb_typeof(incoming) IS DISTINCT FROM 'object' OR
    incoming->>'operation'<>'CREATE_DIRECT_JOB' OR
    incoming->>'request_id' IS DISTINCT FROM p_command->>'request_id' OR
    incoming->>'job_type' IS DISTINCT FROM c.job_type OR
    jsonb_typeof(details) IS DISTINCT FROM 'object' OR
    upper(trim(coalesce(details->>'registration',''))) IS DISTINCT FROM c.registration OR
    EXISTS(SELECT 1 FROM unnest(ARRAY['make','model','year','vin','customer','contact']) k
      WHERE trim(coalesce(details->>k,'')) IS DISTINCT FROM trim(coalesce(v->>k,'')))
 THEN RAISE EXCEPTION 'mechanical_checklist_vehicle_mismatch';END IF;
 number:=upper(trim(coalesce(incoming->>'job_card','')));
 IF number='' THEN RAISE EXCEPTION 'reception_invalid_job_number';END IF;
 result:=public.zukait_mechanical_section(p_actor,p_session_hash,
   jsonb_build_object('operation','CREATE_JOB','request_id',p_command->>'request_id','command',incoming));
 IF coalesce(result->>'ok','false')<>'true' OR
    upper(trim(coalesce(result->>'job_card','')))<>number
 THEN RAISE EXCEPTION 'mechanical_job_creation_unconfirmed';END IF;
 UPDATE zukait_mechanical.prejob_checklists SET linked_job_card=number,
   updated_at=now(),revision=revision+1 WHERE id=c.id;
 RETURN jsonb_build_object('ok',true,'job_card',number,'checklist_number',c.checklist_number);
END $fn$;
REVOKE ALL ON FUNCTION public.zukait_mechanical_link_approved(text,text,jsonb) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.zukait_mechanical_link_approved(text,text,jsonb) TO service_role;
