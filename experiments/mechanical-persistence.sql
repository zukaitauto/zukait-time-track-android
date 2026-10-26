-- Isolated persistence candidate. NOT an applied/generated production migration.
create schema zukait_mechanical;
revoke all on schema zukait_mechanical from public,anon,authenticated;
grant usage on schema zukait_mechanical to service_role;
create table zukait_mechanical.settings (
 singleton boolean primary key default true check(singleton),
 enabled boolean not null default false,
 repeat_enabled boolean not null default false,
 minimum_digits integer default 3 check(minimum_digits=3),
 reset_mode text default 'continuous' check(reset_mode in ('continuous')),
 duplicate_jc_mode text default 'deny' check(duplicate_jc_mode in ('deny')),
 department text,
 capabilities jsonb not null default '{}' check(jsonb_typeof(capabilities)='object')
);
insert into zukait_mechanical.settings(singleton) values(true);
create table zukait_mechanical.control (
 singleton boolean primary key default true check(singleton),
 revision bigint not null default 0 check(revision>=0),
 next_sequence bigint not null default 1 check(next_sequence>=1)
);
insert into zukait_mechanical.control(singleton) values(true);
create table zukait_mechanical.checklists (
 id uuid primary key, number text not null unique, sequence_no bigint not null unique,
 job_card text not null unique, manual_jc_date date not null,
 created_by text not null references public.staff_credentials(user_id),
 created_at timestamptz not null default clock_timestamp()
);
create index on zukait_mechanical.checklists(job_card);
create table zukait_mechanical.tasks (
 id uuid primary key, checklist_id uuid not null references zukait_mechanical.checklists(id),
 title text not null check(length(trim(title)) between 1 and 200 and length(title)<=200),
 created_by text not null references public.staff_credentials(user_id),created_at timestamptz not null default clock_timestamp()
);
create index on zukait_mechanical.tasks(checklist_id);
create table zukait_mechanical.links (
 assignment_id uuid primary key,task_id uuid not null references zukait_mechanical.tasks(id),
 employee_id text not null references public.staff_credentials(user_id),
 predecessor_id uuid references zukait_mechanical.links(assignment_id),
 successor_id uuid references zukait_mechanical.links(assignment_id),
 created_by text not null references public.staff_credentials(user_id),created_at timestamptz not null default clock_timestamp()
);
create index on zukait_mechanical.links(task_id,employee_id);
create index on zukait_mechanical.links(predecessor_id);
create index on zukait_mechanical.links(successor_id);
create table zukait_mechanical.receipts (
 request_id uuid primary key,actor_id text not null references public.staff_credentials(user_id),
 fingerprint text not null,result jsonb not null,created_at timestamptz not null default clock_timestamp()
);
create index on zukait_mechanical.receipts(actor_id,created_at,request_id);
create table zukait_mechanical.audit (
 request_id uuid primary key references zukait_mechanical.receipts(request_id),
 actor_id text not null references public.staff_credentials(user_id),operation text not null,
 entity_id uuid not null,device_id text not null,reason text not null default '',
 before_value jsonb,after_value jsonb,recorded_at timestamptz not null default clock_timestamp()
);
create index on zukait_mechanical.audit(entity_id,recorded_at,request_id);
-- All tables deny ordinary direct clients, including if this schema is exposed later.
alter table zukait_mechanical.settings enable row level security;
alter table zukait_mechanical.control enable row level security;
alter table zukait_mechanical.checklists enable row level security;
alter table zukait_mechanical.tasks enable row level security;
alter table zukait_mechanical.links enable row level security;
alter table zukait_mechanical.receipts enable row level security;
alter table zukait_mechanical.audit enable row level security;
create table zukait_mechanical.repeat_repairs (
 assignment_id uuid primary key references zukait_mechanical.links(assignment_id),
 source_assignment_id uuid not null references zukait_mechanical.links(assignment_id),
 request_id uuid not null unique references zukait_mechanical.receipts(request_id),
 projection jsonb not null,log_projection jsonb not null,created_at timestamptz not null default clock_timestamp()
);
create index on zukait_mechanical.repeat_repairs(source_assignment_id);
create index on zukait_mechanical.repeat_repairs(request_id);
alter table zukait_mechanical.repeat_repairs enable row level security;
revoke all on all tables in schema zukait_mechanical from public,anon,authenticated,service_role;
grant select on all tables in schema zukait_mechanical to service_role;
grant update(revision,next_sequence) on zukait_mechanical.control to service_role;
grant update(successor_id) on zukait_mechanical.links to service_role;
grant insert on zukait_mechanical.checklists,zukait_mechanical.tasks,zukait_mechanical.links,zukait_mechanical.receipts,zukait_mechanical.audit,zukait_mechanical.repeat_repairs to service_role;
create function zukait_mechanical.append_only() returns trigger language plpgsql security invoker set search_path=pg_catalog as $$
begin raise exception 'mechanical_append_only'; end $$;
create trigger immutable_repeat before update or delete or truncate on zukait_mechanical.repeat_repairs for each statement execute function zukait_mechanical.append_only();
create trigger immutable_receipt before update or delete or truncate on zukait_mechanical.receipts for each statement execute function zukait_mechanical.append_only();
create trigger immutable_audit before update or delete or truncate on zukait_mechanical.audit for each statement execute function zukait_mechanical.append_only();
revoke all on function zukait_mechanical.append_only() from public,anon,authenticated;

