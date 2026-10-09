-- SCHEMA ONLY fixture captured from PostgreSQL 17 on 2026-10-09.
-- Never load into Supabase or an existing workshop database. No production rows.
set check_function_bodies=off;
create role anon nologin;
create role authenticated nologin;
create role service_role nologin bypassrls;
create extension if not exists pgcrypto;
create sequence public.workshop_v2_estimate_no_seq start 1 increment 1 minvalue 1 maxvalue 9223372036854775807 cache 1 no cycle;
create sequence public.workshop_v2_spare_part_list_no_seq start 1 increment 1 minvalue 1 maxvalue 9223372036854775807 cache 1 no cycle;
create table public.staff_credentials (user_id text not null, display_name text not null, role text not null, department text not null, password_hash text not null, password_salt text not null, password_iterations integer not null default 210000, active boolean not null default true, must_change boolean not null default true, failed_attempts integer not null default 0, locked_until timestamp with time zone, updated_at timestamp with time zone not null default now());
create table public.workshop_live_status (employee_id text not null, employee_name text not null, department text not null default ''::text, status text not null, job_no text, assignment_id text, session_id text, session_start bigint, suggested_minutes numeric not null default 0, vehicle text not null default ''::text, registration text not null default ''::text, overtime boolean not null default false, state_revision bigint not null, updated_at timestamp with time zone not null default now(), updated_by text);
create table public.workshop_state (id text not null, revision bigint not null default 0, data jsonb not null default '{}'::jsonb, updated_at timestamp with time zone not null default now(), updated_by text);
create table public.workshop_state_history (revision bigint not null, data jsonb not null, updated_at timestamp with time zone, updated_by text, archived_at timestamp with time zone not null default now());
create table public.workshop_v2_assignments (assignment_id text not null, job_card text not null, employee_id text not null, status text not null default 'ASSIGNED'::text, suggested_minutes integer not null default 0, assigned_at timestamp with time zone not null default now(), updated_at timestamp with time zone not null default now(), revision bigint not null default 0, last_event_id text);
create table public.workshop_v2_calendar (work_date date not null, is_public_holiday boolean not null default false, label text not null default ''::text, updated_at timestamp with time zone not null default now(), updated_by text);
create table public.workshop_v2_estimate_numbers (estimate_no text not null, sequence_no bigint not null, client_key text not null, created_at timestamp with time zone not null default now(), created_by text);
create table public.workshop_v2_events (event_id text not null, entity_id text not null, actor_id text, device_id text, event_type text not null, client_time timestamp with time zone, server_time timestamp with time zone not null default now(), revision bigint, payload jsonb not null default '{}'::jsonb);
create table public.workshop_v2_jobcards (job_card text not null, registration text not null default ''::text, vehicle_make text not null default ''::text, vehicle_model text not null default ''::text, vehicle_year integer, workflow_stage text not null default 'CREATED'::text, status text not null default 'OPEN'::text, created_at timestamp with time zone not null default now(), updated_at timestamp with time zone not null default now(), completed_at timestamp with time zone, revision bigint not null default 0, last_event_id text);
create table public.workshop_v2_leave (leave_id text not null, employee_id text not null, leave_date date not null, period text not null, cancelled boolean not null default false, updated_at timestamp with time zone not null default now(), updated_by text);
create table public.workshop_v2_pilot (id text not null, device_id text not null, actor_id text not null, active boolean not null default true, claimed_at timestamp with time zone not null default now(), updated_at timestamp with time zone not null default now());
create table public.workshop_v2_preliminary_links (session_id text not null, job_card text not null, source_job text not null default 'ID001'::text, linked_event_id text not null, linked_by text, linked_at timestamp with time zone not null default now(), reversed_event_id text, reversed_by text, reversed_at timestamp with time zone, reversal_reason text);
create table public.workshop_v2_spare_part_list_numbers (list_no text not null, sequence_no bigint not null, job_card text not null, status text not null default 'OPEN'::text, created_at timestamp with time zone not null default now(), created_by text, client_key text not null);
create table public.workshop_v2_spare_part_state (part_id text not null, list_no text not null, job_card text not null, part_name text not null default ''::text, part_no text not null default ''::text, part_key text not null, status text not null default 'LISTED'::text, ordered_qty numeric not null default 1, received_qty numeric not null default 0, revision bigint not null default 0, last_event_id text not null, updated_at timestamp with time zone not null default now());
create table public.workshop_v2_spare_part_state_conflicts (list_no text not null, part_key text not null, part_ids text[] not null, detected_at timestamp with time zone not null default now());
create table public.workshop_v2_work_sessions (session_id text not null, assignment_id text not null, job_card text not null default ''::text, employee_id text not null, kind text not null default 'WORK'::text, started_at timestamp with time zone not null, ended_at timestamp with time zone, status text not null default 'ACTIVE'::text, suggested_minutes integer not null default 0, actual_minutes integer not null default 0, overtime_minutes integer not null default 0, repeat_minutes integer not null default 0, active_since timestamp with time zone, accumulated_minutes integer not null default 0, last_event_id text, revision bigint not null default 0, updated_at timestamp with time zone not null default now());
alter table public.staff_credentials add constraint staff_credentials_pkey PRIMARY KEY (user_id);
alter table public.staff_credentials add constraint staff_credentials_role_check CHECK ((role = ANY (ARRAY['Employee'::text, 'Supervisor'::text, 'Manager'::text, 'Purchaser'::text])));
alter table public.workshop_live_status add constraint workshop_live_status_pkey PRIMARY KEY (employee_id);
alter table public.workshop_live_status add constraint workshop_live_status_status_check CHECK ((status = ANY (ARRAY['Available'::text, 'Working'::text, 'Paused'::text, 'ID001'::text, 'Overtime'::text])));
alter table public.workshop_state add constraint workshop_state_pkey PRIMARY KEY (id);
alter table public.workshop_state_history add constraint workshop_state_history_pkey PRIMARY KEY (revision);
alter table public.workshop_v2_assignments add constraint workshop_v2_assignments_pkey PRIMARY KEY (assignment_id);
alter table public.workshop_v2_assignments add constraint workshop_v2_assignments_suggested_minutes_check CHECK ((suggested_minutes >= 0));
alter table public.workshop_v2_calendar add constraint workshop_v2_calendar_pkey PRIMARY KEY (work_date);
alter table public.workshop_v2_estimate_numbers add constraint workshop_v2_estimate_numbers_client_key_key UNIQUE (client_key);
alter table public.workshop_v2_estimate_numbers add constraint workshop_v2_estimate_numbers_pkey PRIMARY KEY (estimate_no);
alter table public.workshop_v2_estimate_numbers add constraint workshop_v2_estimate_numbers_sequence_no_key UNIQUE (sequence_no);
alter table public.workshop_v2_events add constraint workshop_v2_events_pkey PRIMARY KEY (event_id);
alter table public.workshop_v2_jobcards add constraint workshop_v2_jobcards_pkey PRIMARY KEY (job_card);
alter table public.workshop_v2_leave add constraint workshop_v2_leave_period_check CHECK ((period = ANY (ARRAY['FULL'::text, 'AM'::text, 'PM'::text])));
alter table public.workshop_v2_leave add constraint workshop_v2_leave_pkey PRIMARY KEY (leave_id);
alter table public.workshop_v2_pilot add constraint workshop_v2_pilot_pkey PRIMARY KEY (id);
alter table public.workshop_v2_preliminary_links add constraint workshop_v2_preliminary_links_linked_event_id_key UNIQUE (linked_event_id);
alter table public.workshop_v2_preliminary_links add constraint workshop_v2_preliminary_links_pkey PRIMARY KEY (session_id);
alter table public.workshop_v2_preliminary_links add constraint workshop_v2_preliminary_links_reversed_event_id_key UNIQUE (reversed_event_id);
alter table public.workshop_v2_spare_part_list_numbers add constraint workshop_v2_spare_part_list_numbers_job_card_key UNIQUE (job_card);
alter table public.workshop_v2_spare_part_list_numbers add constraint workshop_v2_spare_part_list_numbers_pkey PRIMARY KEY (list_no);
alter table public.workshop_v2_spare_part_list_numbers add constraint workshop_v2_spare_part_list_numbers_sequence_no_key UNIQUE (sequence_no);
alter table public.workshop_v2_spare_part_state add constraint workshop_v2_spare_part_state_pkey PRIMARY KEY (part_id);
alter table public.workshop_v2_spare_part_state_conflicts add constraint workshop_v2_spare_part_state_conflicts_pkey PRIMARY KEY (list_no, part_key);
alter table public.workshop_v2_work_sessions add constraint workshop_v2_work_sessions_accumulated_minutes_check CHECK ((accumulated_minutes >= 0));
alter table public.workshop_v2_work_sessions add constraint workshop_v2_work_sessions_actual_minutes_check CHECK ((actual_minutes >= 0));
alter table public.workshop_v2_work_sessions add constraint workshop_v2_work_sessions_kind_check CHECK ((kind = ANY (ARRAY['WORK'::text, 'ID001'::text])));
alter table public.workshop_v2_work_sessions add constraint workshop_v2_work_sessions_overtime_minutes_check CHECK ((overtime_minutes >= 0));
alter table public.workshop_v2_work_sessions add constraint workshop_v2_work_sessions_pkey PRIMARY KEY (session_id);
alter table public.workshop_v2_work_sessions add constraint workshop_v2_work_sessions_repeat_minutes_check CHECK ((repeat_minutes >= 0));
alter table public.workshop_live_status add constraint workshop_live_status_employee_id_fkey FOREIGN KEY (employee_id) REFERENCES staff_credentials(user_id) ON UPDATE CASCADE ON DELETE CASCADE;
CREATE INDEX workshop_v2_jobcards_updated_idx ON public.workshop_v2_jobcards USING btree (updated_at DESC, job_card DESC);
CREATE INDEX workshop_live_status_status_idx ON public.workshop_live_status USING btree (status);
CREATE INDEX workshop_v2_leave_employee_date_idx ON public.workshop_v2_leave USING btree (employee_id, leave_date);
CREATE INDEX workshop_v2_work_sessions_job_idx ON public.workshop_v2_work_sessions USING btree (job_card, updated_at DESC);
CREATE INDEX workshop_v2_jobcards_registration_idx ON public.workshop_v2_jobcards USING btree (registration);
CREATE UNIQUE INDEX workshop_v2_spare_part_one_active_key ON public.workshop_v2_spare_part_state USING btree (list_no, part_key) WHERE (status <> 'RETURNED'::text);
CREATE INDEX workshop_v2_events_type_server_idx ON public.workshop_v2_events USING btree (event_type, server_time DESC, event_id DESC);
CREATE INDEX workshop_live_status_revision_idx ON public.workshop_live_status USING btree (state_revision);
CREATE UNIQUE INDEX workshop_v2_one_active_employee_idx ON public.workshop_v2_work_sessions USING btree (employee_id) WHERE (status = 'ACTIVE'::text);
CREATE INDEX workshop_v2_assignments_employee_idx ON public.workshop_v2_assignments USING btree (employee_id, updated_at DESC);
CREATE INDEX workshop_v2_events_entity_server_idx ON public.workshop_v2_events USING btree (entity_id, server_time DESC, event_id DESC);
CREATE INDEX workshop_v2_work_sessions_employee_updated_idx ON public.workshop_v2_work_sessions USING btree (employee_id, updated_at DESC);
CREATE INDEX workshop_v2_work_sessions_status_idx ON public.workshop_v2_work_sessions USING btree (status, updated_at DESC);
CREATE INDEX workshop_v2_assignments_job_idx ON public.workshop_v2_assignments USING btree (job_card, updated_at DESC);
CREATE INDEX workshop_v2_events_actor_server_idx ON public.workshop_v2_events USING btree (actor_id, server_time DESC, event_id DESC);
CREATE INDEX workshop_v2_jobcards_status_idx ON public.workshop_v2_jobcards USING btree (status, updated_at DESC);
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
      updated_by = excluded.updated_by;
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
      updated_by = excluded.updated_by;
  end loop;

  if coalesce(array_length(v_ids,1),0) = 0 then
    delete from public.workshop_live_status;
  else
    delete from public.workshop_live_status
     where not (employee_id = any(v_ids));
  end if;
