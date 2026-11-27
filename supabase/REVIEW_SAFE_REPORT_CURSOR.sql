-- Additive read-only cursor RPC. Keeps existing functions/tables/records unchanged.
-- Apply only to a V2 backend after its operational projections are installed.
begin;

create or replace function public.zukait_v2_operational_report_page_cursor(p_report text,p_before timestamptz default null,p_limit integer default 100,p_filters jsonb default '{}'::jsonb,p_before_id text default null)
returns table(session_id text,job_card text,employee_id text,kind text,status text,started_at timestamptz,ended_at timestamptz,suggested_minutes integer,actual_minutes integer,overtime_minutes integer,repeat_minutes integer,labour_cost_omr numeric,sort_time timestamptz)
language sql stable security invoker set search_path=public as $$
 select s.session_id,s.job_card,s.employee_id,s.kind,s.status,s.started_at,s.ended_at,s.suggested_minutes,s.actual_minutes,s.overtime_minutes,s.repeat_minutes,
        round((greatest(s.actual_minutes-s.overtime_minutes,0)::numeric/60.0)*2.500,3) labour_cost_omr,s.updated_at
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
revoke all on function public.zukait_v2_operational_report_page_cursor(text,timestamptz,integer,jsonb,text) from public,anon,authenticated;
grant execute on function public.zukait_v2_operational_report_page_cursor(text,timestamptz,integer,jsonb,text) to service_role;
commit;