-- Lock credentials then session in the same order as account administration.
-- Revocation/deactivation cannot pass this point until the command finishes.
create function zukait_mechanical.authorize_session(p_actor text,p_session_hash text,p_operation text)
returns jsonb language plpgsql security invoker set search_path=pg_catalog as $$
<<scope>>
declare cfg zukait_mechanical.settings; staff_role text;
begin
 select * into cfg from zukait_mechanical.settings where singleton;
 if not coalesce(cfg.enabled,false) then raise exception 'mechanical_disabled';end if;
 if p_session_hash is null or p_session_hash !~ '^[0-9a-f]{64}$' then raise exception 'mechanical_invalid_session';end if;
 select role into staff_role from public.staff_credentials where user_id=p_actor and active for share;
 if staff_role is null or staff_role not in ('Manager','Supervisor','Mechanical Supervisor') then raise exception 'mechanical_forbidden';end if;
 perform 1 from public.staff_sessions where token_hash=p_session_hash and user_id=p_actor and revoked_at is null for share;
 if not found then raise exception 'mechanical_invalid_session';end if;
 if p_operation is null or jsonb_typeof(cfg.capabilities->p_actor) is distinct from 'array' or not coalesce((cfg.capabilities->p_actor) ? p_operation,false) then raise exception 'mechanical_forbidden';end if;
 if p_operation='TASK_REPEAT' and not cfg.repeat_enabled then raise exception 'mechanical_repeat_disabled';end if;
 return jsonb_build_object('repeatEnabled',cfg.repeat_enabled,'flags',jsonb_build_object('mechanical',true),'mechanicalStaff',jsonb_build_object(p_actor,cfg.capabilities->p_actor),'mechanicalDepartment',cfg.department,'manualJcDuplicateMode',cfg.duplicate_jc_mode,'mcNumbering',jsonb_build_object('minimumDigits',cfg.minimum_digits));
end $$;
revoke all on function zukait_mechanical.authorize_session(text,text,text) from public,anon,authenticated;
grant execute on function zukait_mechanical.authorize_session(text,text,text) to service_role;

-- Mechanical and bodyshop use separate JC identities (owner confirmed 26 Oct).
create function zukait_mechanical.assert_separate_job(p_data jsonb,p_jc text,p_department text)
returns void language plpgsql security invoker set search_path=pg_catalog as $$
begin
 if p_department is null then raise exception 'mechanical_policy_required';end if;
 if (select count(*) from jsonb_array_elements(coalesce(p_data->'jobs','[]')) j where upper(trim(j->>'no'))=upper(trim(p_jc)))<>1 then raise exception 'mechanical_job_identity_conflict';end if;
 if exists(select 1 from jsonb_array_elements(coalesce(p_data->'assign','[]')) a
  where upper(trim(a->>'job'))=upper(trim(p_jc)) and not coalesce((a->>'cancelled')::boolean,false)
  and not exists(select 1 from public.staff_credentials c where c.user_id=a->>'emp' and c.role='Employee' and c.department=p_department))
 then raise exception 'mechanical_mixed_job_not_allowed';end if;
