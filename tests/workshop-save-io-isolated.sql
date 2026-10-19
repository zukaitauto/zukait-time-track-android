
begin;
set local statement_timeout='10s';
create temporary table workshop_state (like public.workshop_state including all) on commit drop;
create temporary table workshop_state_history (like public.workshop_state_history including all) on commit drop;
create temporary table workshop_live_status (like public.workshop_live_status including all) on commit drop;
CREATE OR REPLACE FUNCTION pg_temp.zukait_commit_workshop_state_v2(p_expected_revision bigint, p_data jsonb, p_changed_by text, p_live jsonb)
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
    from pg_temp.workshop_state
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
  insert into pg_temp.workshop_state_history(revision,data,updated_at,updated_by)
  values(v_revision,v_current,v_current_updated_at,v_current_updated_by)
  on conflict (revision) do nothing;

  v_next := v_revision + 1;

  update pg_temp.workshop_state
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

    insert into pg_temp.workshop_live_status(
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
    delete from pg_temp.workshop_live_status;
  else
    delete from pg_temp.workshop_live_status
     where not (employee_id = any(v_ids));
  end if;

  return jsonb_build_object(
    'ok', true,
    'revision', v_next,
    'updated_by', p_changed_by
  );
end;
$function$;


do $test$
declare r jsonb; original jsonb := '{"users":[],"sessions":[{"id":"keep"}],"leaves":[{"id":"L","cancelled":false}],"leaveAudit":[{"action":"ADD"}]}'::jsonb;
live jsonb := '[{"employee_id":"IO-TEST","employee_name":"Synthetic","status":"Working","overtime":false}]';
state_tuple tid; live_tuple tid; audit_count bigint;
begin
insert into pg_temp.workshop_state(id,revision,data,updated_at,updated_by) values('main',100,original,now(),'TEST');
r:=pg_temp.zukait_commit_workshop_state_v2(100,original,'TEST',live);
if r->>'ok'<>'true' or (r->>'revision')::bigint<>100 then raise exception 'no-op revision changed'; end if;
if exists(select 1 from pg_temp.workshop_state_history) then raise exception 'no-op archived state'; end if;
select ctid into state_tuple from pg_temp.workshop_state;
select ctid into live_tuple from pg_temp.workshop_live_status;
r:=pg_temp.zukait_commit_workshop_state_v2(100,original,'TEST',live);
if (select ctid from pg_temp.workshop_state)<>state_tuple then raise exception 'state tuple rewritten'; end if;
if (select ctid from pg_temp.workshop_live_status)<>live_tuple then raise exception 'identical live tuple rewritten'; end if;
r:=pg_temp.zukait_commit_workshop_state_v2(99,original,'TEST',live);
if r->>'code'<>'conflict' or r->'data' is distinct from original then raise exception 'stale CAS lost'; end if;
r:=pg_temp.zukait_commit_workshop_state_v2(100,original||'{"newBusinessAction":true}'::jsonb,'TEST',live);
if (r->>'revision')::bigint<>101 then raise exception 'real action not committed'; end if;
if (select data from pg_temp.workshop_state_history where revision=100) is distinct from original then raise exception 'original history lost'; end if;
if (select data->'sessions' from pg_temp.workshop_state) is distinct from original->'sessions'
or (select data->'leaves' from pg_temp.workshop_state) is distinct from original->'leaves'
or (select data->'leaveAudit' from pg_temp.workshop_state) is distinct from original->'leaveAudit' then raise exception 'business records changed'; end if;
r:=pg_temp.zukait_commit_workshop_state_v2(101,original||'{"newBusinessAction":true}'::jsonb,'TEST',jsonb_set(live,'{0,overtime}','true'));
if (r->>'revision')::bigint<>101 or (select overtime from pg_temp.workshop_live_status)<>true then raise exception 'live-only refresh broken'; end if;
if (select count(*) from pg_temp.workshop_state_history)<>1 then raise exception 'live refresh archived state'; end if;
r:=pg_temp.zukait_commit_workshop_state_v2(101,original||'{"newBusinessAction":true}'::jsonb,'TEST','[]');
if exists(select 1 from pg_temp.workshop_live_status) then raise exception 'live membership not reconciled'; end if;
delete from pg_temp.workshop_state;
r:=pg_temp.zukait_commit_workshop_state_v2(101,original,'TEST',live);
if r->>'code'<>'missing' then raise exception 'missing row guard broken'; end if;
end;
$test$;
select 'PASS: identical saves skip state/history; unchanged live rows skip UPDATE; stale revisions conflict; real edits archive once; work/leave/audit retained; live-only overtime and membership refresh; missing guard' as result;
rollback;
