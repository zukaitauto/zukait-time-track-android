-- Architecture V2 canonical operational reporting projections.
-- Repository migration only; production remains on V141 until controlled rollout.
begin;
create table if not exists public.workshop_v2_work_sessions(
 session_id text primary key,assignment_id text not null,job_card text not null default '',employee_id text not null,
 kind text not null default 'WORK',started_at timestamptz not null,ended_at timestamptz,status text not null default 'ACTIVE',
 suggested_minutes integer not null default 0,actual_minutes integer not null default 0,overtime_minutes integer not null default 0,
 repeat_minutes integer not null default 0,active_since timestamptz,accumulated_minutes integer not null default 0,last_event_id text,revision bigint not null default 0,updated_at timestamptz not null default now(),
 check(kind in ('WORK','ID001')),check(actual_minutes>=0),check(accumulated_minutes>=0),check(overtime_minutes>=0),check(repeat_minutes>=0));
create index if not exists workshop_v2_work_sessions_employee_updated_idx on public.workshop_v2_work_sessions(employee_id,updated_at desc);
create index if not exists workshop_v2_work_sessions_job_idx on public.workshop_v2_work_sessions(job_card,updated_at desc);
create index if not exists workshop_v2_work_sessions_status_idx on public.workshop_v2_work_sessions(status,updated_at desc);
alter table public.workshop_v2_work_sessions enable row level security;
revoke all on public.workshop_v2_work_sessions from public,anon,authenticated;
grant select,insert,update on public.workshop_v2_work_sessions to service_role;

create or replace function public.zukait_v2_apply_work_event(p_event_id text,p_entity_id text,p_event_type text,p_event_time timestamptz,p_revision bigint,p_payload jsonb)
returns void language plpgsql security invoker set search_path=public as $
declare cur public.workshop_v2_work_sessions%rowtype; mins integer:=0; kindv text; emp text; job text; etime timestamptz;
begin
 etime:=coalesce(p_event_time,now()); emp:=coalesce(p_payload->>'employeeId',''); job:=coalesce(p_payload->>'jobCard',p_payload->>'job',''); kindv:=case when p_event_type like 'ID001%' then 'ID001' else 'WORK' end;
 if emp='' then raise exception 'employee_required'; end if;
 select * into cur from public.workshop_v2_work_sessions where session_id=p_entity_id for update;
 if found and cur.last_event_id=p_event_id then return; end if;
 if found and coalesce(p_revision,0)<=cur.revision then raise exception 'stale_work_revision'; end if;
 if p_event_type in ('WORK_START','ID001_START') then
   if found and cur.status not in ('FINISHED','STOPPED') then raise exception 'work_session_exists'; end if;
   insert into public.workshop_v2_work_sessions(session_id,assignment_id,job_card,employee_id,kind,started_at,active_since,status,suggested_minutes,repeat_minutes,last_event_id,revision)
   values(p_entity_id,p_entity_id,job,emp,kindv,etime,etime,'ACTIVE',case when kindv='ID001' then 0 else greatest(coalesce((p_payload->>'suggestedMinutes')::integer,0),0) end,greatest(coalesce((p_payload->>'repeatMinutes')::integer,0),0),p_event_id,coalesce(p_revision,0))
   on conflict(session_id) do update set started_at=excluded.started_at,active_since=excluded.started_at,accumulated_minutes=0,actual_minutes=0,ended_at=null,status='ACTIVE',last_event_id=excluded.last_event_id,revision=excluded.revision,updated_at=now();
 elsif not found then raise exception 'work_session_missing';
 elsif p_event_type='WORK_PAUSE' then mins:=greatest(0,floor(extract(epoch from (etime-coalesce(cur.active_since,cur.started_at)))/60)::integer); update public.workshop_v2_work_sessions set status='PAUSED',accumulated_minutes=cur.accumulated_minutes+mins,active_since=null,last_event_id=p_event_id,revision=p_revision,updated_at=now() where session_id=p_entity_id;
 elsif p_event_type='WORK_RESUME' then if cur.status<>'PAUSED' then raise exception 'work_not_paused'; end if; update public.workshop_v2_work_sessions set status='ACTIVE',active_since=etime,last_event_id=p_event_id,revision=p_revision,updated_at=now() where session_id=p_entity_id;
 elsif p_event_type in ('WORK_FINISH','ID001_STOP') then
   mins:=cur.accumulated_minutes + case when cur.status='ACTIVE' then greatest(0,floor(extract(epoch from (etime-coalesce(cur.active_since,cur.started_at)))/60)::integer) else 0 end;
   update public.workshop_v2_work_sessions set ended_at=etime,active_since=null,accumulated_minutes=mins,status=case when kind='ID001' then 'STOPPED' else 'FINISHED' end,actual_minutes=mins,last_event_id=p_event_id,revision=p_revision,updated_at=now() where session_id=p_entity_id;
 end if;
end;$;
revoke all on function public.zukait_v2_apply_work_event(text,text,text,timestamptz,bigint,jsonb) from public,anon,authenticated;
grant execute on function public.zukait_v2_apply_work_event(text,text,text,timestamptz,bigint,jsonb) to service_role;

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