end $$;
revoke all on function zukait_mechanical.assert_separate_job(jsonb,text,text) from public,anon,authenticated;
grant execute on function zukait_mechanical.assert_separate_job(jsonb,text,text) to service_role;

create function public.zukait_mechanical_commit(
 p_actor text,p_request uuid,p_fingerprint text,p_expected_records bigint,p_expected_workshop bigint,p_operation text,p_entity uuid,p_device text,p_plan jsonb,p_session_hash text
) returns jsonb language plpgsql security invoker set search_path=pg_catalog,public,zukait_mechanical as $$
<<scope>>
declare
 cfg zukait_mechanical.settings; ctl zukait_mechanical.control; receipt zukait_mechanical.receipts;
 staff_role text; ws_revision bigint; ws jsonb; ws_by text; ws_at timestamptz;
 item jsonb; assignment jsonb; source_before jsonb; source_after jsonb; source_id uuid; v_task_id uuid; checklist_id uuid;
 jc text; number_text text; linked_job text; successor uuid; target text; assigned jsonb; next_assign jsonb;
 result jsonb; is_shared boolean:=false; original_ws jsonb; repeat_source uuid; repeat_assign jsonb; repeat_map jsonb; repeat_periods jsonb; cycle_no bigint; cycle_id text; mistake text; repeat_log jsonb;