end;
$function$;

CREATE OR REPLACE FUNCTION public.zukait_v2_allocate_spare_part_list(p_job_card text, p_actor_id text, p_client_key text)
 RETURNS TABLE(list_no text, job_card text, status text, created_at timestamp with time zone, created_by text)
 LANGUAGE plpgsql
 SET search_path TO 'public'
AS $function$
declare v_job text:=nullif(upper(trim(coalesce(p_job_card,''))),'');v_key text:=nullif(trim(coalesce(p_client_key,'')),'');v_seq bigint;
begin
if v_job is null then raise exception 'job_card_required'; end if;if v_key is null then raise exception 'client_key_required'; end if;
return query select l.list_no,l.job_card,l.status,l.created_at,l.created_by from public.workshop_v2_spare_part_list_numbers l where l.job_card=v_job;if found then return;end if;
v_seq:=nextval('public.workshop_v2_spare_part_list_no_seq');
insert into public.workshop_v2_spare_part_list_numbers(list_no,sequence_no,job_card,client_key,created_by) values('PL'||lpad(v_seq::text,3,'0'),v_seq,v_job,v_key,nullif(trim(coalesce(p_actor_id,'')),''));
return query select l.list_no,l.job_card,l.status,l.created_at,l.created_by from public.workshop_v2_spare_part_list_numbers l where l.job_card=v_job;
exception when unique_violation then return query select l.list_no,l.job_card,l.status,l.created_at,l.created_by from public.workshop_v2_spare_part_list_numbers l where l.job_card=v_job;end;$function$;

CREATE OR REPLACE FUNCTION public.zukait_v2_apply_assignment_event(p_event_id text, p_entity_id text, p_event_type text, p_event_time timestamp with time zone, p_revision bigint, p_payload jsonb)
 RETURNS void
 LANGUAGE plpgsql
 SET search_path TO 'public'
