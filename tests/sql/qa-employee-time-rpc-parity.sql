-- QA only. Add missing service-role RPCs without replacing existing functions.
CREATE FUNCTION public.zukait_commit_workshop_employee_time(p_expected_revision bigint, p_data jsonb, p_changed_by text, p_live jsonb)
 RETURNS jsonb
 LANGUAGE plpgsql
 SET search_path TO ''
AS $function$
begin
  if p_expected_revision is null or not exists (
    select from public.staff_credentials where user_id=p_changed_by and active and role='Employee'
  ) then raise exception 'employee_time_forbidden'; end if;
  return private.commit_workshop_time_changes(p_expected_revision,p_data,p_changed_by,p_live);
end;
$function$
;
REVOKE ALL ON FUNCTION public.zukait_commit_workshop_employee_time(bigint,jsonb,text,jsonb) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.zukait_commit_workshop_employee_time(bigint,jsonb,text,jsonb) TO service_role;
CREATE FUNCTION public.zukait_commit_workshop_employee_time_supported(p_expected_revision bigint, p_data jsonb, p_changed_by text, p_live jsonb)
 RETURNS jsonb
 LANGUAGE plpgsql
 SET search_path TO ''
AS $function$
declare saved jsonb;
begin
  begin
    saved:=public.zukait_commit_workshop_employee_time(p_expected_revision,p_data,p_changed_by,p_live);
  exception when raise_exception then
    if sqlerrm<>'employee_time_compact_projection_changed' then raise; end if;
    return public.zukait_commit_workshop_state_v2(p_expected_revision,p_data,p_changed_by,p_live);
  end;
  if saved->>'code'='employee_time_compact_unsupported' then
    return public.zukait_commit_workshop_state_v2(p_expected_revision,p_data,p_changed_by,p_live);
  end if;
  return saved;
end;
$function$
;
REVOKE ALL ON FUNCTION public.zukait_commit_workshop_employee_time_supported(bigint,jsonb,text,jsonb) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.zukait_commit_workshop_employee_time_supported(bigint,jsonb,text,jsonb) TO service_role;
CREATE FUNCTION public.zukait_commit_workshop_employee_time_sections(p_expected_revision bigint, p_sections jsonb, p_changed_by text, p_live jsonb)
 RETURNS jsonb
 LANGUAGE plpgsql
 SET search_path TO ''
AS $function$
declare
  snapshot public.workshop_state%rowtype;
begin
  if jsonb_typeof(p_sections) is distinct from 'object'
     or (p_sections - array['sessions','assign','jobs','employeeTimeActionAudit','lastActions']) <> '{}'::jsonb then
    return jsonb_build_object('ok',false,'code','employee_time_invalid_sections');
  end if;

  select * into snapshot from public.workshop_state where id='main' for update;
  if not found then
    return jsonb_build_object('ok',false,'code','missing','revision',0);
  end if;
  if snapshot.revision is distinct from p_expected_revision then
    return jsonb_build_object('ok',false,'code','conflict','revision',snapshot.revision);
  end if;

  return public.zukait_commit_workshop_employee_time_supported(
    p_expected_revision, snapshot.data || p_sections, p_changed_by, p_live
  );
end;
$function$
;
REVOKE ALL ON FUNCTION public.zukait_commit_workshop_employee_time_sections(bigint,jsonb,text,jsonb) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.zukait_commit_workshop_employee_time_sections(bigint,jsonb,text,jsonb) TO service_role;
