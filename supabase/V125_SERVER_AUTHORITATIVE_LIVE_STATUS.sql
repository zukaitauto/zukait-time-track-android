-- V125 server-authoritative live worker status
-- Applied to Supabase project pjknotnjkufadqavcmii.
-- Runtime clients must read this table only through workshop-api.

create table if not exists public.workshop_live_status (
  employee_id text primary key references public.staff_credentials(user_id) on update cascade on delete cascade,
  employee_name text not null,
  department text not null default '',
  status text not null check (status in ('Available','Working','Paused','ID001','Overtime')),
  job_no text,
  assignment_id text,
  session_id text,
  session_start bigint,
  suggested_minutes numeric not null default 0,
  vehicle text not null default '',
  registration text not null default '',
  overtime boolean not null default false,
  state_revision bigint not null,
  updated_at timestamptz not null default now(),
  updated_by text
);

alter table public.workshop_live_status enable row level security;
revoke all on table public.workshop_live_status from anon, authenticated;

create index if not exists workshop_live_status_status_idx
  on public.workshop_live_status(status);
create index if not exists workshop_live_status_revision_idx
  on public.workshop_live_status(state_revision);

create or replace function public.zukait_commit_workshop_state_v2(
  p_expected_revision bigint,
  p_data jsonb,
  p_changed_by text,
  p_live jsonb
)
returns jsonb
language plpgsql
security invoker
set search_path = public
as $$
declare
  v_revision bigint;
  v_current jsonb;
  v_next bigint;
  v_item jsonb;
  v_ids text[];
begin
  select revision, data
    into v_revision, v_current
    from public.workshop_state
   where id = 'main'
   for update;

  if not found then
    return jsonb_build_object('ok', false, 'code', 'missing', 'revision', 0);
  end if;

  if v_revision <> p_expected_revision then
    return jsonb_build_object(
      'ok', false, 'code', 'conflict',
      'revision', v_revision, 'data', v_current
    );
  end if;

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
$$;

revoke all on function public.zukait_commit_workshop_state_v2(bigint,jsonb,text,jsonb)
  from public, anon, authenticated;
grant execute on function public.zukait_commit_workshop_state_v2(bigint,jsonb,text,jsonb)
  to service_role;