AS $function$
declare emp text; job text; etime timestamptz; cur public.workshop_v2_assignments%rowtype;
begin
 if p_event_type<>'JOB_ASSIGNED' then raise exception 'unsupported_assignment_event'; end if;
 emp:=coalesce(p_payload->>'employeeId',''); job:=coalesce(p_payload->>'jobCard',''); etime:=coalesce(p_event_time,now());
 if emp='' then raise exception 'employee_required'; end if; if job='' or job='ID001' then raise exception 'job_card_required'; end if;
 select * into cur from public.workshop_v2_assignments where assignment_id=p_entity_id for update;
 if found and cur.last_event_id=p_event_id then return; end if;
 if found and coalesce(p_revision,0)<=cur.revision then raise exception 'stale_assignment_revision'; end if;
 update public.workshop_v2_work_sessions x set
   ended_at=etime,active_since=null,
   accumulated_minutes=x.accumulated_minutes+greatest(0,floor(extract(epoch from (etime-coalesce(x.active_since,x.started_at)))/60)::integer),
   actual_minutes=x.accumulated_minutes+greatest(0,floor(extract(epoch from (etime-coalesce(x.active_since,x.started_at)))/60)::integer),
   overtime_minutes=x.overtime_minutes+greatest(greatest(0,floor(extract(epoch from (etime-coalesce(x.active_since,x.started_at)))/60)::integer)-public.zukait_v2_duty_minutes(coalesce(x.active_since,x.started_at),etime),0),
   status='STOPPED',updated_at=now()
 where x.employee_id=emp and x.status='ACTIVE' and x.kind='ID001';
 insert into public.workshop_v2_assignments(assignment_id,job_card,employee_id,status,suggested_minutes,assigned_at,revision,last_event_id)
 values(p_entity_id,job,emp,'ASSIGNED',greatest(coalesce((p_payload->>'suggestedMinutes')::integer,0),0),etime,coalesce(p_revision,0),p_event_id)
 on conflict(assignment_id) do update set job_card=excluded.job_card,employee_id=excluded.employee_id,status='ASSIGNED',suggested_minutes=excluded.suggested_minutes,updated_at=now(),revision=excluded.revision,last_event_id=excluded.last_event_id;
end;$function$;

CREATE OR REPLACE FUNCTION public.zukait_v2_apply_calendar_event(p_event_id text, p_entity_id text, p_event_type text, p_event_time timestamp with time zone, p_payload jsonb)
 RETURNS void
 LANGUAGE plpgsql
 SET search_path TO 'public'
AS $function$
declare d date; labelv text;
begin
 d:=nullif(coalesce(p_payload->>'date',p_entity_id,''),'')::date; labelv:=coalesce(p_payload->>'label','');
 if d is null then raise exception 'calendar_date_required'; end if;
 if p_event_type='PUBLIC_HOLIDAY_SET' then
   insert into public.workshop_v2_calendar(work_date,is_public_holiday,label,updated_at,updated_by) values(d,true,labelv,now(),coalesce(p_payload->>'actorId',''))
   on conflict(work_date) do update set is_public_holiday=true,label=excluded.label,updated_at=now(),updated_by=excluded.updated_by;
 elsif p_event_type='PUBLIC_HOLIDAY_CLEARED' then
   insert into public.workshop_v2_calendar(work_date,is_public_holiday,label,updated_at,updated_by) values(d,false,labelv,now(),coalesce(p_payload->>'actorId',''))
   on conflict(work_date) do update set is_public_holiday=false,label=excluded.label,updated_at=now(),updated_by=excluded.updated_by;
 else raise exception 'unsupported_calendar_event'; end if;
end;$function$;

CREATE OR REPLACE FUNCTION public.zukait_v2_apply_leave_event(p_event_id text, p_entity_id text, p_event_type text, p_event_time timestamp with time zone, p_payload jsonb)
 RETURNS void
 LANGUAGE plpgsql
 SET search_path TO 'public'
AS $function$
declare emp text; d date; per text;
begin
 emp:=coalesce(p_payload->>'employeeId',p_payload->>'emp',''); d:=nullif(coalesce(p_payload->>'date',''),'')::date; per:=upper(coalesce(p_payload->>'period',''));
 if emp='' then raise exception 'employee_required'; end if; if d is null then raise exception 'leave_date_required'; end if;
 if p_event_type='LEAVE_CANCELLED' then update public.workshop_v2_leave set cancelled=true,updated_at=now(),updated_by=coalesce(p_payload->>'actorId','') where leave_id=p_entity_id; if not found then raise exception 'leave_missing'; end if; return; end if;
 if p_event_type not in ('LEAVE_CREATED','LEAVE_UPDATED') then raise exception 'unsupported_leave_event'; end if;
 if per not in ('FULL','AM','PM') then raise exception 'leave_period_required'; end if; if public.zukait_v2_closed_day(d) then raise exception 'leave_closed_day'; end if;
 if exists(select 1 from public.workshop_v2_leave l where l.employee_id=emp and l.leave_date=d and not l.cancelled and l.leave_id<>p_entity_id and (l.period='FULL' or per='FULL' or l.period=per)) then raise exception 'leave_overlap'; end if;
 insert into public.workshop_v2_leave(leave_id,employee_id,leave_date,period,cancelled,updated_at,updated_by) values(p_entity_id,emp,d,per,false,now(),coalesce(p_payload->>'actorId',''))
 on conflict(leave_id) do update set employee_id=excluded.employee_id,leave_date=excluded.leave_date,period=excluded.period,cancelled=false,updated_at=now(),updated_by=excluded.updated_by;
end;$function$;

CREATE OR REPLACE FUNCTION public.zukait_v2_apply_preliminary_link_event(p_event_id text, p_entity_id text, p_event_type text, p_actor_id text, p_payload jsonb)
 RETURNS void
 LANGUAGE plpgsql
 SET search_path TO 'public'
AS $function$
declare v_session text:=trim(coalesce(p_payload->>'sessionId',p_entity_id,''));
declare v_job text:=upper(trim(coalesce(p_payload->>'jobCard','')));
declare v_row public.workshop_v2_preliminary_links%rowtype;
begin
  if v_session='' then raise exception 'preliminary_session_required'; end if;
  if p_event_type='ID001_PRELIMINARY_LINKED' then
    if v_job='' then raise exception 'preliminary_job_required'; end if;
    select * into v_row from public.workshop_v2_preliminary_links where session_id=v_session for update;
    if found and v_row.reversed_at is null then
      if v_row.job_card=v_job and v_row.linked_event_id=p_event_id then return; end if;
      raise exception 'preliminary_session_already_linked';
    end if;
    insert into public.workshop_v2_preliminary_links(session_id,job_card,linked_event_id,linked_by,linked_at,reversed_event_id,reversed_by,reversed_at,reversal_reason)
    values(v_session,v_job,p_event_id,nullif(p_actor_id,''),now(),null,null,null,null)
    on conflict(session_id) do update set job_card=excluded.job_card,linked_event_id=excluded.linked_event_id,linked_by=excluded.linked_by,linked_at=excluded.linked_at,reversed_event_id=null,reversed_by=null,reversed_at=null,reversal_reason=null;
  elsif p_event_type='ID001_PRELIMINARY_REVERSED' then
    select * into v_row from public.workshop_v2_preliminary_links where session_id=v_session for update;
    if not found or v_row.reversed_at is not null then raise exception 'preliminary_link_not_active'; end if;
    if trim(coalesce(p_payload->>'reason',''))='' then raise exception 'preliminary_reversal_reason_required'; end if;
    update public.workshop_v2_preliminary_links set reversed_event_id=p_event_id,reversed_by=nullif(p_actor_id,''),reversed_at=now(),reversal_reason=left(trim(p_payload->>'reason'),240) where session_id=v_session;
  else raise exception 'invalid_preliminary_event';
  end if;
end;$function$;

CREATE OR REPLACE FUNCTION public.zukait_v2_apply_work_event(p_event_id text, p_entity_id text, p_event_type text, p_event_time timestamp with time zone, p_revision bigint, p_payload jsonb)
 RETURNS void
 LANGUAGE plpgsql
 SET search_path TO 'public'
