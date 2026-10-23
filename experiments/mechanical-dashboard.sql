-- Bounded foreground UI projection. Fixture SQL, not an applied migration.
create function public.zukait_mechanical_dashboard(p_actor text,p_session_hash text,p_after bigint default 0,p_checklist uuid default null)
returns jsonb language plpgsql security invoker set search_path=pg_catalog as $$
declare cfg zukait_mechanical.settings; operation text; policy jsonb; rows jsonb; detail jsonb;
 mechanics jsonb; tasks jsonb; assignments jsonb; selected jsonb; revision bigint; workshop_revision bigint;
 next_after bigint; assignment_map jsonb;
begin
 select * into cfg from zukait_mechanical.settings where singleton;
 select value into operation from jsonb_array_elements_text(case when jsonb_typeof(cfg.capabilities->p_actor)='array' then cfg.capabilities->p_actor else '[]'::jsonb end)
 where value in ('MC_CREATE','TASK_CREATE','TASK_ASSIGN','TASK_HANDOVER') limit 1;
 policy:=zukait_mechanical.authorize_session(p_actor,p_session_hash,operation);
 if p_after is null or p_after not between 0 and 9007199254740991 then raise exception 'invalid_mechanical_command';end if;
 select c.revision into revision from zukait_mechanical.control c where singleton;
 select w.revision into workshop_revision from public.workshop_state w where id='main';
 if workshop_revision is null then raise exception 'workshop_missing';end if;
 select coalesce(jsonb_agg(jsonb_build_object('id',user_id,'name',display_name) order by display_name,user_id),'[]') into mechanics
 from (select user_id,display_name from public.staff_credentials where role='Employee' and active and department=cfg.department order by display_name,user_id limit 101) e;
 if jsonb_array_length(mechanics)>100 then raise exception 'mechanical_dashboard_limit';end if;
 select coalesce(jsonb_agg(jsonb_build_object('id',id,'number',number,'sequence',sequence_no,'jobCard',job_card,'manualDate',manual_jc_date) order by sequence_no),'[]') into rows
 from (select * from zukait_mechanical.checklists where sequence_no>p_after order by sequence_no limit 26) c;
 if jsonb_array_length(rows)>25 then rows:=rows-25;next_after:=(rows->24->>'sequence')::bigint;end if;
 if p_checklist is not null then
  select jsonb_build_object('id',id,'number',number,'jobCard',job_card,'manualDate',manual_jc_date) into selected from zukait_mechanical.checklists where id=p_checklist;
  if selected is null then raise exception 'mechanical_checklist_missing';end if;
  select coalesce(jsonb_agg(jsonb_build_object('id',id,'title',title) order by created_at,id),'[]') into tasks
  from (select * from zukait_mechanical.tasks where checklist_id=p_checklist order by created_at,id limit 101) t;
  if jsonb_array_length(tasks)>100 then raise exception 'mechanical_dashboard_limit';end if;
  -- Parse current allocations once. Session/history JSON is not read here.
  select coalesce(jsonb_object_agg(a->>'id',a) filter(where a->>'id' is not null),'{}') into assignment_map
  from public.workshop_state w cross join lateral jsonb_array_elements(coalesce(w.data->'assign','[]')) a where w.id='main';
  select coalesce(jsonb_agg(jsonb_build_object('id',l.assignment_id,'taskId',l.task_id,'employeeId',l.employee_id,'employeeName',c.display_name,
    'suggestedMinutes',assignment_map->l.assignment_id::text->'suggested','completed',coalesce((assignment_map->l.assignment_id::text->>'completed')::boolean,false),
    'cancelled',coalesce((assignment_map->l.assignment_id::text->>'cancelled')::boolean,false),'handedOverTo',l.successor_id,'handoverFrom',l.predecessor_id,
    'running',coalesce(s.status in ('Working','ID001','Overtime'),false)) order by l.created_at,l.assignment_id),'[]') into assignments
  from (select l.* from zukait_mechanical.links l join zukait_mechanical.tasks t on t.id=l.task_id where t.checklist_id=p_checklist order by l.created_at,l.assignment_id limit 201) l
   join public.staff_credentials c on c.user_id=l.employee_id left join public.workshop_live_status s on s.employee_id=l.employee_id;
  if jsonb_array_length(assignments)>200 then raise exception 'mechanical_dashboard_limit';end if;
  detail:=jsonb_build_object('checklist',selected,'tasks',tasks,'assignments',assignments);
 end if;
 return jsonb_build_object('ok',true,'recordsRevision',revision,'workshopRevision',workshop_revision,'capabilities',policy->'mechanicalStaff'->p_actor,
  'departmentConfigured',cfg.department is not null,'mechanics',mechanics,'checklists',rows,'nextAfter',next_after,'detail',detail);
end $$;
revoke all on function public.zukait_mechanical_dashboard(text,text,bigint,uuid) from public,anon,authenticated;
grant execute on function public.zukait_mechanical_dashboard(text,text,bigint,uuid) to service_role;
