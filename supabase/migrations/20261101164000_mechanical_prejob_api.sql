-- Isolated checklist-first API: no direct creation of Job Cards.
-- All RPC access is service-role only and checks the authenticated staff session.
CREATE OR REPLACE FUNCTION public.zukait_mechanical_prejob(
 p_actor text, p_session_hash text, p_command jsonb
) RETURNS jsonb LANGUAGE plpgsql SECURITY INVOKER SET search_path=pg_catalog AS $fn$
DECLARE op text:=p_command->>'operation'; role_name text; existing zukait_mechanical.prejob_checklists;
 item_id uuid; v_type text; v_reg text; v_vehicle jsonb; v_inspection jsonb; v_notes text;
BEGIN
 PERFORM zukait_mechanical.authorize_session(p_actor,p_session_hash,'MC_CREATE');
 SELECT role INTO role_name FROM public.staff_credentials WHERE user_id=p_actor AND active;
 IF role_name IS DISTINCT FROM 'Manager'
    AND NOT (p_actor='SUP003' AND role_name IN ('Supervisor','Mechanical Supervisor')) THEN
  RAISE EXCEPTION 'mechanical_forbidden' USING ERRCODE='42501';
 END IF;
 IF jsonb_typeof(p_command) IS DISTINCT FROM 'object' OR pg_column_size(p_command)>30000
    OR op NOT IN ('CREATE','LIST','APPROVE') THEN
  RAISE EXCEPTION 'invalid_mechanical_prejob';
 END IF;
 IF op='LIST' THEN
  IF EXISTS(SELECT 1 FROM jsonb_object_keys(p_command) k WHERE k NOT IN ('operation','query')) THEN RAISE EXCEPTION 'invalid_mechanical_prejob';END IF;
  RETURN jsonb_build_object('ok',true,'checklists',COALESCE((
   SELECT jsonb_agg(to_jsonb(c) ORDER BY c.created_at DESC)
   FROM (SELECT * FROM zukait_mechanical.prejob_checklists
    WHERE (coalesce(trim(p_command->>'query'),'')='' OR
       registration ILIKE '%'||trim(p_command->>'query')||'%' OR
       checklist_number ILIKE '%'||trim(p_command->>'query')||'%')
    ORDER BY created_at DESC LIMIT 100) c
  ),'[]'::jsonb));
 END IF;
 IF op='CREATE' THEN
  IF EXISTS(SELECT 1 FROM jsonb_object_keys(p_command) k
     WHERE k NOT IN ('operation','id','job_type','registration','vehicle','inspection','work_description')) THEN RAISE EXCEPTION 'invalid_mechanical_prejob';END IF;
  IF coalesce(p_command->>'id','') !~* '^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$' THEN RAISE EXCEPTION 'mechanical_request_required';END IF;
  item_id:=(p_command->>'id')::uuid;
  v_type:=upper(trim(coalesce(p_command->>'job_type','')));
  v_reg:=upper(trim(coalesce(p_command->>'registration','')));
  v_vehicle:=p_command->'vehicle';v_inspection:=coalesce(p_command->'inspection','{}'::jsonb);
  v_notes:=trim(coalesce(p_command->>'work_description',''));
  IF v_type NOT IN ('CASH','CREDIT') OR length(v_reg) NOT BETWEEN 1 AND 80
     OR jsonb_typeof(v_vehicle) IS DISTINCT FROM 'object'
     OR jsonb_typeof(v_inspection) IS DISTINCT FROM 'object'
     OR length(v_notes)>2000 THEN RAISE EXCEPTION 'mechanical_prejob_invalid_fields';END IF;
  SELECT * INTO existing FROM zukait_mechanical.prejob_checklists WHERE id=item_id;
  IF FOUND THEN
   IF existing.created_by<>p_actor OR existing.job_type<>v_type OR existing.registration<>v_reg
      OR existing.vehicle<>v_vehicle OR existing.inspection<>v_inspection OR existing.work_description<>v_notes
     THEN RAISE EXCEPTION 'mechanical_request_reused';END IF;
   RETURN jsonb_build_object('ok',true,'duplicate',true,'checklist',to_jsonb(existing));
  END IF;
  INSERT INTO zukait_mechanical.prejob_checklists
   (id,checklist_number,registration,job_type,vehicle,inspection,work_description,created_by)
  VALUES(item_id,'MC-P'||lpad(nextval('zukait_mechanical.prejob_checklist_seq')::text,6,'0'),
    v_reg,v_type,v_vehicle,v_inspection,v_notes,p_actor)
  RETURNING * INTO existing;
  RETURN jsonb_build_object('ok',true,'checklist',to_jsonb(existing));
 END IF;
 IF op='APPROVE' THEN
  IF EXISTS(SELECT 1 FROM jsonb_object_keys(p_command) k
     WHERE k NOT IN ('operation','id','expected_revision','approved','note')) THEN RAISE EXCEPTION 'invalid_mechanical_prejob';END IF;
  item_id:=(p_command->>'id')::uuid;
  SELECT * INTO existing FROM zukait_mechanical.prejob_checklists WHERE id=item_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'mechanical_checklist_missing';END IF;
  IF existing.linked_job_card IS NOT NULL THEN RAISE EXCEPTION 'mechanical_checklist_already_linked';END IF;
  IF existing.approval_status<>'PENDING' OR existing.revision IS DISTINCT FROM (p_command->>'expected_revision')::int
     THEN RAISE EXCEPTION 'mechanical_revision_conflict';END IF;
  IF jsonb_typeof(p_command->'approved') IS DISTINCT FROM 'boolean' OR
     length(trim(coalesce(p_command->>'note',''))) NOT BETWEEN 3 AND 1000 THEN RAISE EXCEPTION 'mechanical_approval_evidence_required';END IF;
  UPDATE zukait_mechanical.prejob_checklists
   SET approval_status=CASE WHEN (p_command->>'approved')::boolean THEN 'APPROVED' ELSE 'DECLINED' END,
       approval_note=trim(p_command->>'note'),
       approved_at=CASE WHEN (p_command->>'approved')::boolean THEN now() ELSE NULL END,
       revision=revision+1,updated_at=now()
   WHERE id=item_id RETURNING * INTO existing;
  RETURN jsonb_build_object('ok',true,'checklist',to_jsonb(existing));
 END IF;
 RAISE EXCEPTION 'invalid_mechanical_prejob';
END $fn$;
REVOKE ALL ON FUNCTION public.zukait_mechanical_prejob(text,text,jsonb) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.zukait_mechanical_prejob(text,text,jsonb) TO service_role;