AS $function$
declare cur public.workshop_v2_work_sessions%rowtype; mins integer:=0; dutymins integer:=0; intervalmins integer:=0; kindv text; emp text; job text; etime timestamptz;
begin
 etime:=coalesce(p_event_time,now()); emp:=coalesce(p_payload->>'employeeId',''); job:=coalesce(p_payload->>'jobCard',p_payload->>'job',''); kindv:=case when p_event_type like 'ID001%' then 'ID001' else 'WORK' end;
 if emp='' then raise exception 'employee_required'; end if;
 if p_event_type in ('WORK_START','WORK_RESUME','ID001_START') and public.zukait_v2_employee_on_leave(emp,etime) then raise exception 'employee_on_leave'; end if;
 if p_event_type='ID001_START' and (public.zukait_v2_closed_day((etime at time zone 'Asia/Muscat')::date) or not (((etime at time zone 'Asia/Muscat')::time>=time '08:00' and (etime at time zone 'Asia/Muscat')::time<time '13:00') or ((etime at time zone 'Asia/Muscat')::time>=time '15:00' and (etime at time zone 'Asia/Muscat')::time<time '19:00'))) then raise exception 'id001_outside_duty'; end if;
 if p_event_type='ID001_START' and job<>'ID001' then raise exception 'id001_job_required'; end if;
 if p_event_type='WORK_START' and job='ID001' then raise exception 'use_id001_start'; end if;
 select * into cur from public.workshop_v2_work_sessions where session_id=p_entity_id for update;
 if found and cur.last_event_id=p_event_id then return; end if;
 if found and coalesce(p_revision,0)<=cur.revision then raise exception 'stale_work_revision'; end if;
 if found and p_event_type='WORK_PAUSE' and cur.kind='ID001' then raise exception 'id001_pause_not_allowed'; end if;
 if found and cur.kind='WORK' and p_event_type in ('ID001_STOP','ID001_START') then raise exception 'work_command_kind_mismatch'; end if;
 if found and cur.kind='ID001' and p_event_type in ('WORK_PAUSE','WORK_RESUME','WORK_FINISH','WORK_START') then raise exception 'id001_command_kind_mismatch'; end if;
 if found and p_event_type='WORK_PAUSE' and cur.status<>'ACTIVE' then raise exception 'work_not_active'; end if;
 if found and p_event_type='WORK_FINISH' and cur.status not in ('ACTIVE','PAUSED') then raise exception 'work_not_finishable'; end if;
 if found and p_event_type='ID001_STOP' and (cur.kind<>'ID001' or cur.status<>'ACTIVE') then raise exception 'id001_not_active'; end if;
 if p_event_type in ('WORK_START','ID001_START') then
   if p_event_type='WORK_START' then
     update public.workshop_v2_work_sessions x set
       ended_at=etime, active_since=null,
       accumulated_minutes=x.accumulated_minutes+greatest(0,floor(extract(epoch from (etime-coalesce(x.active_since,x.started_at)))/60)::integer),
       actual_minutes=x.accumulated_minutes+greatest(0,floor(extract(epoch from (etime-coalesce(x.active_since,x.started_at)))/60)::integer),
       overtime_minutes=x.overtime_minutes+greatest(greatest(0,floor(extract(epoch from (etime-coalesce(x.active_since,x.started_at)))/60)::integer)-public.zukait_v2_duty_minutes(coalesce(x.active_since,x.started_at),etime),0),
       status='STOPPED',updated_at=now()
     where x.employee_id=emp and x.status='ACTIVE' and x.kind='ID001' and x.session_id<>p_entity_id;
   end if;
   if exists(select 1 from public.workshop_v2_work_sessions x where x.employee_id=emp and x.status='ACTIVE' and x.session_id<>p_entity_id) then raise exception 'employee_already_active'; end if;
   if found then raise exception 'work_session_exists'; end if;
   insert into public.workshop_v2_work_sessions(session_id,assignment_id,job_card,employee_id,kind,started_at,active_since,status,suggested_minutes,repeat_minutes,last_event_id,revision)
   values(p_entity_id,p_entity_id,job,emp,kindv,etime,etime,'ACTIVE',case when kindv='ID001' then 0 else greatest(coalesce((p_payload->>'suggestedMinutes')::integer,0),0) end,greatest(coalesce((p_payload->>'repeatMinutes')::integer,0),0),p_event_id,coalesce(p_revision,0))
   on conflict(session_id) do update set started_at=excluded.started_at,active_since=excluded.started_at,accumulated_minutes=0,actual_minutes=0,ended_at=null,status='ACTIVE',last_event_id=excluded.last_event_id,revision=excluded.revision,updated_at=now();
 elsif not found then raise exception 'work_session_missing';
 elsif p_event_type='WORK_PAUSE' then intervalmins:=greatest(0,floor(extract(epoch from (etime-coalesce(cur.active_since,cur.started_at)))/60)::integer); dutymins:=public.zukait_v2_duty_minutes(coalesce(cur.active_since,cur.started_at),etime); mins:=intervalmins; update public.workshop_v2_work_sessions set status='PAUSED',accumulated_minutes=cur.accumulated_minutes+mins,overtime_minutes=cur.overtime_minutes+greatest(intervalmins-dutymins,0),active_since=null,last_event_id=p_event_id,revision=p_revision,updated_at=now() where session_id=p_entity_id;
 elsif p_event_type='WORK_RESUME' then if cur.status<>'PAUSED' then raise exception 'work_not_paused'; end if; if exists(select 1 from public.workshop_v2_work_sessions x where x.employee_id=emp and x.status='ACTIVE' and x.session_id<>p_entity_id) then raise exception 'employee_already_active'; end if; update public.workshop_v2_work_sessions set status='ACTIVE',active_since=etime,last_event_id=p_event_id,revision=p_revision,updated_at=now() where session_id=p_entity_id;
 elsif p_event_type in ('WORK_FINISH','ID001_STOP') then
   intervalmins:=case when cur.status='ACTIVE' then greatest(0,floor(extract(epoch from (etime-coalesce(cur.active_since,cur.started_at)))/60)::integer) else 0 end; dutymins:=case when cur.status='ACTIVE' then public.zukait_v2_duty_minutes(coalesce(cur.active_since,cur.started_at),etime) else 0 end; mins:=cur.accumulated_minutes+intervalmins;
   update public.workshop_v2_work_sessions set ended_at=etime,active_since=null,accumulated_minutes=mins,overtime_minutes=cur.overtime_minutes+greatest(intervalmins-dutymins,0),status=case when kind='ID001' then 'STOPPED' else 'FINISHED' end,actual_minutes=mins,last_event_id=p_event_id,revision=p_revision,updated_at=now() where session_id=p_entity_id;
 end if;
end;$function$;

CREATE OR REPLACE FUNCTION public.zukait_v2_closed_day(p_day date)
 RETURNS boolean
 LANGUAGE sql
 STABLE
 SET search_path TO 'public'
AS $function$
 select extract(isodow from p_day)=5 or exists(select 1 from public.workshop_v2_calendar c where c.work_date=p_day and c.is_public_holiday=true);
$function$;