begin
 perform zukait_mechanical.authorize_session(p_actor,p_session_hash,p_operation);
 select * into cfg from zukait_mechanical.settings where singleton;
 if not coalesce(cfg.enabled,false) then raise exception 'mechanical_disabled';end if;
 select role into staff_role from public.staff_credentials where user_id=p_actor and active;
 if staff_role is null or staff_role not in ('Manager','Supervisor','Mechanical Supervisor') or jsonb_typeof(cfg.capabilities->p_actor) is distinct from 'array' or not coalesce((cfg.capabilities->p_actor) ? p_operation,false) then raise exception 'mechanical_forbidden';end if;
 if p_operation not in ('MC_CREATE','TASK_CREATE','TASK_ASSIGN','TASK_HANDOVER','TASK_REPEAT') then raise exception 'mechanical_operation_not_implemented';end if;
 if length(coalesce(p_plan->>'reason',''))>500 then raise exception 'invalid_reason';end if;
 if p_request is null or p_entity is null or p_fingerprint is null or p_fingerprint !~ '^[0-9a-f]{64}$' or p_device is null or length(p_device) not between 1 and 128 or jsonb_typeof(p_plan) is distinct from 'object' or octet_length(p_plan::text)>131072 then raise exception 'invalid_mechanical_plan';end if;
 -- One lock order for new writes: Mechanical control, then shared workshop row.
 select * into ctl from zukait_mechanical.control where singleton for update;
 select * into receipt from zukait_mechanical.receipts where request_id=p_request;
 if found then
  if receipt.actor_id<>p_actor or receipt.fingerprint<>p_fingerprint or receipt.result->>'operation' is distinct from p_operation or receipt.result->>'entityId' is distinct from p_entity::text then raise exception 'mechanical_request_reused';end if;
  return receipt.result||'{"duplicate":true}'::jsonb;
 end if;
 if p_expected_records is null or ctl.revision<>p_expected_records then raise exception 'mechanical_revision_conflict';end if;
 select revision,data,updated_by,updated_at into ws_revision,ws,ws_by,ws_at from public.workshop_state where id='main' for update;
 if not found or p_expected_workshop is null or ws_revision<>p_expected_workshop then raise exception 'workshop_revision_conflict';end if;
 if ctl.revision>=9007199254740991 or ws_revision>=9007199254740991 then raise exception 'revision_exhausted';end if;
 original_ws:=ws;
 item:=p_plan->'record';
 if p_operation='MC_CREATE' then
  if cfg.minimum_digits is null or cfg.reset_mode is distinct from 'continuous' or cfg.duplicate_jc_mode is null then raise exception 'mechanical_policy_required';end if;
  if ctl.next_sequence>9007199254740991 then raise exception 'mc_sequence_exhausted';end if;
  number_text:='MC'||lpad(ctl.next_sequence::text,greatest(cfg.minimum_digits,length(ctl.next_sequence::text)),'0');
  if item->>'id' is distinct from p_entity::text or item->>'number' is distinct from number_text then raise exception 'mc_allocation_conflict';end if;
  jc:=item->'manualJobCard'->>'number';
  if jc is null or length(jc) not between 1 and 80 or not exists(select 1 from jsonb_array_elements(coalesce(ws->'jobs','[]')) j where j->>'no'=jc and not coalesce((j->>'delivered')::boolean,false) and not coalesce((j->>'cancelled')::boolean,false) and not coalesce((j->>'deleted')::boolean,false) and not coalesce((j->>'archived')::boolean,false)) then raise exception 'existing_active_jc_required';end if;
  perform zukait_mechanical.assert_separate_job(ws,jc,cfg.department);
  if cfg.duplicate_jc_mode='deny' and exists(select 1 from zukait_mechanical.checklists where job_card=jc) then raise exception 'manual_jc_duplicate';end if;
  if item->'manualJobCard'->>'date' is null or (item->'manualJobCard'->>'date') !~ '^\d{4}-\d{2}-\d{2}$' then raise exception 'invalid_manual_jc_date';end if;
  insert into zukait_mechanical.checklists(id,number,sequence_no,job_card,manual_jc_date,created_by)
  values(p_entity,number_text,ctl.next_sequence,jc,(item->'manualJobCard'->>'date')::date,p_actor);
  update zukait_mechanical.control set next_sequence=next_sequence+1 where singleton;
 elsif p_operation='TASK_CREATE' then
  if item->>'id' is distinct from p_entity::text then raise exception 'invalid_task';end if;
  select job_card into jc from zukait_mechanical.checklists where id=(item->>'checklistId')::uuid;
  if not found then raise exception 'checklist_missing';end if;
  insert into zukait_mechanical.tasks(id,checklist_id,title,created_by) values(p_entity,(item->>'checklistId')::uuid,item->>'title',p_actor);
 else
  assignment:=p_plan->'assignment';source_before:=p_plan->'sourceBefore';source_after:=p_plan->'sourceAfter';
  select t.id,c.id,c.job_card into v_task_id,checklist_id,jc from zukait_mechanical.tasks t join zukait_mechanical.checklists c on c.id=t.checklist_id where t.id=p_entity;
  if not found or cfg.department is null then raise exception 'task_or_department_missing';end if;
  if assignment->>'mechanicalTaskId' is distinct from v_task_id::text or assignment->>'mechanicalChecklistId' is distinct from checklist_id::text or assignment->>'job' is distinct from jc then raise exception 'assignment_scope_invalid';end if;
  successor:=(assignment->>'id')::uuid;target:=assignment->>'emp';
  if successor is null or not exists(select 1 from public.staff_credentials where user_id=target and role='Employee' and active and department=cfg.department) then raise exception 'invalid_mechanic';end if;
  if not exists(select 1 from jsonb_array_elements(coalesce(ws->'users','[]')) u where u->>'id'=target and u->>'role'='Employee' and coalesce(u->>'active','true')='true' and u->>'department'=cfg.department) then raise exception 'invalid_mechanic';end if;
  if exists(select 1 from jsonb_array_elements(coalesce(ws->'assign','[]')) a where a->>'id'=successor::text) then raise exception 'assignment_id_exists';end if;
  if (assignment-array['id','job','emp','suggested','completed','cancelled','rework','assignedBy','assignedAt','mechanicalChecklistId','mechanicalTaskId','handoverFromAssignmentId','mechanicalRepeatOfAssignmentId','repeatCycleId','repeatCycleNo','repeatReason','mistakeEmp','repeatSameEmployee','v125Cycle'])<>'{}'::jsonb or jsonb_typeof(assignment->'assignedAt') is distinct from 'number' or (assignment->>'assignedAt')::numeric<=0 or (assignment->>'assignedAt')::numeric>extract(epoch from clock_timestamp())*1000+1000 then raise exception 'assignment_fields_invalid';end if;
  if p_operation='TASK_ASSIGN' and assignment ? 'handoverFromAssignmentId' then raise exception 'assignment_fields_invalid';end if;
  if p_operation<>'TASK_REPEAT' and assignment ?| array['mechanicalRepeatOfAssignmentId','repeatCycleId','repeatCycleNo','repeatReason','mistakeEmp','repeatSameEmployee','v125Cycle'] then raise exception 'assignment_fields_invalid';end if;
  if jsonb_typeof(assignment->'suggested') is distinct from 'number' or (assignment->>'suggested')::numeric<>trunc((assignment->>'suggested')::numeric) or (assignment->>'suggested')::numeric not between 0 and 60000 or assignment->'completed' is distinct from 'false'::jsonb or assignment->'cancelled' is distinct from 'false'::jsonb or assignment->'rework' is distinct from to_jsonb(p_operation='TASK_REPEAT') or assignment->>'assignedBy' is distinct from p_actor then raise exception 'assignment_fields_invalid';end if;
  if exists(select 1 from zukait_mechanical.links l join lateral jsonb_array_elements(coalesce(ws->'assign','[]')) a on a->>'id'=l.assignment_id::text where l.task_id=v_task_id and l.employee_id=target and l.successor_id is null and not coalesce((a->>'completed')::boolean,false) and not coalesce((a->>'cancelled')::boolean,false)) then raise exception 'duplicate_task_employee';end if;
  if p_operation='TASK_REPEAT' then
   if assignment?'handoverFromAssignmentId' or jsonb_typeof(source_before) is distinct from 'object' then raise exception 'invalid_repeat';end if;
   repeat_source:=(source_before->>'id')::uuid;
   select coalesce(jsonb_agg(a),'[]') into repeat_assign from (select a from jsonb_array_elements(coalesce(ws->'assign','[]')) a where a->>'job'=jc limit 501) x;
   select coalesce(jsonb_agg(s),'[]') into repeat_periods from (select s from jsonb_array_elements(coalesce(ws->'sessions','[]')) s where s->>'job'=jc limit 10001) x;
   if jsonb_array_length(repeat_assign)>500 or jsonb_array_length(repeat_periods)>10000 or (select count(*) from zukait_mechanical.tasks rt where rt.checklist_id=scope.checklist_id)>100 or (select count(*) from zukait_mechanical.links l join zukait_mechanical.tasks t on t.id=l.task_id where t.checklist_id=scope.checklist_id)>500 then raise exception 'mechanical_context_limit';end if;
   if exists(select 1 from jsonb_array_elements(repeat_assign) a group by a->>'id' having count(*)>1) or (select count(*) from jsonb_array_elements(ws->'jobs') j where j->>'no'=jc)<>1 then raise exception 'mechanical_qc_scope_review';end if;
   select coalesce(jsonb_object_agg(a->>'id',a),'{}') into repeat_map from jsonb_array_elements(repeat_assign) a;
   assigned:=repeat_map->repeat_source::text;
   if assigned is null or assigned is distinct from source_before or assigned->'completed' is distinct from 'true'::jsonb or coalesce((assigned->>'cancelled')::boolean,false) or not exists(select 1 from zukait_mechanical.links l where l.assignment_id=repeat_source and l.task_id=v_task_id and l.successor_id is null) then raise exception 'repeat_source_inactive';end if;
   if not exists(select 1 from jsonb_array_elements(repeat_assign) a where not coalesce((a->>'cancelled')::boolean,false) and not coalesce((a->>'rework')::boolean,false)) or exists(select 1 from jsonb_array_elements(repeat_assign) a where not coalesce((a->>'cancelled')::boolean,false) and a->'completed' is distinct from 'true'::jsonb) or exists(select 1 from jsonb_array_elements(repeat_periods) s where not coalesce((s->>'cancelled')::boolean,false) and not coalesce((s->>'voided')::boolean,false) and not coalesce((s->>'deleted')::boolean,false) and coalesce(s->>'end','') in ('','0','null')) then raise exception 'repeat_work_not_finished';end if;
   if exists(select 1 from zukait_mechanical.tasks t where t.checklist_id=scope.checklist_id and
    (not exists(select 1 from zukait_mechanical.links l where l.task_id=t.id and l.successor_id is null and not coalesce((repeat_map->l.assignment_id::text->>'cancelled')::boolean,false) and repeat_map->l.assignment_id::text->'completed'='true'::jsonb)
    or exists(select 1 from zukait_mechanical.links l where l.task_id=t.id and l.successor_id is null and not coalesce((repeat_map->l.assignment_id::text->>'cancelled')::boolean,false) and repeat_map->l.assignment_id::text->'completed' is distinct from 'true'::jsonb))) then raise exception 'repeat_work_not_finished';end if;
   mistake:=assignment->>'mistakeEmp';if not exists(select 1 from public.staff_credentials where user_id=mistake and role='Employee') then raise exception 'invalid_repeat_employee';end if;
   if exists(select 1 from jsonb_array_elements(repeat_assign) a where coalesce((a->>'rework')::boolean,false) and not coalesce((a->>'cancelled')::boolean,false) and a?'repeatCycleNo' and coalesce(a->>'repeatCycleNo','0') !~ '^[0-9]+$') then raise exception 'repeat_cycle_review_required';end if;
   select coalesce(nullif(max(coalesce(a->>'repeatCycleNo','0')::numeric),0),count(*))+1 into cycle_no from jsonb_array_elements(repeat_assign) a where coalesce((a->>'rework')::boolean,false) and not coalesce((a->>'cancelled')::boolean,false);
   cycle_id:='repeat-'||jc||'-'||p_request::text;
   if cycle_no not between 1 and 9007199254740991 or (assignment->>'suggested')::numeric<1 or assignment->>'mechanicalRepeatOfAssignmentId' is distinct from repeat_source::text or assignment->>'repeatCycleId' is distinct from cycle_id or assignment->'repeatCycleNo' is distinct from to_jsonb(cycle_no) or assignment->'repeatSameEmployee' is distinct from to_jsonb(target=mistake) or assignment->'v125Cycle' is distinct from 'true'::jsonb or length(trim(coalesce(p_plan->>'reason',''))) not between 1 and 500 or assignment->>'repeatReason' is distinct from trim(p_plan->>'reason') then raise exception 'invalid_repeat';end if;
   if exists(select 1 from jsonb_array_elements(coalesce(ws->'reworkLogs','[]')) r where r->>'id'=p_request::text or r->>'assignmentId'=successor::text) then raise exception 'mechanical_request_reused';end if;
   repeat_log:=jsonb_build_object('id',p_request,'assignmentId',successor,'repeatCycleId',cycle_id,'repeatCycleNo',cycle_no,'job',jc,'emp',target,'mistakeEmp',mistake,'suggested',assignment->'suggested','reason',assignment->>'repeatReason','by',p_actor,'at',assignment->'assignedAt');
   ws:=jsonb_set(ws,'{reworkLogs}',coalesce(ws->'reworkLogs','[]')||jsonb_build_array(repeat_log));
   ws:=jsonb_set(ws,'{jobs}',(select jsonb_agg(case when j->>'no'=jc then jsonb_set(j-'completedAt','{status}','"Open"'::jsonb) else j end order by n) from jsonb_array_elements(ws->'jobs') with ordinality x(j,n)));
  end if;
  if p_operation='TASK_HANDOVER' then
   source_id:=(source_before->>'id')::uuid;
   select a into assigned from jsonb_array_elements(coalesce(ws->'assign','[]')) a where a->>'id'=source_id::text;
   if assigned is null or assigned is distinct from source_before or not exists(select 1 from zukait_mechanical.links where assignment_id=source_id and task_id=v_task_id and successor_id is null) then raise exception 'handover_source_changed';end if;
   if coalesce((assigned->>'completed')::boolean,false) or coalesce((assigned->>'cancelled')::boolean,false) or coalesce((assigned->>'rework')::boolean,false) or assigned->>'emp'=target then raise exception 'handover_source_inactive';end if;
   if length(trim(coalesce(p_plan->>'reason',''))) not between 1 and 500 then raise exception 'handover_reason_required';end if;
   if exists(select 1 from jsonb_array_elements(coalesce(ws->'sessions','[]')) s where s->>'emp' in (assigned->>'emp',target) and not coalesce((s->>'cancelled')::boolean,false) and not coalesce((s->>'voided')::boolean,false) and not coalesce((s->>'deleted')::boolean,false) and (s->>'end' is null or s->>'end' in ('','0','null'))) then raise exception 'stop_work_before_handover';end if;
   -- Shared revision + source equality bind the plan; recheck periods without
   -- sending historical employee-session arrays through the internal RPC.
   if exists(select 1 from jsonb_array_elements(coalesce(ws->'sessions','[]')) s
     where (s->>'assignmentId'=source_id::text or (coalesce(s->>'assignmentId','')='' and s->>'emp'=assigned->>'emp' and s->>'job'=jc))
     and case when coalesce(s->>'start','') ~ '^[0-9]+$' and coalesce(s->>'end','') ~ '^[0-9]+$'
       then (s->>'start')::numeric<=0 or (s->>'end')::numeric<(s->>'start')::numeric or (s->>'end')::numeric>extract(epoch from clock_timestamp())*1000
       else true end) then raise exception 'handover_time_review_required';end if;
   if jsonb_typeof(source_after->'completedAt') is distinct from 'number' or (source_after->>'completedAt')::numeric<=0 or (source_after->>'completedAt')::numeric>extract(epoch from clock_timestamp())*1000+1000 then raise exception 'handover_time_review_required';end if;
   if source_after->'completed' is distinct from 'true'::jsonb or source_after->>'handedOverToAssignmentId' is distinct from successor::text or (source_after-array['completed','completedAt','handedOverToAssignmentId']) is distinct from (assigned-array['completed','completedAt','handedOverToAssignmentId']) or assignment->>'handoverFromAssignmentId' is distinct from source_id::text then raise exception 'handover_history_protected';end if;
  end if;
  insert into zukait_mechanical.links(assignment_id,task_id,employee_id,predecessor_id,created_by) values(successor,v_task_id,target,source_id,p_actor);
  if source_id is not null then update zukait_mechanical.links set successor_id=successor where assignment_id=source_id;end if;
  select coalesce(jsonb_agg(case when a->>'id'=source_id::text then source_after else a end order by n),'[]')||jsonb_build_array(assignment) into next_assign from jsonb_array_elements(coalesce(ws->'assign','[]')) with ordinality x(a,n);
  -- Preserve all other sections and use the existing state triggers as authority.
  insert into public.workshop_state_history(revision,data,updated_at,updated_by) values(ws_revision,original_ws,ws_at,ws_by) on conflict(revision) do nothing;
  update public.workshop_state set data=jsonb_set(ws,'{assign}',next_assign),revision=ws_revision+1,updated_at=clock_timestamp(),updated_by=p_actor where id='main';
  is_shared:=true;
 end if;
 -- Every linked operation rechecks the live JC under the same workshop lock.
 if not exists(select 1 from jsonb_array_elements(coalesce(ws->'jobs','[]')) j where j->>'no'=jc and not coalesce((j->>'delivered')::boolean,false) and not coalesce((j->>'cancelled')::boolean,false) and not coalesce((j->>'deleted')::boolean,false) and not coalesce((j->>'archived')::boolean,false)) then raise exception 'job_inactive';end if;
 update zukait_mechanical.control set revision=revision+1 where singleton;
 result:=jsonb_build_object('ok',true,'requestId',p_request,'operation',p_operation,'entityId',p_entity,'recordsRevision',ctl.revision+1,'workshopRevision',ws_revision+case when is_shared then 1 else 0 end,'number',number_text,'assignmentId',successor);
 insert into zukait_mechanical.receipts(request_id,actor_id,fingerprint,result) values(p_request,p_actor,p_fingerprint,result);
 insert into zukait_mechanical.audit(request_id,actor_id,operation,entity_id,device_id,reason,before_value,after_value) values(p_request,p_actor,p_operation,p_entity,p_device,coalesce(p_plan->>'reason',''),source_before,coalesce(assignment,item));
 if p_operation='TASK_REPEAT' then insert into zukait_mechanical.repeat_repairs(assignment_id,source_assignment_id,request_id,projection,log_projection) values(successor,repeat_source,p_request,assignment,repeat_log);end if;
 return result;
end $$;
revoke all on function public.zukait_mechanical_commit(text,uuid,text,bigint,bigint,text,uuid,text,jsonb,text) from public,anon,authenticated;
grant execute on function public.zukait_mechanical_commit(text,uuid,text,bigint,bigint,text,uuid,text,jsonb,text) to service_role;
