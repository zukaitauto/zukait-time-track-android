-- Architecture V2 canonical operational reporting projections.
-- Repository migration only; production remains on V141 until controlled rollout.
begin;
create table if not exists public.workshop_v2_work_sessions(
 session_id text primary key,assignment_id text not null,job_card text not null default '',employee_id text not null,
 kind text not null default 'WORK',started_at timestamptz not null,ended_at timestamptz,status text not null default 'ACTIVE',
 suggested_minutes integer not null default 0,actual_minutes integer not null default 0,overtime_minutes integer not null default 0,
 repeat_minutes integer not null default 0,last_event_id text,revision bigint not null default 0,updated_at timestamptz not null default now(),
 check(kind in ('WORK','ID001')),check(actual_minutes>=0),check(overtime_minutes>=0),check(repeat_minutes>=0));
create index if not exists workshop_v2_work_sessions_employee_updated_idx on public.workshop_v2_work_sessions(employee_id,updated_at desc);
create index if not exists workshop_v2_work_sessions_job_idx on public.workshop_v2_work_sessions(job_card,updated_at desc);
create index if not exists workshop_v2_work_sessions_status_idx on public.workshop_v2_work_sessions(status,updated_at desc);
alter table public.workshop_v2_work_sessions enable row level security;
revoke all on public.workshop_v2_work_sessions from public,anon,authenticated;
grant select,insert,update on public.workshop_v2_work_sessions to service_role;

create or replace function public.zukait_v2_operational_report_page(p_report text,p_before timestamptz default null,p_limit integer default 100,p_filters jsonb default '{}'::jsonb)
returns table(session_id text,job_card text,employee_id text,kind text,status text,started_at timestamptz,ended_at timestamptz,suggested_minutes integer,actual_minutes integer,overtime_minutes integer,repeat_minutes integer,labour_cost_omr numeric)
language sql stable security invoker set search_path=public as $$
 select s.session_id,s.job_card,s.employee_id,s.kind,s.status,s.started_at,s.ended_at,s.suggested_minutes,s.actual_minutes,s.overtime_minutes,s.repeat_minutes,
        round((greatest(s.actual_minutes-s.overtime_minutes,0)::numeric/60.0)*2.500,3) labour_cost_omr
 from public.workshop_v2_work_sessions s
 where (p_before is null or s.updated_at<p_before)
   and (nullif(p_filters->>'employeeId','') is null or s.employee_id=p_filters->>'employeeId')
   and (nullif(p_filters->>'jobCard','') is null or s.job_card=p_filters->>'jobCard')
   and case upper(coalesce(p_report,''))
     when 'ID001' then s.kind='ID001'
     when 'OVERTIME' then s.overtime_minutes>0
     when 'REPEAT' then s.repeat_minutes>0
     when 'JOB_COST' then s.kind='WORK' and s.job_card<>''
     when 'EFFICIENCY' then s.kind='WORK' and s.status='FINISHED'
     else false end
 order by s.updated_at desc limit greatest(1,least(coalesce(p_limit,100),500));
$$;
revoke all on function public.zukait_v2_operational_report_page(text,timestamptz,integer,jsonb) from public,anon,authenticated;
grant execute on function public.zukait_v2_operational_report_page(text,timestamptz,integer,jsonb) to service_role;
commit;