CREATE OR REPLACE FUNCTION public.zukait_v2_commit_event(p_event_id text, p_entity_id text, p_actor_id text, p_device_id text, p_event_type text, p_client_time timestamp with time zone DEFAULT NULL::timestamp with time zone, p_revision bigint DEFAULT NULL::bigint, p_payload jsonb DEFAULT '{}'::jsonb)
 RETURNS TABLE(event_id text, server_time timestamp with time zone, revision bigint, inserted boolean)
 LANGUAGE plpgsql
 SET search_path TO 'public'
AS $function$
declare v public.workshop_v2_events%rowtype; v_inserted boolean:=false;
begin
 if nullif(trim(p_event_id),'') is null or nullif(trim(p_entity_id),'') is null or nullif(trim(p_event_type),'') is null then raise exception 'invalid_event'; end if;
 insert into public.workshop_v2_events(event_id,entity_id,actor_id,device_id,event_type,client_time,revision,payload)
 values(p_event_id,p_entity_id,nullif(p_actor_id,''),nullif(p_device_id,''),p_event_type,p_client_time,p_revision,coalesce(p_payload,'{}'::jsonb))
 on conflict on constraint workshop_v2_events_pkey do nothing returning * into v;
 if found then
   -- Project before returning success. If projection rejects a stale/conflicting event, the surrounding transaction rolls back the inserted event row too.
   v_inserted:=true;
   if p_event_type in ('WORK_START','WORK_PAUSE','WORK_RESUME','WORK_FINISH','ID001_START','ID001_STOP') then
     perform public.zukait_v2_apply_work_event(p_event_id,p_entity_id,p_event_type,coalesce(p_client_time,now()),coalesce(p_revision,0),coalesce(p_payload,'{}'::jsonb));
   end if;
   if p_event_type like 'SPARE_PART%' then
     if nullif(trim(coalesce(p_payload->>'jobCard','')),'') is null or nullif(trim(coalesce(p_payload->>'partId',p_entity_id,'')),'') is null then raise exception 'invalid_spare_part_event'; end if;
     if p_event_type='SPARE_PART_STATUS_CHANGED' and (nullif(trim(coalesce(p_payload->>'from','')),'') is null or nullif(trim(coalesce(p_payload->>'to','')),'') is null) then raise exception 'invalid_spare_part_transition'; end if;
   end if;
   if p_event_type in ('ID001_PRELIMINARY_LINKED','ID001_PRELIMINARY_REVERSED') then
     perform public.zukait_v2_apply_preliminary_link_event(p_event_id,p_entity_id,p_event_type,p_actor_id,coalesce(p_payload,'{}'::jsonb));
   end if;
   if p_event_type in ('PUBLIC_HOLIDAY_SET','PUBLIC_HOLIDAY_CLEARED') then
     perform public.zukait_v2_apply_calendar_event(p_event_id,p_entity_id,p_event_type,p_client_time,p_payload);
   end if;
   if p_event_type in ('LEAVE_CREATED','LEAVE_UPDATED','LEAVE_CANCELLED') then
     perform public.zukait_v2_apply_leave_event(p_event_id,p_entity_id,p_event_type,p_client_time,p_payload);
   end if;
   if p_event_type='JOB_ASSIGNED' then
     perform public.zukait_v2_apply_assignment_event(p_event_id,p_entity_id,p_event_type,p_client_time,p_revision,p_payload);
   end if;
   if p_event_type in ('REPEAT_ASSIGNED','REPEAT_COMPLETED','REPEAT_CANCELLED','CONSUMABLE_ISSUED','CONSUMABLE_ADDITIONAL','CONSUMABLE_ACTUAL','CONSUMABLE_VOIDED') then
     if p_event_type like 'REPEAT%' and nullif(trim(coalesce(p_payload->>'jobCard',p_payload->>'job','')),'') is null then raise exception 'repeat_job_required'; end if;
     if p_event_type='REPEAT_ASSIGNED' and (nullif(trim(coalesce(p_payload->>'employeeId',p_payload->>'emp','')),'') is null or nullif(trim(coalesce(p_payload->>'mistakeEmployeeId',p_payload->>'mistakeEmp','')),'') is null or nullif(trim(coalesce(p_payload->>'reason','')),'') is null) then raise exception 'invalid_repeat_event'; end if;
     if p_event_type like 'CONSUMABLE%' and nullif(trim(coalesce(p_payload->>'jobCard','')),'') is null then raise exception 'consumable_job_required'; end if;
   end if;
   if p_event_type in ('JOB_CREATED','JOB_UPDATED','JOB_STAGE_CHANGED','JOB_COMPLETED','JOB_REOPENED') then
     perform public.zukait_v2_upsert_jobcard(
       coalesce(nullif(p_payload->>'jobCard',''),p_entity_id),
       coalesce(p_payload->>'registration',''),coalesce(p_payload->>'vehicleMake',''),coalesce(p_payload->>'vehicleModel',''),
       case when coalesce(p_payload->>'vehicleYear','') ~ '^[0-9]{4}$' then (p_payload->>'vehicleYear')::integer else null end,
       coalesce(p_payload->>'workflowStage','CREATED'),
       case when p_event_type='JOB_COMPLETED' then 'COMPLETED' when p_event_type='JOB_REOPENED' then 'OPEN' else coalesce(p_payload->>'status','OPEN') end,
       coalesce(p_revision,0),p_event_id,
       case when p_event_type='JOB_COMPLETED' then now() else null end
     );
   end if;
 else
   select * into v from public.workshop_v2_events e where e.event_id=p_event_id;
   if v.entity_id<>p_entity_id or v.event_type<>p_event_type or coalesce(v.actor_id,'')<>coalesce(p_actor_id,'') or coalesce(v.device_id,'')<>coalesce(p_device_id,'') or v.payload<>coalesce(p_payload,'{}'::jsonb) or coalesce(v.revision,-1)<>coalesce(p_revision,-1) or coalesce(v.client_time,'epoch'::timestamptz)<>coalesce(p_client_time,'epoch'::timestamptz) then raise exception 'event_id_conflict'; end if;
 end if;
 return query select v.event_id,v.server_time,v.revision,v_inserted;
end;$function$;

CREATE OR REPLACE FUNCTION public.zukait_v2_duty_minutes(p_start timestamp with time zone, p_end timestamp with time zone)
 RETURNS integer
 LANGUAGE plpgsql
 STABLE
 SET search_path TO 'public'
AS $function$
declare d date; total integer:=0; a timestamptz; b timestamptz;
begin
 if p_start is null or p_end is null or p_end<=p_start then return 0; end if;
 d=(p_start at time zone 'Asia/Muscat')::date;
 while d<=(p_end at time zone 'Asia/Muscat')::date loop
  if not public.zukait_v2_closed_day(d) then
   a=(d::text||' 08:00 Asia/Muscat')::timestamptz; b=(d::text||' 13:00 Asia/Muscat')::timestamptz;
   total:=total+greatest(0,floor(extract(epoch from (least(p_end,b)-greatest(p_start,a)))/60)::integer);
   a=(d::text||' 15:00 Asia/Muscat')::timestamptz; b=(d::text||' 19:00 Asia/Muscat')::timestamptz;
   total:=total+greatest(0,floor(extract(epoch from (least(p_end,b)-greatest(p_start,a)))/60)::integer);
  end if; d=d+1;
 end loop; return total;
end;$function$;

CREATE OR REPLACE FUNCTION public.zukait_v2_employee_on_leave(p_employee text, p_at timestamp with time zone)
 RETURNS boolean
 LANGUAGE sql
 STABLE
 SET search_path TO 'public'
