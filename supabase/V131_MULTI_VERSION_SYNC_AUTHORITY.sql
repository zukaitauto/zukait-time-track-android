-- V131 multi-version synchronization authority
-- Purpose: preserve exact base revisions so stale full-state clients can be
-- safely rebased by workshop-api instead of entering repeated HTTP 409 loops.

begin;

create table if not exists public.workshop_state_history (
  revision bigint primary key,
  data jsonb not null,
  updated_at timestamptz,
  updated_by text,
  archived_at timestamptz not null default now()
);

alter table public.workshop_state_history enable row level security;
revoke all on table public.workshop_state_history from anon, authenticated;
grant select, insert, update, delete on table public.workshop_state_history to service_role;

insert into public.workshop_state_history(revision,data,updated_at,updated_by)
select revision,data,updated_at,updated_by
from public.workshop_state
where id='main'
on conflict (revision) do nothing;

create or replace function public.zukait_commit_workshop_state_v2(
  p_expected_revision bigint,
  p_data jsonb,
  p_changed_by text,
  p_live jsonb
)
returns jsonb
language plpgsql
set search_path to 'public'
as $function$
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

revoke all on function public.zukait_commit_workshop_state_v2(bigint,jsonb,text,jsonb) from public, anon, authenticated;
grant execute on function public.zukait_commit_workshop_state_v2(bigint,jsonb,text,jsonb) to service_role;

commit;
