-- Preserve every identity check; rebuild the large snapshot only after processing small arrays.
create or replace function public.zukait_reception_vehicle_state_guard()
returns trigger language plpgsql security invoker set search_path=public as $$
declare r public.workshop_receptions; master jsonb; quotes jsonb;
 jobs jsonb; prior_jobs jsonb; jobs_changed boolean:=false; quotes_changed boolean:=false;
begin
 if new.id<>'main' then return new; end if;
 jobs:=coalesce(new.data->'jobs','[]');
 quotes:=coalesce(new.data->'estimates','[]');
 if tg_op='UPDATE' then prior_jobs:=coalesce(old.data->'jobs','[]');else prior_jobs:='[]';end if;
 for r in select * from public.workshop_receptions where job_card is not null loop
  -- Do not let a stale full-state save unlink or remove a linked job.
  if (select count(*) from jsonb_array_elements(jobs) j where j->>'no'=r.job_card)<>1
   then raise exception 'reception_linked_job_required'; end if;
  master:=public.zukait_reception_job_identity(r);
  select jsonb_agg(case when j->>'no'=r.job_card then
   -- Remove legacy aliases so blank corrections cannot reveal stale fallback values.
   (j-array['vehicleMake','vehicleModel','modelYear','vehicleYear','model_year','vehicle_year','registration','registrationNo','registration_no','VIN','vinNumber','chassis','chassisNo','claimNumber','claim_no','claim','name','phone','customerMobile','insurance_company','job_type'])||master else j end order by n)
   into jobs from jsonb_array_elements(jobs) with ordinality a(j,n);
  jobs_changed:=true;
  if exists(select 1 from public.workshop_reception_estimates q where q.rc_no=r.rc_no and (select count(*) from jsonb_array_elements(quotes) e where e->>'id'=q.estimate_id)<>1)
    then raise exception 'reception_linked_estimate_required'; end if;
  if new.data ? 'estimates' and tg_op='UPDATE' and exists(select 1 from jsonb_array_elements(prior_jobs) j where j->>'no'=r.job_card) then
   select coalesce(jsonb_agg(case when e->>'jobCard'=r.job_card or exists(
     select 1 from public.workshop_reception_estimates q where q.rc_no=r.rc_no and q.estimate_id=e->>'id') then
     e||coalesce((select jsonb_object_agg(k,v) from jsonb_each(jsonb_build_object('receptionNo',r.rc_no,'customerName',master->>'customerName','mobile',master->>'mobile',
      'makeModel',master->>'vehicle','year',master->>'year','registration',master->>'reg',
      'vin',master->>'vin','claimNo',master->>'claimNo','insuranceCompany',master->>'insuranceCompany')) kv(k,v)
      where e ? k or exists(select 1 from public.workshop_reception_estimates q where q.rc_no=r.rc_no and q.estimate_id=e->>'id' and q.identity_snapshot is distinct from public.zukait_reception_identity(r.details,r.insurance_id))),'{}'::jsonb)
     else e end order by n),'[]') into quotes from jsonb_array_elements(quotes) with ordinality a(e,n);
   quotes_changed:=true;
  end if;
 end loop;
 if jobs_changed then new.data:=jsonb_set(new.data,'{jobs}',jobs);end if;
 if quotes_changed then new.data:=jsonb_set(new.data,'{estimates}',quotes);end if;
 return new;
end; $$;

-- Extract each JSON array once before iterating over employees.
create or replace function public.zukait_refresh_live_status_from_state(
  p_data jsonb,
  p_revision bigint,
  p_changed_by text
)
returns void
language plpgsql
security invoker
set search_path = public
as $$
declare
  v_users jsonb; v_sessions jsonb; v_assign jsonb; v_jobs jsonb;
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
  v_users:=coalesce(p_data->'users','[]'::jsonb);
  v_sessions:=coalesce(p_data->'sessions','[]'::jsonb);
  v_assign:=coalesce(p_data->'assign','[]'::jsonb);
  v_jobs:=coalesce(p_data->'jobs','[]'::jsonb);
  for v_user in
    select value
    from jsonb_array_elements(v_users)
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

    select s into v_session
      from jsonb_array_elements(v_sessions) s
     where s->>'emp' = v_emp
       and ((not (s ? 'end')) or s->'end' is null or s->>'end' in ('','null'))
     order by coalesce(nullif(s->>'start','')::bigint,0) desc,
              coalesce(s->>'id','') desc
     limit 1;

    if v_session is not null then
      if nullif(v_session->>'assignmentId','') is not null then
        select a into v_assignment
          from jsonb_array_elements(v_assign) a
         where a->>'id' = v_session->>'assignmentId'
           and coalesce((nullif(a->>'cancelled',''))::boolean,false) = false
         limit 1;
      end if;

      if v_assignment is null then
        select a into v_assignment
          from jsonb_array_elements(v_assign) a
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
      select s into v_latest
        from jsonb_array_elements(v_sessions) s
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
            from jsonb_array_elements(v_assign) a
           where a->>'id' = v_latest->>'assignmentId'
             and coalesce((nullif(a->>'cancelled',''))::boolean,false) = false
           limit 1;
        end if;

        if v_assignment is null then
          select a into v_assignment
            from jsonb_array_elements(v_assign) a
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
        from jsonb_array_elements(v_jobs) j
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
      updated_by = excluded.updated_by;
  end loop;

  if coalesce(array_length(v_ids,1),0) = 0 then
    delete from public.workshop_live_status;
  else
    delete from public.workshop_live_status
     where not (employee_id = any(v_ids));
  end if;
end;
$$;