AS $function$
 select exists(
  select 1 from public.workshop_v2_leave l
  where l.employee_id=p_employee and l.leave_date=(p_at at time zone 'Asia/Muscat')::date and not l.cancelled
    and (l.period='FULL'
      or (l.period='AM' and (p_at at time zone 'Asia/Muscat')::time>=time '08:00' and (p_at at time zone 'Asia/Muscat')::time<time '13:00')
      or (l.period='PM' and (p_at at time zone 'Asia/Muscat')::time>=time '15:00' and (p_at at time zone 'Asia/Muscat')::time<time '19:00'))
 );
$function$;

CREATE OR REPLACE FUNCTION public.zukait_v2_project_spare_part_event()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  p jsonb:=coalesce(new.payload,'{}'::jsonb);
  afterv jsonb:=case when jsonb_typeof(p->'after')='object' then p->'after' else '{}'::jsonb end;
  pid text:=coalesce(nullif(p->>'partId',''),new.entity_id);
  cur public.workshop_v2_spare_part_state%rowtype;
  financial_snapshot jsonb;
  nm text; pn text; st text; ln text; jc text; k text; conflict_part text;
begin
  if new.event_type not like 'SPARE_PART%' then return new; end if;

  select * into cur from public.workshop_v2_spare_part_state where part_id=pid for update;

  if new.event_type='SPARE_PART_LISTED' then
    if cur.part_id is not null or exists(select 1 from public.workshop_v2_events e where e.entity_id=pid and e.event_type='SPARE_PART_LISTED' and e.event_id<>new.event_id) then raise exception 'duplicate_active_spare_part'; end if;
    ln:=trim(coalesce(p->>'listNo','')); jc:=upper(trim(coalesce(p->>'jobCard','')));
    nm:=trim(coalesce(p->>'name','')); pn:=upper(trim(coalesce(p->>'partNo','')));
    if ln='' or jc='' or nm='' then raise exception 'invalid_spare_part_projection'; end if;
    k:=public.zukait_v2_spare_part_key(nm,pn);
    perform pg_advisory_xact_lock(hashtextextended(ln||'|'||k,0));
    select part_id into conflict_part from public.workshop_v2_spare_part_state where list_no=ln and part_key=k and status<>'RETURNED' and part_id<>pid limit 1;
    if conflict_part is not null then raise exception 'duplicate_active_spare_part'; end if;
    insert into public.workshop_v2_spare_part_state(part_id,list_no,job_card,part_name,part_no,part_key,status,ordered_qty,received_qty,revision,last_event_id)
    values(pid,ln,jc,nm,pn,k,'LISTED',greatest(1,coalesce((p->>'qty')::numeric,1)),0,coalesce(new.revision,0),new.event_id)
    on conflict(part_id) do nothing;
    if not found then raise exception 'duplicate_active_spare_part'; end if;
    return new;
  end if;

  if not found then
    if new.event_type='SPARE_PART_FINAL_PRICE_RECORDED' then
      raise exception 'spare_final_price_not_eligible';
    elsif new.event_type in ('SPARE_PART_MANAGER_CORRECTED','SPARE_PART_SUPERVISOR_CORRECTED') then
      raise exception 'stale_spare_manager_correction';
    elsif new.event_type in ('SPARE_PART_RETURN_CANCELLED','SPARE_PART_COMMERCIAL_UPDATED','SPARE_PART_STATUS_CHANGED') then
      raise exception 'stale_spare_part_status';
    elsif new.event_type='SPARE_PART_ARRIVAL_ACCEPTED' then
      raise exception 'spare_arrival_acceptance_not_eligible';
    end if;
    return new;
  end if;

  if new.event_type in ('SPARE_PART_MANAGER_CORRECTED','SPARE_PART_SUPERVISOR_CORRECTED') then
    if upper(coalesce(p->'before'->>'status',''))<>upper(coalesce(cur.status,'')) then
      raise exception 'stale_spare_manager_correction';
    end if;
    if (p->'before' ? 'qty' and nullif(p->'before'->>'qty','')::numeric is distinct from cur.ordered_qty)
       or (p->'before' ? 'name' and trim(coalesce(p->'before'->>'name',''))<>cur.part_name)
       or (p->'before' ? 'partNo' and upper(trim(coalesce(p->'before'->>'partNo','')))<>cur.part_no) then
      raise exception 'stale_spare_manager_correction';
    end if;
    if afterv ? 'purchaseAmount' then
      select case
        when e.event_type='SPARE_PART_FINAL_PRICE_RECORDED' then jsonb_build_object('purchaseAmount',e.payload->'finalPrice','purchaseAmountRevision',e.revision)
        when e.event_type in ('SPARE_PART_RETURN_CANCELLED','SPARE_PART_MANAGER_CORRECTED','SPARE_PART_SUPERVISOR_CORRECTED') then e.payload->'after'
        when e.event_type='SPARE_PART_COMMERCIAL_UPDATED' then e.payload
        else '{}'::jsonb end into financial_snapshot
      from public.workshop_v2_events e
      where e.entity_id=pid and e.event_id<>new.event_id and (
        e.event_type in ('SPARE_PART_FINAL_PRICE_RECORDED','SPARE_PART_RETURN_CANCELLED')
        or (e.event_type in ('SPARE_PART_MANAGER_CORRECTED','SPARE_PART_SUPERVISOR_CORRECTED') and e.payload->'after' ? 'purchaseAmount')
        or (e.event_type='SPARE_PART_COMMERCIAL_UPDATED' and e.payload ? 'purchaseAmount')
        or (e.event_type='SPARE_PART_STATUS_CHANGED' and upper(e.payload->>'to')='RETURNED'))
      order by e.server_time desc,e.event_id desc limit 1;
      if nullif(financial_snapshot->>'purchaseAmount','')::numeric is distinct from nullif(p->'before'->>'purchaseAmount','')::numeric then
        raise exception 'stale_spare_manager_correction';
      end if;
    end if;
  end if;

  if new.event_type='SPARE_PART_COMMERCIAL_UPDATED' and upper(cur.status)='RETURNED' then
    raise exception 'stale_spare_part_status';
  end if;

  if new.event_type='SPARE_PART_COMMERCIAL_UPDATED' and p ? 'purchaseAmount' then
      select case
        when e.event_type='SPARE_PART_FINAL_PRICE_RECORDED' then jsonb_build_object('purchaseAmount',e.payload->'finalPrice','purchaseAmountRevision',e.revision)
        when e.event_type in ('SPARE_PART_RETURN_CANCELLED','SPARE_PART_MANAGER_CORRECTED','SPARE_PART_SUPERVISOR_CORRECTED') then e.payload->'after'
        when e.event_type='SPARE_PART_COMMERCIAL_UPDATED' then e.payload
        else '{}'::jsonb end into financial_snapshot
      from public.workshop_v2_events e
      where e.entity_id=pid and e.event_id<>new.event_id and (
        e.event_type in ('SPARE_PART_FINAL_PRICE_RECORDED','SPARE_PART_RETURN_CANCELLED')
        or (e.event_type in ('SPARE_PART_MANAGER_CORRECTED','SPARE_PART_SUPERVISOR_CORRECTED') and e.payload->'after' ? 'purchaseAmount')
        or (e.event_type='SPARE_PART_COMMERCIAL_UPDATED' and e.payload ? 'purchaseAmount')
        or (e.event_type='SPARE_PART_STATUS_CHANGED' and upper(e.payload->>'to')='RETURNED'))
      order by e.server_time desc,e.event_id desc limit 1;
    if nullif(financial_snapshot->>'purchaseAmount','')::numeric is distinct from nullif(p->>'purchaseAmount','')::numeric then
      raise exception 'stale_spare_final_price';
    end if;
  end if;

  if new.event_type='SPARE_PART_RETURN_CANCELLED' then
    if upper(coalesce(cur.status,''))<>'RETURNED'
       or coalesce(new.revision,0)<=coalesce(cur.revision,0)
       or (p->'before' ? 'revision' and coalesce((p->'before'->>'revision')::bigint,0)<>coalesce(cur.revision,0)) then
      raise exception 'stale_spare_part_status';
    end if;
  end if;

  if new.event_type='SPARE_PART_ITEM_EDITED' and nullif(trim(afterv->>'deletedAt'),'') is not null then
    delete from public.workshop_v2_spare_part_state where part_id=pid;
    return new;
  end if;

  if new.event_type='SPARE_PART_FINAL_PRICE_RECORDED' then
    if cur.part_id is null or upper(coalesce(cur.status,'')) not in ('SUPERVISOR_VERIFIED','DENTER_CHECKED','SUPERVISOR_CONFIRMED','FITTED') then raise exception 'spare_final_price_not_eligible'; end if;
    if p ? 'expectedPurchaseAmount' then
      select case
        when e.event_type='SPARE_PART_FINAL_PRICE_RECORDED' then jsonb_build_object('purchaseAmount',e.payload->'finalPrice','purchaseAmountRevision',e.revision)
        when e.event_type in ('SPARE_PART_RETURN_CANCELLED','SPARE_PART_MANAGER_CORRECTED','SPARE_PART_SUPERVISOR_CORRECTED') then e.payload->'after'
        when e.event_type='SPARE_PART_COMMERCIAL_UPDATED' then e.payload
        else '{}'::jsonb end into financial_snapshot
      from public.workshop_v2_events e
      where e.entity_id=pid and e.event_id<>new.event_id and (
        e.event_type in ('SPARE_PART_FINAL_PRICE_RECORDED','SPARE_PART_RETURN_CANCELLED')
        or (e.event_type in ('SPARE_PART_MANAGER_CORRECTED','SPARE_PART_SUPERVISOR_CORRECTED') and e.payload->'after' ? 'purchaseAmount')
        or (e.event_type='SPARE_PART_COMMERCIAL_UPDATED' and e.payload ? 'purchaseAmount')
        or (e.event_type='SPARE_PART_STATUS_CHANGED' and upper(e.payload->>'to')='RETURNED'))
      order by e.server_time desc,e.event_id desc limit 1;
      if nullif(financial_snapshot->>'purchaseAmount','')::numeric is distinct from nullif(p->>'expectedPurchaseAmount','')::numeric then
        raise exception 'stale_spare_final_price';
      end if;
    end if;
    perform 1 from public.workshop_v2_events e
      where e.entity_id=pid and e.event_type='SPARE_PART_FINAL_PRICE_RECORDED'
        and e.event_id<>new.event_id
        and coalesce(e.revision,0)>=coalesce(new.revision,0)
      limit 1;
    if found then raise exception 'stale_spare_final_price'; end if;
  end if;

  if new.event_type='SPARE_PART_ARRIVAL_ACCEPTED' then
    if upper(coalesce(cur.status,'')) not in ('SUPERVISOR_VERIFIED','DENTER_CHECKED','SUPERVISOR_CONFIRMED','FITTED') then raise exception 'spare_arrival_acceptance_not_eligible'; end if;
  end if;

  if new.event_type='SPARE_PART_STATUS_CHANGED' then
    if coalesce(new.revision,0)<=coalesce(cur.revision,0) then raise exception 'stale_spare_part_status'; end if;
    st:=trim(coalesce(p->>'to',''));
    if upper(trim(coalesce(p->>'from','')))<>upper(trim(coalesce(cur.status,''))) then
      raise exception 'stale_spare_part_status';
    end if;
    if upper(st)='RECEIVED' and coalesce(nullif(p->>'receivedQty','')::numeric,coalesce(cur.received_qty,0))>coalesce(cur.ordered_qty,1) then raise exception 'spare_received_quantity_exceeds_ordered'; end if;
     if upper(st)='SUPERVISOR_VERIFIED' and coalesce(cur.received_qty,0)<coalesce(cur.ordered_qty,1) then raise exception 'spare_receipt_incomplete'; end if;
    if upper(st)='RETURNED' then
      if coalesce(nullif(p->>'returnedQty','')::numeric,0)<>least(coalesce(cur.received_qty,0),coalesce(cur.ordered_qty,1)) then raise exception 'spare_returned_quantity_mismatch'; end if;
      -- Recheck undo finances under the same row lock as invoice commits.
      select case
        when e.event_type='SPARE_PART_FINAL_PRICE_RECORDED' then jsonb_build_object('purchaseAmount',e.payload->'finalPrice','purchaseAmountRevision',e.revision)
        when e.event_type in ('SPARE_PART_RETURN_CANCELLED','SPARE_PART_MANAGER_CORRECTED','SPARE_PART_SUPERVISOR_CORRECTED') then e.payload->'after'
        when e.event_type='SPARE_PART_COMMERCIAL_UPDATED' then e.payload
        else '{}'::jsonb end into financial_snapshot
      from public.workshop_v2_events e
      where e.entity_id=pid and e.event_id<>new.event_id and (
        e.event_type in ('SPARE_PART_FINAL_PRICE_RECORDED','SPARE_PART_RETURN_CANCELLED')
        or (e.event_type in ('SPARE_PART_MANAGER_CORRECTED','SPARE_PART_SUPERVISOR_CORRECTED') and e.payload->'after' ? 'purchaseAmount')
        or (e.event_type='SPARE_PART_COMMERCIAL_UPDATED' and e.payload ? 'purchaseAmount')
        or (e.event_type='SPARE_PART_STATUS_CHANGED' and upper(e.payload->>'to')='RETURNED'))
      order by e.server_time desc,e.event_id desc limit 1;
      if p->'preReturnSnapshot' is not null and (
        nullif(financial_snapshot->>'purchaseAmount','')::numeric is distinct from nullif(p->'preReturnSnapshot'->>'purchaseAmount','')::numeric
        or (financial_snapshot ? 'purchaseAmountRevision' and coalesce((financial_snapshot->>'purchaseAmountRevision')::bigint,0)<>coalesce((p->'preReturnSnapshot'->>'purchaseAmountRevision')::bigint,0))) then
        raise exception 'stale_spare_return_financial_snapshot';
      end if;

    end if;
    if st<>'' then
      if upper(st)<>'RETURNED' and upper(cur.status)='RETURNED' then
        perform pg_advisory_xact_lock(hashtextextended(cur.list_no||'|'||cur.part_key,0));
        select part_id into conflict_part from public.workshop_v2_spare_part_state where list_no=cur.list_no and part_key=cur.part_key and status<>'RETURNED' and part_id<>pid limit 1;
        if conflict_part is not null then raise exception 'duplicate_active_spare_part'; end if;
      end if;
      update public.workshop_v2_spare_part_state set status=st,received_qty=case when upper(st)='RECEIVED' then greatest(received_qty,coalesce((p->>'receivedQty')::numeric,received_qty)) when upper(st) in ('LISTED','ENQUIRY','QUOTED','ORDERED','RETURNED','UNAVAILABLE','CUSTOMER_SETTLEMENT') then 0 else received_qty end,revision=greatest(revision,coalesce(new.revision,0)),last_event_id=new.event_id,updated_at=now() where part_id=pid;
    end if;
  elsif new.event_type in ('SPARE_PART_ITEM_EDITED','SPARE_PART_MANAGER_CORRECTED','SPARE_PART_SUPERVISOR_CORRECTED','SPARE_PART_RETURN_CANCELLED') then
    nm:=trim(coalesce(afterv->>'name',cur.part_name)); pn:=upper(trim(coalesce(afterv->>'partNo',cur.part_no)));
    st:=trim(coalesce(afterv->>'status',cur.status)); k:=public.zukait_v2_spare_part_key(nm,pn);
    if new.event_type in ('SPARE_PART_MANAGER_CORRECTED','SPARE_PART_SUPERVISOR_CORRECTED') and nullif(afterv->>'qty','') is not null then
      if (afterv->>'qty')::numeric < coalesce(cur.received_qty,0) then raise exception 'spare_quantity_below_received'; end if;
      if upper(cur.status) in ('SUPERVISOR_VERIFIED','DENTER_CHECKED','SUPERVISOR_CONFIRMED','FITTED') and (afterv->>'qty')::numeric > coalesce(cur.received_qty,0) then raise exception 'spare_verified_quantity_increase_requires_reopen'; end if;
    end if;
    if upper(st)<>'RETURNED' and (k<>cur.part_key or upper(cur.status)='RETURNED') then
      perform pg_advisory_xact_lock(hashtextextended(cur.list_no||'|'||k,0));
      select part_id into conflict_part from public.workshop_v2_spare_part_state where list_no=cur.list_no and part_key=k and status<>'RETURNED' and part_id<>pid limit 1;
      if conflict_part is not null then raise exception 'duplicate_active_spare_part'; end if;
    end if;
    if new.event_type='SPARE_PART_RETURN_CANCELLED' and coalesce(nullif(afterv->>'receivedQty','')::numeric,0)>greatest(1,coalesce((afterv->>'qty')::numeric,cur.ordered_qty)) then raise exception 'spare_return_restore_quantity_invalid'; end if;
    update public.workshop_v2_spare_part_state set part_name=nm,part_no=pn,part_key=k,status=st,ordered_qty=greatest(1,coalesce((afterv->>'qty')::numeric,ordered_qty)),received_qty=case when upper(st)='RETURNED' then 0 when new.event_type='SPARE_PART_RETURN_CANCELLED' then least(greatest(1,coalesce((afterv->>'qty')::numeric,ordered_qty)),greatest(0,coalesce(nullif(afterv->>'receivedQty','')::numeric,0))) else received_qty end,
      revision=greatest(revision,coalesce(new.revision,0)),last_event_id=new.event_id,updated_at=now() where part_id=pid;
  end if;
  return new;
