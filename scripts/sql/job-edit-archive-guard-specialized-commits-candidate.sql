-- Production source captured 2026-11-25; compare current definitions before rollout.
-- These functions are absent in the older QA database; integration test on a production-parity QA environment before rollout.
BEGIN;
CREATE OR REPLACE FUNCTION private.commit_workshop_time_changes(p_expected_revision bigint, p_data jsonb, p_changed_by text, p_live jsonb)
 RETURNS jsonb
 LANGUAGE plpgsql
 SET search_path TO 'public'
AS $function$
declare
  v_revision bigint;
  v_current jsonb;
  v_current_updated_at timestamptz;
  v_current_updated_by text;
  v_next bigint;
  v_item jsonb;
  v_ids text[];
  v_saved jsonb;
  v_delta jsonb;
begin
  if p_expected_revision is null then raise exception 'time_expected_revision_required'; end if;
  select revision, data, updated_at, updated_by
    into v_revision, v_current, v_current_updated_at, v_current_updated_by
    from public.workshop_state
   where id = 'main'
   for update;

  if not found then
    return jsonb_build_object('ok', false, 'code', 'missing', 'revision', 0);
  end if;

  if v_revision <> p_expected_revision then
    return jsonb_build_object(
      'ok', false,
      'code', 'conflict',
      'revision', v_revision
    );
  end if;

  p_data := private.normalize_job_edit_archive_candidate(v_current,coalesce(p_data,'{}'::jsonb));

  -- An identical submission is not a new business revision. Keep CAS above this guard.
  v_next := v_revision;
  if v_current is distinct from coalesce(p_data, '{}'::jsonb) then
  v_delta:=private.workshop_time_edit_delta(v_current,p_data);
  if v_delta is null then
    return jsonb_build_object('ok',false,'code','employee_time_compact_unsupported');
  end if;

  v_next := v_revision + 1;

  update public.workshop_state
     set revision = v_next,
         data = coalesce(p_data, '{}'::jsonb),
         updated_at = now(),
         updated_by = p_changed_by
   where id = 'main' returning data into v_saved;
  if v_saved is distinct from p_data then
    v_delta:=private.workshop_time_edit_delta(v_current,v_saved);
  end if;
  if v_delta is null or private.undo_workshop_time_edit(v_saved,v_delta) is distinct from v_current then
    raise exception 'employee_time_compact_projection_changed';
  end if;
  insert into private.workshop_time_edit_revision(prior_revision,prior_updated_at,prior_updated_by,delta)
    values(v_revision,v_current_updated_at,v_current_updated_by,v_delta);
  end if;

  v_ids := array[]::text[];

  for v_item in
    select value from jsonb_array_elements(coalesce(p_live, '[]'::jsonb))
  loop
    if nullif(v_item->>'employee_id','') is null then
      continue;
    end if;

    v_ids := array_append(v_ids, v_item->>'employee_id');

    insert into public.workshop_live_status(
      employee_id, employee_name, department, status,
      job_no, assignment_id, session_id, session_start,
      suggested_minutes, vehicle, registration, overtime,
      state_revision, updated_at, updated_by
    ) values (
      v_item->>'employee_id',
      coalesce(v_item->>'employee_name', v_item->>'employee_id'),
      coalesce(v_item->>'department',''),
      case
        when v_item->>'status' in ('Available','Working','Paused','ID001','Overtime')
          then v_item->>'status'
        else 'Available'
      end,
      nullif(v_item->>'job_no',''),
      nullif(v_item->>'assignment_id',''),
      nullif(v_item->>'session_id',''),
      nullif(v_item->>'session_start','')::bigint,
      coalesce(nullif(v_item->>'suggested_minutes','')::numeric,0),
      coalesce(v_item->>'vehicle',''),
      coalesce(v_item->>'registration',''),
      coalesce((v_item->>'overtime')::boolean,false),
      v_next,
      now(),
      p_changed_by
    )
    on conflict (employee_id) do update set
      employee_name = excluded.employee_name,
      department = excluded.department,
      status = excluded.status,
      job_no = excluded.job_no,
      assignment_id = excluded.assignment_id,
      session_id = excluded.session_id,
      session_start = excluded.session_start,
      suggested_minutes = excluded.suggested_minutes,
      vehicle = excluded.vehicle,
      registration = excluded.registration,
      overtime = excluded.overtime,
      state_revision = excluded.state_revision,
      updated_at = excluded.updated_at,
      updated_by = excluded.updated_by
    where row(workshop_live_status.employee_name, workshop_live_status.department, workshop_live_status.status, workshop_live_status.job_no, workshop_live_status.assignment_id, workshop_live_status.session_id, workshop_live_status.session_start, workshop_live_status.suggested_minutes, workshop_live_status.vehicle, workshop_live_status.registration, workshop_live_status.overtime, workshop_live_status.state_revision, workshop_live_status.updated_by)
      is distinct from row(excluded.employee_name, excluded.department, excluded.status, excluded.job_no, excluded.assignment_id, excluded.session_id, excluded.session_start, excluded.suggested_minutes, excluded.vehicle, excluded.registration, excluded.overtime, excluded.state_revision, excluded.updated_by);
  end loop;

  if coalesce(array_length(v_ids,1),0) = 0 then
    delete from public.workshop_live_status;
  else
    delete from public.workshop_live_status
     where not (employee_id = any(v_ids));
  end if;

  return jsonb_build_object(
    'ok', true,
    'revision', v_next,
    'updated_by', p_changed_by
  );
