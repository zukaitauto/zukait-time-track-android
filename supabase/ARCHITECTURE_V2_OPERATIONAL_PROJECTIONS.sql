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
create unique index if not exists workshop_v2_one_active_employee_idx on public.workshop_v2_work_sessions(employee_id) where status='ACTIVE';
alter table public.workshop_v2_work_sessions enable row level security;
revoke all on public.workshop_v2_work_sessions from public,anon,authenticated;
grant select,insert,update on public.workshop_v2_work_sessions to service_role;

create table if not exists public.workshop_v2_assignments(
 assignment_id text primary key,
 job_card text not null,
 employee_id text not null,
 status text not null default 'ASSIGNED',
 suggested_minutes integer not null default 0,
 assigned_at timestamptz not null default now(),
 updated_at timestamptz not null default now(),
 revision bigint not null default 0,
 last_event_id text,
 check(suggested_minutes>=0)
);
create index if not exists workshop_v2_assignments_employee_idx on public.workshop_v2_assignments(employee_id,updated_at desc);
create index if not exists workshop_v2_assignments_job_idx on public.workshop_v2_assignments(job_card,updated_at desc);
alter table public.workshop_v2_assignments enable row level security;
revoke all on public.workshop_v2_assignments from public,anon,authenticated;
grant select,insert,update on public.workshop_v2_assignments to service_role;

create table if not exists public.workshop_v2_calendar(
 work_date date primary key,
 is_public_holiday boolean not null default false,
 label text not null default '',
 updated_at timestamptz not null default now(),
 updated_by text
);
create table if not exists public.workshop_v2_leave(
 leave_id text primary key,
 employee_id text not null,
 leave_date date not null,
 period text not null check(period in ('FULL','AM','PM')),
 cancelled boolean not null default false,
 updated_at timestamptz not null default now(),
 updated_by text
);
create index if not exists workshop_v2_leave_employee_date_idx on public.workshop_v2_leave(employee_id,leave_date);
alter table public.workshop_v2_calendar enable row level security;
alter table public.workshop_v2_leave enable row level security;
revoke all on public.workshop_v2_calendar,public.workshop_v2_leave from public,anon,authenticated;
grant select,insert,update on public.workshop_v2_calendar,public.workshop_v2_leave to service_role;

create or replace function public.zukait_v2_closed_day(p_day date)
returns boolean language sql stable security invoker set search_path=public as $$
 select extract(isodow from p_day)=5 or exists(select 1 from public.workshop_v2_calendar c where c.work_date=p_day and c.is_public_holiday=true);
$$;

create or replace function public.zukait_v2_employee_on_leave(p_employee text,p_at timestamptz)
returns boolean language sql stable security invoker set search_path=public as $$
 select exists(
  select 1 from public.workshop_v2_leave l
  where l.employee_id=p_employee and l.leave_date=(p_at at time zone 'Asia/Muscat')::date and not l.cancelled
    and (l.period='FULL'
      or (l.period='AM' and (p_at at time zone 'Asia/Muscat')::time>=time '08:00' and (p_at at time zone 'Asia/Muscat')::time<time '13:00')
      or (l.period='PM' and (p_at at time zone 'Asia/Muscat')::time>=time '15:00' and (p_at at time zone 'Asia/Muscat')::time<time '19:00'))
 );
$$;

create or replace function public.zukait_v2_apply_calendar_event(p_event_id text,p_entity_id text,p_event_type text,p_event_time timestamptz,p_payload jsonb)
returns void language plpgsql security invoker set search_path=public as $$
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
end;$$;
revoke all on function public.zukait_v2_apply_calendar_event(text,text,text,timestamptz,jsonb) from public,anon,authenticated;
grant execute on function public.zukait_v2_apply_calendar_event(text,text,text,timestamptz,jsonb) to service_role;

create or replace function public.zukait_v2_apply_leave_event(p_event_id text,p_entity_id text,p_event_type text,p_event_time timestamptz,p_payload jsonb)
returns void language plpgsql security invoker set search_path=public as $$
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
end;$$;
revoke all on function public.zukait_v2_apply_leave_event(text,text,text,timestamptz,jsonb) from public,anon,authenticated;
grant execute on function public.zukait_v2_apply_leave_event(text,text,text,timestamptz,jsonb) to service_role;

create or replace function public.zukait_v2_duty_minutes(p_start timestamptz,p_end timestamptz)
returns integer language plpgsql stable security invoker set search_path=public as $$
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
end;$$;

create or replace function public.zukait_v2_apply_assignment_event(p_event_id text,p_entity_id text,p_event_type text,p_event_time timestamptz,p_revision bigint,p_payload jsonb)
returns void language plpgsql security invoker set search_path=public as $$
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
end;$$;
revoke all on function public.zukait_v2_apply_assignment_event(text,text,text,timestamptz,bigint,jsonb) from public,anon,authenticated;
grant execute on function public.zukait_v2_apply_assignment_event(text,text,text,timestamptz,bigint,jsonb) to service_role;

create or replace function public.zukait_v2_apply_work_event(p_event_id text,p_entity_id text,p_event_type text,p_event_time timestamptz,p_revision bigint,p_payload jsonb)
returns void language plpgsql security invoker set search_path=public as $$
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
   if found and cur.status not in ('FINISHED','STOPPED') then raise exception 'work_session_exists'; end if;
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
end;$$;
revoke all on function public.zukait_v2_apply_work_event(text,text,text,timestamptz,bigint,jsonb) from public,anon,authenticated;
grant execute on function public.zukait_v2_apply_work_event(text,text,text,timestamptz,bigint,jsonb) to service_role;

create or replace function public.zukait_v2_operational_report_page(p_report text,p_before timestamptz default null,p_limit integer default 100,p_filters jsonb default '{}'::jsonb,p_before_id text default null)
returns table(session_id text,job_card text,employee_id text,kind text,status text,started_at timestamptz,ended_at timestamptz,suggested_minutes integer,actual_minutes integer,overtime_minutes integer,repeat_minutes integer,labour_cost_omr numeric)
language sql stable security invoker set search_path=public as $$
 select s.session_id,s.job_card,s.employee_id,s.kind,s.status,s.started_at,s.ended_at,s.suggested_minutes,s.actual_minutes,s.overtime_minutes,s.repeat_minutes,
        round((greatest(s.actual_minutes-s.overtime_minutes,0)::numeric/60.0)*2.500,3) labour_cost_omr
 from public.workshop_v2_work_sessions s
 where (p_before is null or s.updated_at<p_before or (s.updated_at=p_before and p_before_id is not null and s.session_id<p_before_id))
   and (nullif(p_filters->>'employeeId','') is null or s.employee_id=p_filters->>'employeeId')
   and (nullif(p_filters->>'jobCard','') is null or s.job_card=p_filters->>'jobCard')
   and case upper(coalesce(p_report,''))
     when 'ID001' then s.kind='ID001'
     when 'OVERTIME' then s.overtime_minutes>0
     when 'REPEAT' then s.repeat_minutes>0
     when 'JOB_COST' then s.kind='WORK' and s.job_card<>''
     when 'EFFICIENCY' then s.kind='WORK' and s.status='FINISHED'
     else false end
 order by s.updated_at desc, s.session_id desc limit greatest(1,least(coalesce(p_limit,100),500));
$$;
revoke all on function public.zukait_v2_operational_report_page(text,timestamptz,integer,jsonb,text) from public,anon,authenticated;
grant execute on function public.zukait_v2_operational_report_page(text,timestamptz,integer,jsonb,text) to service_role;
commit;