exception when unique_violation then
  raise exception 'duplicate_active_spare_part';
end;$function$;

CREATE OR REPLACE FUNCTION public.zukait_v2_spare_part_key(p_name text, p_part_no text)
 RETURNS text
 LANGUAGE sql
 IMMUTABLE STRICT
 SET search_path TO 'public'
AS $function$
  select lower(regexp_replace(trim(coalesce(p_name,'')),'[^a-zA-Z0-9]+','','g')) || '|' ||
         upper(regexp_replace(trim(coalesce(p_part_no,'')),'[^a-zA-Z0-9]+','','g'));
$function$;

CREATE OR REPLACE FUNCTION public.zukait_v2_upsert_jobcard(p_job_card text, p_registration text DEFAULT ''::text, p_vehicle_make text DEFAULT ''::text, p_vehicle_model text DEFAULT ''::text, p_vehicle_year integer DEFAULT NULL::integer, p_workflow_stage text DEFAULT 'CREATED'::text, p_status text DEFAULT 'OPEN'::text, p_revision bigint DEFAULT 0, p_event_id text DEFAULT NULL::text, p_completed_at timestamp with time zone DEFAULT NULL::timestamp with time zone)
 RETURNS workshop_v2_jobcards
 LANGUAGE plpgsql
 SET search_path TO 'public'