end;
$function$;
CREATE OR REPLACE FUNCTION public.zukait_commit_workshop_manager_state(p_expected_revision bigint, p_data jsonb, p_changed_by text, p_live jsonb, p_job_no text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SET search_path TO 'public'
AS $function$
declare
  v_revision bigint;
  v_current jsonb;
  v_current_updated_at timestamptz;
  v_current_updated_by text;
  v_next bigint;
  v_item jsonb;
  v_ids text[];
  v_saved jsonb;
  v_delta jsonb;
begin
  if nullif(p_job_no,'') is null or p_expected_revision is null
     or not exists (select from public.staff_credentials where user_id=p_changed_by and active and role='Manager') then
    raise exception 'job_edit_manager_required';
  end if;
  select revision, data, updated_at, updated_by
    into v_revision, v_current, v_current_updated_at, v_current_updated_by
    from public.workshop_state
   where id = 'main'
   for update;

  if not found then
    return jsonb_build_object('ok', false, 'code', 'missing', 'revision', 0);
  end if;

  if v_revision <> p_expected_revision then
    return jsonb_build_object(
      'ok', false,
      'code', 'conflict',
      'revision', v_revision
    );
  end if;

  p_data := private.normalize_job_edit_archive_candidate(v_current,coalesce(p_data,'{}'::jsonb));

  -- An identical submission is not a new business revision. Keep CAS above this guard.
  v_next := v_revision;
  if v_current is distinct from coalesce(p_data, '{}'::jsonb) then
  v_delta := private.workshop_manager_edit_delta(v_current,p_data,p_job_no);
  if v_delta is null then
    raise exception 'manager_job_compact_unsupported';
  end if;

  v_next := v_revision + 1;

  update public.workshop_state
     set revision = v_next,
         data = coalesce(p_data, '{}'::jsonb),
         updated_at = now(),
         updated_by = p_changed_by
   where id = 'main' returning data into v_saved;
  if v_saved is distinct from p_data then
    v_delta := private.workshop_manager_edit_delta(v_current,v_saved,p_job_no);
  end if;
  if v_delta is null or private.undo_workshop_manager_edit(v_saved,v_delta) is distinct from v_current then
    raise exception 'manager_job_compact_trigger_state_changed';
  end if;
  insert into private.workshop_manager_edit_revision(prior_revision,prior_updated_at,prior_updated_by,delta)
  values (v_revision,v_current_updated_at,v_current_updated_by,v_delta);

  end if;

  v_ids := array[]::text[];

  for v_item in
    select value from jsonb_array_elements(coalesce(p_live, '[]'::jsonb))
  loop
    if nullif(v_item->>'employee_id','') is null then
      continue;
    end if;

    v_ids := array_append(v_ids, v_item->>'employee_id');

    insert into public.workshop_live_status(
      employee_id, employee_name, department, status,
      job_no, assignment_id, session_id, session_start,
      suggested_minutes, vehicle, registration, overtime,
      state_revision, updated_at, updated_by
    ) values (
      v_item->>'employee_id',
      coalesce(v_item->>'employee_name', v_item->>'employee_id'),
      coalesce(v_item->>'department',''),
      case
        when v_item->>'status' in ('Available','Working','Paused','ID001','Overtime')
          then v_item->>'status'
        else 'Available'
      end,
      nullif(v_item->>'job_no',''),
      nullif(v_item->>'assignment_id',''),
      nullif(v_item->>'session_id',''),
      nullif(v_item->>'session_start','')::bigint,
      coalesce(nullif(v_item->>'suggested_minutes','')::numeric,0),
      coalesce(v_item->>'vehicle',''),
      coalesce(v_item->>'registration',''),
      coalesce((v_item->>'overtime')::boolean,false),
      v_next,
      now(),
      p_changed_by
    )
    on conflict (employee_id) do update set
      employee_name = excluded.employee_name,
      department = excluded.department,
      status = excluded.status,
      job_no = excluded.job_no,
      assignment_id = excluded.assignment_id,
      session_id = excluded.session_id,
      session_start = excluded.session_start,
      suggested_minutes = excluded.suggested_minutes,
      vehicle = excluded.vehicle,
      registration = excluded.registration,
      overtime = excluded.overtime,
      state_revision = excluded.state_revision,
      updated_at = excluded.updated_at,
      updated_by = excluded.updated_by
    where row(workshop_live_status.employee_name, workshop_live_status.department, workshop_live_status.status, workshop_live_status.job_no, workshop_live_status.assignment_id, workshop_live_status.session_id, workshop_live_status.session_start, workshop_live_status.suggested_minutes, workshop_live_status.vehicle, workshop_live_status.registration, workshop_live_status.overtime, workshop_live_status.state_revision, workshop_live_status.updated_by)
      is distinct from row(excluded.employee_name, excluded.department, excluded.status, excluded.job_no, excluded.assignment_id, excluded.session_id, excluded.session_start, excluded.suggested_minutes, excluded.vehicle, excluded.registration, excluded.overtime, excluded.state_revision, excluded.updated_by);
  end loop;

  if coalesce(array_length(v_ids,1),0) = 0 then
    delete from public.workshop_live_status;
  else
    delete from public.workshop_live_status
     where not (employee_id = any(v_ids));
  end if;

  return jsonb_build_object(
    'ok', true,
    'revision', v_next,
    'updated_by', p_changed_by
  );
end;
$function$;
COMMIT;
