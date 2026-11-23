CREATE OR REPLACE FUNCTION public.zukait_commit_workshop_state_v2(p_expected_revision bigint, p_data jsonb, p_changed_by text, p_live jsonb)
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
begin
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
      'revision', v_revision,
      'data', v_current
    );
  end if;

  -- An identical submission is not a new business revision. Keep CAS above this guard.
  v_next := v_revision;
  if v_current is distinct from coalesce(p_data, '{}'::jsonb) then
  insert into public.workshop_state_history(revision,data,updated_at,updated_by)
  values(v_revision,v_current,v_current_updated_at,v_current_updated_by)
  on conflict (revision) do nothing;

  v_next := v_revision + 1;

  update public.workshop_state
     set revision = v_next,
         data = coalesce(p_data, '{}'::jsonb),
         updated_at = now(),
         updated_by = p_changed_by
   where id = 'main';

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
$function$


;
CREATE OR REPLACE FUNCTION public.zukait_v2_report_page(p_report text, p_before timestamp with time zone DEFAULT NULL::timestamp with time zone, p_limit integer DEFAULT 100, p_filters jsonb DEFAULT '{}'::jsonb, p_before_id text DEFAULT NULL::text)
 RETURNS TABLE(event_id text, entity_id text, event_type text, actor_id text, sort_time timestamp with time zone, revision bigint, payload jsonb)
 LANGUAGE sql
 STABLE
 SET search_path TO 'public'
AS $function$
 with q as (select upper(coalesce(p_report,'')) report, nullif(trim(coalesce(p_filters->>'query','')),'') query),
 mapped as (
 select e.* from public.workshop_v2_events e,q
 where (p_before is null or e.server_time<p_before or (e.server_time=p_before and p_before_id is not null and e.event_id<p_before_id)) and (
  q.report='AUDIT' or
  (q.report='REPEAT' and e.event_type like 'REPEAT%') or
  (q.report='ID001' and e.event_type like 'ID001%') or
  (q.report='OVERTIME' and e.event_type like 'OVERTIME%') or
  (q.report='PARTS_DELAY' and (e.event_type like 'SPARE_PART%' or e.event_type='PARTS_DELAY')) or
  (q.report='SPARE_PARTS' and e.event_type like 'SPARE_PART%') or
  (q.report='CONSUMABLES_VARIANCE' and e.event_type like 'CONSUMABLE%') or
  (q.report='JOB_COST' and (e.event_type like 'JOB%' or e.event_type like 'WORK%')) or
  (q.report in ('WIP','CYCLE_TIME','EFFICIENCY','COMPLETION_TARGET') and e.event_type like 'JOB%') or
  (q.report='JOB_SEARCH' and q.query is not null and (e.entity_id ilike '%'||q.query||'%' or coalesce(e.payload->>'jobCard','') ilike '%'||q.query||'%' or coalesce(e.payload->>'registration','') ilike '%'||q.query||'%'))
 ))
 select e.event_id,e.entity_id,e.event_type,e.actor_id,e.server_time,e.revision,e.payload from mapped e order by e.server_time desc, e.event_id desc limit greatest(1,least(coalesce(p_limit,100),500));
$function$