AS $function$
declare outrow public.workshop_v2_jobcards;
begin
 if nullif(trim(coalesce(p_job_card,'')),'') is null then raise exception 'job_card_required'; end if;
 insert into public.workshop_v2_jobcards(job_card,registration,vehicle_make,vehicle_model,vehicle_year,workflow_stage,status,revision,last_event_id,completed_at)
 values(trim(p_job_card),coalesce(p_registration,''),coalesce(p_vehicle_make,''),coalesce(p_vehicle_model,''),p_vehicle_year,upper(coalesce(p_workflow_stage,'CREATED')),upper(coalesce(p_status,'OPEN')),greatest(coalesce(p_revision,0),0),p_event_id,p_completed_at)
 on conflict(job_card) do update set
  registration=excluded.registration,vehicle_make=excluded.vehicle_make,vehicle_model=excluded.vehicle_model,vehicle_year=excluded.vehicle_year,
  workflow_stage=excluded.workflow_stage,status=excluded.status,updated_at=now(),completed_at=excluded.completed_at,revision=excluded.revision,last_event_id=excluded.last_event_id
 where excluded.revision>workshop_v2_jobcards.revision
    and (excluded.last_event_id is null or workshop_v2_jobcards.last_event_id is distinct from excluded.last_event_id)
 returning * into outrow;
 if outrow.job_card is null then
   select * into outrow from public.workshop_v2_jobcards where job_card=trim(p_job_card);
   if outrow.last_event_id is distinct from p_event_id and coalesce(p_revision,0)<=outrow.revision then
     raise exception 'stale_jobcard_revision';
   end if;
 end if;
 return outrow;
end;$function$;

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
$function$;

CREATE TRIGGER trg_zukait_workshop_live_status AFTER INSERT OR UPDATE OF data, revision ON public.workshop_state FOR EACH ROW EXECUTE FUNCTION zukait_workshop_state_live_status_trigger();
CREATE TRIGGER workshop_v2_spare_part_state_guard AFTER INSERT ON public.workshop_v2_events FOR EACH ROW EXECUTE FUNCTION zukait_v2_project_spare_part_event();
alter table public.workshop_live_status enable row level security;
alter table public.workshop_v2_pilot enable row level security;
alter table public.workshop_state_history enable row level security;
alter table public.staff_credentials enable row level security;
alter table public.workshop_v2_work_sessions enable row level security;
alter table public.workshop_v2_assignments enable row level security;
alter table public.workshop_v2_leave enable row level security;
alter table public.workshop_v2_calendar enable row level security;
alter table public.workshop_v2_estimate_numbers enable row level security;
alter table public.workshop_state enable row level security;
alter table public.workshop_v2_jobcards enable row level security;
alter table public.workshop_v2_preliminary_links enable row level security;
alter table public.workshop_v2_spare_part_state enable row level security;
alter table public.workshop_v2_events enable row level security;
alter table public.workshop_v2_spare_part_list_numbers enable row level security;
alter table public.workshop_v2_spare_part_state_conflicts enable row level security;
grant usage on schema public to service_role;
grant all on all tables in schema public to service_role;
grant usage,select on all sequences in schema public to service_role;

