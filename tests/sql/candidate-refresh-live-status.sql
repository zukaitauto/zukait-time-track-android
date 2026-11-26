-- Pair with the compact timer writer. Other state updates retain strict refresh behavior.
CREATE OR REPLACE FUNCTION public.zukait_refresh_live_status_from_state(p_data jsonb, p_revision bigint, p_changed_by text)
 RETURNS void
 LANGUAGE plpgsql
 SET search_path TO 'public'
AS $function$
declare
  v_user jsonb;
  v_emp text;
  v_session jsonb;
  v_latest jsonb;
  v_assignment jsonb;
  v_job jsonb;
  v_status text;
  v_ids text[] := array[]::text[];
  v_completed boolean;
  v_cancelled boolean;
  v_overtime boolean;
begin
  for v_user in
    select value
    from jsonb_array_elements(coalesce(p_data->'users','[]'::jsonb))
    where value->>'role' = 'Employee'
  loop
    v_emp := v_user->>'id';
    if nullif(v_emp,'') is null then
      continue;
    end if;

    v_ids := array_append(v_ids, v_emp);
    v_session := null;
    v_latest := null;
    v_assignment := null;
    v_job := null;
    v_status := 'Available';
    v_overtime := false;

    select s
      into v_session
      from jsonb_array_elements(coalesce(p_data->'sessions','[]'::jsonb)) s
     where s->>'emp' = v_emp
       and ((not (s ? 'end')) or s->'end' = 'null'::jsonb or coalesce(s->>'end','') in ('','null','0'))
     order by coalesce(nullif(s->>'start','')::bigint,0) desc,
              coalesce(s->>'id','') desc
     limit 1;

    if v_session is not null then
      if nullif(v_session->>'assignmentId','') is not null then
        select a into v_assignment
          from jsonb_array_elements(coalesce(p_data->'assign','[]'::jsonb)) a
         where a->>'id' = v_session->>'assignmentId'
           and coalesce((nullif(a->>'cancelled',''))::boolean,false) = false
         limit 1;
      end if;

      if v_assignment is null then
        select a into v_assignment
          from jsonb_array_elements(coalesce(p_data->'assign','[]'::jsonb)) a
         where a->>'emp' = v_emp
           and a->>'job' = v_session->>'job'
           and coalesce((nullif(a->>'cancelled',''))::boolean,false) = false
         order by coalesce(nullif(a->>'assignedAt','')::bigint,0) desc
         limit 1;
      end if;

      v_completed := coalesce((nullif(v_assignment->>'completed',''))::boolean,false);
      v_cancelled := coalesce((nullif(v_assignment->>'cancelled',''))::boolean,false);

      if v_session->>'job' = 'ID001' then
        v_status := 'ID001';
      elsif v_assignment is null or v_completed or v_cancelled then
        v_session := null;
        v_assignment := null;
        v_status := 'Available';
      else
        v_overtime :=
          coalesce((nullif(v_session->>'overtime',''))::boolean,false)
          or coalesce((nullif(v_session->>'autoOvertime',''))::boolean,false)
          or coalesce(nullif(v_session->>'overtimeStartedAt','')::bigint,0) > 0;
        v_status := case when v_overtime then 'Overtime' else 'Working' end;
      end if;
    else
      select s
        into v_latest
        from jsonb_array_elements(coalesce(p_data->'sessions','[]'::jsonb)) s
       where s->>'emp' = v_emp
       order by coalesce(nullif(s->>'start','')::bigint,0) desc,
                coalesce(s->>'id','') desc
       limit 1;

      if v_latest is not null
         and coalesce((nullif(v_latest->>'paused',''))::boolean,false) = true
         and v_latest->'end' is not null
         and v_latest->>'end' not in ('','null')
      then
        if nullif(v_latest->>'assignmentId','') is not null then
          select a into v_assignment
            from jsonb_array_elements(coalesce(p_data->'assign','[]'::jsonb)) a
           where a->>'id' = v_latest->>'assignmentId'
             and coalesce((nullif(a->>'cancelled',''))::boolean,false) = false
           limit 1;
        end if;

        if v_assignment is null then
          select a into v_assignment
            from jsonb_array_elements(coalesce(p_data->'assign','[]'::jsonb)) a
           where a->>'emp' = v_emp
             and a->>'job' = v_latest->>'job'
             and coalesce((nullif(a->>'cancelled',''))::boolean,false) = false
           order by coalesce(nullif(a->>'assignedAt','')::bigint,0) desc
           limit 1;
        end if;

        v_completed := coalesce((nullif(v_assignment->>'completed',''))::boolean,false);
        v_cancelled := coalesce((nullif(v_assignment->>'cancelled',''))::boolean,false);

        if v_assignment is not null and not v_completed and not v_cancelled then
          v_session := v_latest;
          v_status := 'Paused';
        else
          v_assignment := null;
          v_status := 'Available';
        end if;
      end if;
    end if;

    if v_session is not null then
      select j into v_job
        from jsonb_array_elements(coalesce(p_data->'jobs','[]'::jsonb)) j
       where j->>'no' = v_session->>'job'
       limit 1;
    end if;

    insert into public.workshop_live_status(
      employee_id, employee_name, department, status,
      job_no, assignment_id, session_id, session_start,
      suggested_minutes, vehicle, registration, overtime,
      state_revision, updated_at, updated_by
    ) values (
      v_emp,
      coalesce(v_user->>'name',v_emp),
      coalesce(v_user->>'department',''),
      v_status,
      case when v_session is null then null else nullif(v_session->>'job','') end,
      case when v_assignment is null then null else nullif(v_assignment->>'id','') end,
      case when v_session is null then null else nullif(v_session->>'id','') end,
      case when v_session is null then null else nullif(v_session->>'start','')::bigint end,
      case when v_assignment is null then 0 else coalesce(nullif(v_assignment->>'suggested','')::numeric,0) end,
      coalesce(v_job->>'vehicle',''),
      coalesce(v_job->>'reg',''),
      v_status = 'Overtime',
      p_revision,
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
    where current_setting('zukait.selective_timer_write', true) IS DISTINCT FROM 'on'
       OR workshop_live_status.state_revision IS NULL
       OR workshop_live_status.state_revision < 1
       OR workshop_live_status.state_revision > excluded.state_revision
       OR row(workshop_live_status.employee_name, workshop_live_status.department, workshop_live_status.status, workshop_live_status.job_no, workshop_live_status.assignment_id, workshop_live_status.session_id, workshop_live_status.session_start, workshop_live_status.suggested_minutes, workshop_live_status.vehicle, workshop_live_status.registration, workshop_live_status.overtime)
      is distinct from row(excluded.employee_name, excluded.department, excluded.status, excluded.job_no, excluded.assignment_id, excluded.session_id, excluded.session_start, excluded.suggested_minutes, excluded.vehicle, excluded.registration, excluded.overtime);
  end loop;

  if coalesce(array_length(v_ids,1),0) = 0 then
    delete from public.workshop_live_status;
  else
    delete from public.workshop_live_status
     where not (employee_id = any(v_ids));
  end if;
end;
$function$
;