;
CREATE OR REPLACE FUNCTION public.zukait_workshop_revision_probe(p_token_hash text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SET search_path TO 'pg_catalog', 'public'
AS $function$
declare
  v_user jsonb;
  v_last_seen timestamptz;
  v_revision bigint;
  v_updated_at timestamptz;
  v_updated_by text;
begin
  select jsonb_build_object('id', c.user_id, 'name', c.display_name,
           'role', c.role, 'department', c.department), s.last_seen_at
    into v_user, v_last_seen
    from public.staff_sessions s
    join public.staff_credentials c on c.user_id = s.user_id
   where s.token_hash = p_token_hash
     and s.revoked_at is null
     and c.active = true
     and not (c.role in ('Receptionist','Accountant') and coalesce(c.must_change,false))
   limit 1;
  if v_user is null then
    return jsonb_build_object('ok',false,'code','invalid_session');
  end if;

  if v_last_seen is null or v_last_seen <= statement_timestamp()-interval '60 seconds' then
    update public.staff_sessions
       set last_seen_at=statement_timestamp()
     where token_hash=p_token_hash
       and (last_seen_at is null or last_seen_at <= statement_timestamp()-interval '60 seconds');
  end if;

  -- These roles keep their existing restricted API routing in the Edge Function.
  if v_user->>'role' in ('Receptionist','Accountant') then
    return jsonb_build_object('ok',true,'user',v_user);
  end if;

  select revision, updated_at, updated_by
    into v_revision, v_updated_at, v_updated_by
    from public.workshop_state where id='main';
  if not found then
    return jsonb_build_object('ok',false,'code','missing','user',v_user);
  end if;
  return jsonb_build_object('ok',true,'user',v_user,'revision',v_revision,
    'updated_at',v_updated_at,'updated_by',v_updated_by);
end;
$function$


;
CREATE OR REPLACE FUNCTION public.zukait_direct_identity_state()
 RETURNS trigger
 LANGUAGE plpgsql
 SET search_path TO 'public', 'pg_temp'
AS $function$
declare jobs jsonb;
begin
 if new.id='main' then
  select coalesce(jsonb_agg(case when d.job_card is not null then
   (j-'make'-'model'-'brand'-'vehicle'-'year'-'vehicleYear'-'reg'-'vin'-'vinNumber'-'chassis'-'customer'-'customerName'-'mobile'-'customerMobile'-'claimNo'-'claimNumber'-'jobType'-'insuranceCompany'-'insurance'-'creditAccount')||d.identity||'{"directReceptionJob":true}'::jsonb else j end order by n),'[]') into jobs
   from jsonb_array_elements(coalesce(new.data->'jobs','[]')) with ordinality a(j,n)
   left join public.workshop_direct_job_identity d on d.job_card=j->>'no' and not exists(select 1 from public.workshop_receptions where job_card=d.job_card);
  new.data:=jsonb_set(new.data,'{jobs}',jobs);
 end if;
 return new;
end $function$


;
CREATE OR REPLACE FUNCTION public.zukait_reception_cancel_state_guard()
 RETURNS trigger
 LANGUAGE plpgsql
 SET search_path TO 'public'
AS $function$
declare r public.workshop_receptions;c public.workshop_reception_job_cancellations;j jsonb;k text;before_rows jsonb;after_rows jsonb;
begin
 if new.id<>'main' then return new;end if;
 for r in select * from public.workshop_receptions where job_card is not null loop
  select e into j from jsonb_array_elements(coalesce(new.data->'jobs','[]')) e where e->>'no'=r.job_card;
  select * into c from public.workshop_reception_job_cancellations where rc_no=r.rc_no;
  if c.rc_no is null then
   if lower(coalesce(j->>'cancelled','false')) not in ('false','0','') or upper(trim(coalesce(j->>'status',''))) in ('CANCELLED','CANCELED') or upper(trim(coalesce(j->>'workflowStage','')))='CANCELLED' then raise exception 'reception_cancellation_command_required';end if;
  else
   if lower(coalesce(j->>'delivered','false')) not in ('false','0','') or lower(coalesce(j->>'deleted','false')) not in ('false','0','') or lower(coalesce(j->>'archived','false')) not in ('false','0','') then raise exception 'reception_cancelled_job_delivery_forbidden';end if;
   if tg_op='UPDATE' then
    if exists(select 1 from jsonb_array_elements(old.data->'jobs') x where x->>'no'=r.job_card and (x->'qcWorkflow' is distinct from j->'qcWorkflow' or x->'completedAt' is distinct from j->'completedAt')) then raise exception 'reception_cancelled_work_history_protected';end if;
    foreach k in array array['assign','sessions'] loop
     select coalesce(jsonb_agg(e order by e->>'id'),'[]') into before_rows from jsonb_array_elements(coalesce(old.data->k,'[]')) e where e->>'job'=r.job_card or (k='sessions' and e->>'preliminaryLinkedJob'=r.job_card);
     select coalesce(jsonb_agg(e order by e->>'id'),'[]') into after_rows from jsonb_array_elements(coalesce(new.data->k,'[]')) e where e->>'job'=r.job_card or (k='sessions' and e->>'preliminaryLinkedJob'=r.job_card);
     if before_rows is distinct from after_rows then raise exception 'reception_cancelled_work_history_protected';end if;
    end loop;
   end if;
   new.data:=jsonb_set(new.data,'{jobs}',(select jsonb_agg(case when e->>'no'=r.job_card then e||jsonb_build_object('status','Cancelled','workflowStage','CANCELLED','cancelled',true,'cancellationDate',c.cancellation_date,'cancelReason',c.reason,'cancelledBy',c.actor_id,'cancelledByName',c.actor_name,'cancelledAt',floor(extract(epoch from c.recorded_at)*1000)) else e end order by n) from jsonb_array_elements(new.data->'jobs') with ordinality a(e,n)));
  end if;
 end loop;
 return new;
end;$function$


;
CREATE OR REPLACE FUNCTION public.zukait_reception_guard_job_creation()
 RETURNS trigger
 LANGUAGE plpgsql
 SET search_path TO 'public'
AS $function$
declare j jsonb; previous jsonb; prior_data jsonb:='{}'; job_no text;
begin
 if tg_table_name='workshop_v2_events' then
  if new.event_type<>'JOB_CREATED' or upper(coalesce(new.payload->>'jobType',''))<>'INSURANCE' then return new; end if;
  job_no:=coalesce(nullif(new.payload->>'jobCard',''),new.entity_id);
  if not public.zukait_reception_job_approval_valid(job_no,new.payload->>'receptionNo') then
   raise exception 'insurance_job_requires_approved_reception';
  end if;
  return new;
 end if;
 if new.id<>'main' then return new; end if;
 if tg_op='UPDATE' then prior_data:=old.data; end if;
 for j in select value from jsonb_array_elements(coalesce(new.data->'jobs','[]'::jsonb)) loop
  if upper(coalesce(j->>'jobType',''))<>'INSURANCE' then continue; end if;
  job_no:=j->>'no';
  select value into previous from jsonb_array_elements(coalesce(prior_data->'jobs','[]'::jsonb))
   where value->>'no'=job_no limit 1;
  -- Existing insurance jobs retain their historical workflow. Cash/credit jobs
  -- cannot be relabelled as insurance to bypass the reception requirement.
  if upper(coalesce(previous->>'jobType',''))='INSURANCE' then continue; end if;
  if not public.zukait_reception_job_approval_valid(job_no,j->>'receptionNo',new.data) and not (tg_op='UPDATE' and previous is not null and public.zukait_manager_classification_valid(job_no,previous,j,old.revision)) then
   raise exception 'insurance_job_requires_approved_reception';
  end if;
 end loop;
 return new;
end;
$function$


;
CREATE OR REPLACE FUNCTION public.zukait_reception_vehicle_state_guard()
 RETURNS trigger
 LANGUAGE plpgsql
 SET search_path TO 'public'
AS $function$
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
end; $function$


;
CREATE OR REPLACE FUNCTION public.zukait_workshop_state_live_status_trigger()
 RETURNS trigger
 LANGUAGE plpgsql
 SET search_path TO 'public'
AS $function$
begin
  perform public.zukait_refresh_live_status_from_state(
    new.data,
    new.revision,
    coalesce(new.updated_by,'SYSTEM')
  );
  return new;
end;
$function$


;
CREATE OR REPLACE FUNCTION public.zukait_refresh_live_status_from_state(p_data jsonb, p_revision bigint, p_changed_by text)
 RETURNS void
 LANGUAGE plpgsql
 SET search_path TO 'public'
AS $function$
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
$function$


;
