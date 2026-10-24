-- Disposable fixture candidate only; not generated/applied production migration.
alter table zukait_mechanical.settings add column reports_enabled boolean not null default false;
alter table zukait_mechanical.settings add column report_readers jsonb not null default '{}' check(jsonb_typeof(report_readers)='object');
create function public.zukait_mechanical_report_read(p_actor text,p_session_hash text,p_entity uuid,p_kind text default 'context',p_records bigint default null,p_workshop bigint default null,p_employee text default null) returns jsonb language plpgsql security invoker set search_path=pg_catalog as $$
declare cfg zukait_mechanical.settings;staff_role text;ctl bigint;rev bigint;ws jsonb;c zukait_mechanical.checklists;tasks jsonb;links jsonb;assignments jsonb;periods jsonb;people jsonb;jobs jsonb;
begin
 select * into cfg from zukait_mechanical.settings where singleton;
 if not coalesce(cfg.enabled and cfg.reports_enabled,false) then raise exception 'mechanical_reports_disabled';end if;
 if p_session_hash is null or p_session_hash !~ '^[0-9a-f]{64}$' then raise exception 'mechanical_invalid_session';end if;
 select role into staff_role from public.staff_credentials where user_id=p_actor and active for share;
 if staff_role is null or staff_role not in('Manager','Supervisor') then raise exception 'mechanical_report_forbidden';end if;
 perform 1 from public.staff_sessions where user_id=p_actor and token_hash=p_session_hash and revoked_at is null for share;
 if not found then raise exception 'mechanical_invalid_session';end if;
 if jsonb_typeof(cfg.report_readers->p_actor) is distinct from 'array' or not coalesce((cfg.report_readers->p_actor)?'TASK_REPORT',false) then raise exception 'mechanical_report_forbidden';end if;
 if length(coalesce(p_employee,''))>128 then raise exception 'invalid_mechanical_report';end if;
 if p_entity is null or p_kind not in('context','verify') then raise exception 'invalid_mechanical_report';end if;
 select revision into ctl from zukait_mechanical.control where singleton for share;
 select revision,data into rev,ws from public.workshop_state where id='main' for share;
 if ctl is null or rev is null then raise exception 'mechanical_report_scope_review';end if;
 select * into c from zukait_mechanical.checklists where id=p_entity;
 if not found or upper(trim(c.job_card))='ID001' then raise exception 'mechanical_report_scope_review';end if;
 if p_kind='verify' then
  if p_records is null or p_workshop is null or ctl<>p_records or rev<>p_workshop then raise exception 'mechanical_report_changed';end if;
  return jsonb_build_object('ok',true,'checklistId',p_entity,'recordsRevision',ctl,'workshopRevision',rev);
 end if;
 select coalesce(jsonb_agg(jsonb_build_object('id',id,'checklistId',checklist_id,'title',title) order by created_at,id),'[]') into tasks from(select * from zukait_mechanical.tasks where checklist_id=p_entity order by created_at,id limit 101) t;
 select coalesce(jsonb_agg(jsonb_build_object('taskId',l.task_id,'assignmentId',l.assignment_id,'employeeId',l.employee_id)||case when l.successor_id is null then '{}'::jsonb else jsonb_build_object('handedOverTo',l.successor_id) end order by l.created_at,l.assignment_id),'[]') into links from(select l.* from zukait_mechanical.links l join zukait_mechanical.tasks t on t.id=l.task_id where t.checklist_id=p_entity order by l.created_at,l.assignment_id limit 501) l;
 if jsonb_array_length(tasks)>100 or jsonb_array_length(links)>500 then raise exception 'mechanical_report_limit';end if;
 select coalesce(jsonb_agg(jsonb_build_object('id',a->'id','job',a->'job','emp',a->'emp','suggested',a->'suggested','cancelled',a->'cancelled','completed',a->'completed','rework',a->'rework','mechanicalTaskId',a->'mechanicalTaskId','mechanicalChecklistId',a->'mechanicalChecklistId')),'[]') into assignments from(select a from jsonb_array_elements(coalesce(ws->'assign','[]')) a where a->>'job'=c.job_card limit 501) x;
 if jsonb_array_length(assignments)>500 then raise exception 'mechanical_report_limit';end if;
 select coalesce(jsonb_agg(jsonb_build_object('id',s->'id','emp',s->'emp','job',s->'job','assignmentId',s->'assignmentId','start',s->'start','end',s->'end','paused',s->'paused','finished',s->'finished','cancelled',s->'cancelled','voided',s->'voided','deleted',s->'deleted','preliminaryLinkedJob',s->'preliminaryLinkedJob','recoveryClosed',s->'recoveryClosed','reconciledStaleOpen',s->'reconciledStaleOpen','reconciledOverlap',s->'reconciledOverlap',
 'pauseOverflow',case when jsonb_typeof(s->'pauses')='array' then jsonb_array_length(s->'pauses')>256 else false end,'pauses',case when jsonb_typeof(s->'pauses')='array' then case when jsonb_array_length(s->'pauses')<=256 then (select coalesce(jsonb_agg(jsonb_build_object('start',p->'start','pause',p->'pause','end',p->'end','resume',p->'resume')),'[]') from jsonb_array_elements(s->'pauses') p) else '[]'::jsonb end else '[]'::jsonb end)),'[]') into periods from(select s from jsonb_array_elements(coalesce(ws->'sessions','[]')) s where (s->>'job'=c.job_card or s->>'preliminaryLinkedJob'=c.job_card) and (nullif(p_employee,'') is null or s->>'emp'=p_employee) and s->>'emp' in(select l->>'employeeId' from jsonb_array_elements(links) l) limit 10001) x;
 if jsonb_array_length(periods)>10000 then raise exception 'mechanical_report_limit';end if;
 select coalesce(jsonb_agg(jsonb_build_object('id',user_id,'name',display_name)),'[]') into people from public.staff_credentials where user_id in(select l->>'employeeId' from jsonb_array_elements(links) l);
 select coalesce(jsonb_agg(jsonb_build_object('no',j->'no')),'[]') into jobs from jsonb_array_elements(coalesce(ws->'jobs','[]')) j where upper(trim(j->>'no'))=upper(trim(c.job_card));
 return jsonb_build_object('asOf',floor(extract(epoch from clock_timestamp())*1000),'records',jsonb_build_object('revision',ctl,'checklists',jsonb_build_array(jsonb_build_object('id',c.id,'number',c.number,'manualJobCard',jsonb_build_object('number',c.job_card,'date',c.manual_jc_date))),'tasks',tasks,'links',links),'snapshot',jsonb_build_object('revision',rev,'data',jsonb_build_object('jobs',jobs,'assign',assignments,'sessions',periods,'users',people)));
end $$;
revoke all on function public.zukait_mechanical_report_read(text,text,uuid,text,bigint,bigint,text) from public,anon,authenticated;
grant execute on function public.zukait_mechanical_report_read(text,text,uuid,text,bigint,bigint,text) to service_role;
