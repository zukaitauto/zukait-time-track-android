-- Additive Mechanical schema, compiled from the independently qualified candidates.
-- No account/business data migration and no activation: every setting defaults off.
-- Requires prior staff role migration and existing garage schema.
-- Do not remove authority guards when rolling back client/command flags.

-- SOURCE: experiments/mechanical-persistence.sql
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

-- SOURCE: experiments/mechanical-authority-guard.sql
-- Isolated candidate, loaded AFTER mechanical-persistence.sql. Not a migration.
-- Reject stale full-state writes atomically; do not merge stale employee history.
create function zukait_mechanical.protect_assignment_authority() returns trigger
language plpgsql security invoker set search_path=pg_catalog as $$
declare registered record; department text; by_id jsonb; old_by_id jsonb; link record; candidate jsonb; previous jsonb; field text; source_ids text[]; repeat_logs jsonb;
begin
 -- Disabling new commands must never disable protection of existing handovers.
 if new.data is not distinct from old.data then return new;end if;
 if not exists(select 1 from zukait_mechanical.checklists) then return new;end if;
 select s.department into department from zukait_mechanical.settings s where singleton;
 for registered in select c.job_card from zukait_mechanical.checklists c loop
  perform zukait_mechanical.assert_separate_job(new.data,registered.job_card,department);
 end loop;
 if jsonb_typeof(new.data->'assign') is distinct from 'array' then raise exception 'mechanical_authority_conflict';end if;
 if exists(select 1 from jsonb_array_elements(new.data->'assign') a group by a->>'id' having count(*)>1) then raise exception 'mechanical_authority_conflict';end if;
 select coalesce(jsonb_object_agg(a->>'id',a) filter(where a->>'id' is not null),'{}') into by_id from jsonb_array_elements(new.data->'assign') a;
 select coalesce(jsonb_object_agg(a->>'id',a) filter(where a->>'id' is not null),'{}') into old_by_id from jsonb_array_elements(coalesce(old.data->'assign','[]')) a;
 if exists(select 1 from zukait_mechanical.repeat_repairs) then
  if jsonb_typeof(new.data->'reworkLogs') is distinct from 'array' then raise exception 'mechanical_authority_conflict';end if;
  select coalesce(jsonb_object_agg(id,jsonb_build_object('count',n,'log',item)),'{}') into repeat_logs from (select r->>'id' id,count(*) n,jsonb_agg(r)->0 item from jsonb_array_elements(new.data->'reworkLogs') r where r->>'id' is not null group by r->>'id') x;
 end if;
 for link in select l.*,t.checklist_id,c.job_card,r.projection repeat_projection,r.log_projection,r.request_id repeat_request from zukait_mechanical.links l
  join zukait_mechanical.tasks t on t.id=l.task_id join zukait_mechanical.checklists c on c.id=t.checklist_id left join zukait_mechanical.repeat_repairs r on r.assignment_id=l.assignment_id
 loop
  candidate:=by_id->link.assignment_id::text;previous:=old_by_id->link.assignment_id::text;
  if candidate is null or candidate->>'emp' is distinct from link.employee_id
   or candidate->>'job' is distinct from link.job_card
   or candidate->>'mechanicalTaskId' is distinct from link.task_id::text
   or candidate->>'mechanicalChecklistId' is distinct from link.checklist_id::text
   or candidate->>'handoverFromAssignmentId' is distinct from link.predecessor_id::text
   or candidate->>'handedOverToAssignmentId' is distinct from link.successor_id::text
  then raise exception 'mechanical_authority_conflict';end if;
  if link.repeat_projection is not null then
   foreach field in array array['rework','repeatCycleId','repeatCycleNo','repeatReason','mistakeEmp','repeatSameEmployee','v125Cycle','assignedBy','assignedAt','mechanicalRepeatOfAssignmentId'] loop
    if candidate->field is distinct from link.repeat_projection->field then raise exception 'mechanical_authority_conflict';end if;
   end loop;
   if repeat_logs->link.repeat_request::text->'count' is distinct from '1'::jsonb or not coalesce((repeat_logs->link.repeat_request::text->'log') @> link.log_projection,false) then raise exception 'mechanical_authority_conflict';end if;
  end if;
  if link.successor_id is not null then
   if candidate->'completed' is distinct from 'true'::jsonb then raise exception 'mechanical_authority_conflict';end if;
   -- Once handed over, preserve the original allocation and completion stamp.
   -- Ordinary audited session corrections still belong to existing time rules.
   if previous->>'handedOverToAssignmentId'=link.successor_id::text then
    foreach field in array array['suggested','assignedBy','assignedAt','completedAt'] loop
     if candidate->field is distinct from previous->field then raise exception 'mechanical_authority_conflict';end if;
    end loop;
   end if;
  end if;
 end loop;
 -- Older full-state clients must not resume a completed handover source by
 -- inserting a fresh session while leaving completed=true on the assignment.
 select array_agg(assignment_id::text) into source_ids from zukait_mechanical.links where successor_id is not null;
 if source_ids is not null then
 if exists(select 1 from jsonb_array_elements(coalesce(new.data->'sessions','[]')) s
  where s->>'assignmentId'=any(source_ids) and not coalesce((s->>'cancelled')::boolean,false)
   and not coalesce((s->>'voided')::boolean,false) and not coalesce((s->>'deleted')::boolean,false)
   and case when coalesce(s->>'start','') ~ '^[0-9]+$' and coalesce(s->>'end','') ~ '^[0-9]+$'
     then (s->>'start')::numeric<=0 or (s->>'end')::numeric<(s->>'start')::numeric or
       (s->>'end')::numeric>(by_id->(s->>'assignmentId')->>'completedAt')::numeric
     else true end)
 then raise exception 'mechanical_authority_conflict';end if;
 end if;
 return new;
end $$;
revoke all on function zukait_mechanical.protect_assignment_authority() from public,anon,authenticated;
create trigger mechanical_assignment_authority before update of data on public.workshop_state
 for each row execute function zukait_mechanical.protect_assignment_authority();

-- The legacy commit RPC also accepts p_live AFTER writing workshop_state. An
-- identical-state retry can skip that UPDATE, so guard stale source pointers
-- independently rather than relying on the workshop-state trigger alone.
create function zukait_mechanical.protect_live_assignment() returns trigger
language plpgsql security invoker set search_path=pg_catalog as $$
begin
 -- Existing non-UUID assignment identities are valid legacy data. Test their
 -- shape before casting; preserve the indexed UUID lookup for Mechanical IDs.
 if new.assignment_id ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' then
  if exists(select 1 from zukait_mechanical.links l where l.assignment_id=new.assignment_id::uuid and l.successor_id is not null)
  then raise exception 'mechanical_live_authority_conflict';end if;
 end if;
 return new;
end $$;
revoke all on function zukait_mechanical.protect_live_assignment() from public,anon,authenticated;
create trigger mechanical_live_assignment_authority before insert or update on public.workshop_live_status
 for each row execute function zukait_mechanical.protect_live_assignment();

-- SOURCE: experiments/mechanical-readers.sql
-- Server-only scoped readers. Load after mechanical-persistence.sql in fixtures.
-- Not a generated/applied migration; never return context snapshots to clients.
create function public.zukait_mechanical_read(p_actor text,p_session_hash text,p_operation text,p_kind text,p_request uuid default null,p_entity uuid default null,p_payload jsonb default '{}')
returns jsonb language plpgsql security invoker set search_path=pg_catalog as $$
<<scope>>
declare policy jsonb; prior zukait_mechanical.receipts; ctl zukait_mechanical.control;
 records jsonb; snapshot jsonb; checklist_id uuid; checklists jsonb; tasks jsonb; links jsonb;
begin
 policy:=zukait_mechanical.authorize_session(p_actor,p_session_hash,p_operation);
 if p_operation not in ('MC_CREATE','TASK_CREATE','TASK_ASSIGN','TASK_HANDOVER','TASK_REPEAT') then raise exception 'mechanical_operation_not_implemented';end if;
 if p_kind='policy' then return policy;end if;
 if p_kind='receipt' then
  if p_request is null then raise exception 'invalid_mechanical_command';end if;
  select * into prior from zukait_mechanical.receipts where request_id=p_request;
  if not found then return 'null'::jsonb;end if;
  if prior.actor_id<>p_actor then raise exception 'mechanical_request_reused';end if;
  return jsonb_build_object('actorId',prior.actor_id,'fingerprint',prior.fingerprint,'result',prior.result);
 end if;
 if p_kind is distinct from 'context' or p_entity is null or jsonb_typeof(p_payload) is distinct from 'object' or octet_length(p_payload::text)>8192 then raise exception 'invalid_mechanical_command';end if;
 if p_operation='TASK_CREATE' then
  if coalesce(p_payload->>'checklistId','') !~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' then raise exception 'invalid_mechanical_command';end if;
  checklist_id:=(p_payload->>'checklistId')::uuid;
 elsif p_operation in ('TASK_ASSIGN','TASK_HANDOVER','TASK_REPEAT') then
  select t.checklist_id into checklist_id from zukait_mechanical.tasks t where id=p_entity;
 end if;
 select coalesce(jsonb_agg(jsonb_build_object('id',c.id,'number',c.number,'manualJobCard',jsonb_build_object('number',c.job_card,'date',c.manual_jc_date))),'[]') into checklists
 from zukait_mechanical.checklists c where c.id=checklist_id or (p_operation='MC_CREATE' and (c.id=p_entity or c.job_card=p_payload->'manualJobCard'->>'number'));
 select coalesce(jsonb_agg(jsonb_build_object('id',t.id,'checklistId',t.checklist_id,'title',t.title)),'[]') into tasks from zukait_mechanical.tasks t where t.id=p_entity or (p_operation='TASK_REPEAT' and t.checklist_id=scope.checklist_id);
 select coalesce(jsonb_agg(jsonb_build_object('taskId',l.task_id,'assignmentId',l.assignment_id,'employeeId',l.employee_id)||case when l.successor_id is null then '{}'::jsonb else jsonb_build_object('handedOverTo',l.successor_id) end),'[]') into links
 from (select * from zukait_mechanical.links where task_id=p_entity or (p_operation='TASK_REPEAT' and task_id in(select rt.id from zukait_mechanical.tasks rt where rt.checklist_id=scope.checklist_id)) order by assignment_id limit 501) l;
 if jsonb_array_length(links)>500 then raise exception 'mechanical_context_limit';end if;
 select * into ctl from zukait_mechanical.control where singleton;
 if p_operation in ('MC_CREATE','TASK_CREATE') then
  -- Metadata commands need only the selected JC's active flags. Never carry
  -- all employee history through an internal RPC to register a title/date.
  select jsonb_build_object('revision',w.revision,'data',jsonb_build_object('users','[]'::jsonb,'assign','[]'::jsonb,'sessions','[]'::jsonb,
    'jobs',coalesce((select jsonb_agg(jsonb_build_object('no',j->>'no','delivered',j->'delivered','cancelled',j->'cancelled','archived',j->'archived','deleted',j->'deleted'))
      from jsonb_array_elements(coalesce(w.data->'jobs','[]')) j where j->>'no'=case when p_operation='MC_CREATE' then p_payload->'manualJobCard'->>'number'
      else (select c.job_card from zukait_mechanical.checklists c where c.id=checklist_id) end),'[]'::jsonb))) into snapshot from public.workshop_state w where w.id='main';
 elsif p_operation='TASK_REPEAT' then
  select jsonb_build_object('revision',w.revision,'data',jsonb_build_object(
   'jobs',coalesce((select jsonb_agg(jsonb_build_object('no',j->'no','status',j->'status','delivered',j->'delivered','cancelled',j->'cancelled','archived',j->'archived','deleted',j->'deleted')) from jsonb_array_elements(coalesce(w.data->'jobs','[]')) j where j->>'no'=(select job_card from zukait_mechanical.checklists where id=scope.checklist_id)),'[]'),
   'assign',coalesce((select jsonb_agg(x.a) from (select a from jsonb_array_elements(coalesce(w.data->'assign','[]')) a where a->>'job'=(select job_card from zukait_mechanical.checklists where id=scope.checklist_id) limit 501) x),'[]'),
   'sessions',coalesce((select jsonb_agg(jsonb_build_object('id',x.s->'id','job',x.s->'job','end',x.s->'end','cancelled',x.s->'cancelled','voided',x.s->'voided','deleted',x.s->'deleted')) from (select s from jsonb_array_elements(coalesce(w.data->'sessions','[]')) s where s->>'job'=(select job_card from zukait_mechanical.checklists where id=scope.checklist_id) limit 10001) x),'[]'),
   'users',coalesce((select jsonb_agg(jsonb_build_object('id',user_id,'role',role,'active',active,'department',department)) from public.staff_credentials where role='Employee'),'[]'))) into snapshot from public.workshop_state w where w.id='main';
  if jsonb_array_length(snapshot->'data'->'assign')>500 or jsonb_array_length(snapshot->'data'->'sessions')>10000 or jsonb_array_length(tasks)>100 then raise exception 'mechanical_context_limit';end if;
 else
  select jsonb_build_object('revision',revision,'data',data) into snapshot from public.workshop_state where id='main';
 end if;
 if snapshot is null then raise exception 'workshop_missing';end if;
 records:=jsonb_build_object('revision',ctl.revision,'checklists',checklists,'tasks',tasks,'links',links,'receipts','[]'::jsonb,'audit','[]'::jsonb);
 return jsonb_build_object('records',records,'snapshot',snapshot,'nextSequence',ctl.next_sequence);
end $$;
revoke all on function public.zukait_mechanical_read(text,text,text,text,uuid,uuid,jsonb) from public,anon,authenticated;
grant execute on function public.zukait_mechanical_read(text,text,text,text,uuid,uuid,jsonb) to service_role;

-- SOURCE: experiments/mechanical-dashboard.sql
-- Bounded foreground UI projection. Fixture SQL, not an applied migration.
create function public.zukait_mechanical_dashboard(p_actor text,p_session_hash text,p_after bigint default 0,p_checklist uuid default null)
returns jsonb language plpgsql security invoker set search_path=pg_catalog as $$
declare cfg zukait_mechanical.settings; operation text; policy jsonb; rows jsonb; detail jsonb;
 mechanics jsonb; tasks jsonb; assignments jsonb; selected jsonb; revision bigint; workshop_revision bigint;
 next_after bigint; assignment_map jsonb; repeat_people jsonb;
begin
 select * into cfg from zukait_mechanical.settings where singleton;
 select value into operation from jsonb_array_elements_text(case when jsonb_typeof(cfg.capabilities->p_actor)='array' then cfg.capabilities->p_actor else '[]'::jsonb end)
 where value in ('MC_CREATE','TASK_CREATE','TASK_ASSIGN','TASK_HANDOVER','TASK_REPEAT','MECHANICAL_QC','MECHANICAL_DELIVER') limit 1;
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
    'rework',coalesce((assignment_map->l.assignment_id::text->>'rework')::boolean,false),'repeatCycleNo',assignment_map->l.assignment_id::text->'repeatCycleNo','repeatOf',assignment_map->l.assignment_id::text->'mechanicalRepeatOfAssignmentId',
    'responsibleName',responsible.display_name,'repeatReason',assignment_map->l.assignment_id::text->'repeatReason',
    'suggestedMinutes',assignment_map->l.assignment_id::text->'suggested','completed',coalesce((assignment_map->l.assignment_id::text->>'completed')::boolean,false),
    'cancelled',coalesce((assignment_map->l.assignment_id::text->>'cancelled')::boolean,false),'handedOverTo',l.successor_id,'handoverFrom',l.predecessor_id,
    'running',coalesce(s.status in ('Working','ID001','Overtime'),false)) order by l.created_at,l.assignment_id),'[]') into assignments
  from (select l.* from zukait_mechanical.links l join zukait_mechanical.tasks t on t.id=l.task_id where t.checklist_id=p_checklist order by l.created_at,l.assignment_id limit 201) l
   join public.staff_credentials c on c.user_id=l.employee_id left join public.workshop_live_status s on s.employee_id=l.employee_id left join public.staff_credentials responsible on responsible.user_id=assignment_map->l.assignment_id::text->>'mistakeEmp';
  if jsonb_array_length(assignments)>200 then raise exception 'mechanical_dashboard_limit';end if;
  if cfg.repeat_enabled and (policy->'mechanicalStaff'->p_actor)?'TASK_REPEAT' then
   select coalesce(jsonb_agg(jsonb_build_object('id',user_id,'name',display_name||case when active then '' else ' (inactive)' end)),'[]') into repeat_people from(select user_id,display_name,active from public.staff_credentials where role='Employee' order by user_id limit 201) c;
   if jsonb_array_length(repeat_people)>200 then raise exception 'mechanical_dashboard_limit';end if;
  end if;
  detail:=jsonb_build_object('checklist',selected,'tasks',tasks,'assignments',assignments);
 end if;
 return jsonb_build_object('ok',true,'recordsRevision',revision,'workshopRevision',workshop_revision,'capabilities',policy->'mechanicalStaff'->p_actor,
  'reportsAvailable',coalesce((to_jsonb(cfg)->>'reports_enabled')::boolean,false) and jsonb_typeof(to_jsonb(cfg)->'report_readers'->p_actor)='array' and coalesce((to_jsonb(cfg)->'report_readers'->p_actor)?'TASK_REPORT',false),'signedDocumentsAvailable',p_actor='SUP003' and coalesce((to_jsonb(cfg)->>'documents_enabled')::boolean,false) and coalesce((to_jsonb(cfg)->>'signatures_enabled')::boolean,false) and jsonb_typeof(to_jsonb(cfg)->'signature_writers'->p_actor)='array' and coalesce((to_jsonb(cfg)->'signature_writers'->p_actor)?'OWN_SIGNATURE',false) and coalesce((to_jsonb(cfg)->'signature_writers'->p_actor)?'SIGNED_UNPRICED',false) and jsonb_typeof(to_jsonb(cfg)->'document_readers'->p_actor)='array' and coalesce((to_jsonb(cfg)->'document_readers'->p_actor)?'UNPRICED',false),'signaturesAvailable',p_actor='SUP003' and jsonb_typeof(to_jsonb(cfg)->'signature_writers'->p_actor)='array' and jsonb_typeof(to_jsonb(cfg)->'document_readers'->p_actor)='array' and coalesce((to_jsonb(cfg)->>'documents_enabled')::boolean,false) and coalesce((to_jsonb(cfg)->'document_readers'->p_actor)?'UNPRICED',false) and coalesce((to_jsonb(cfg)->>'signatures_enabled')::boolean,false) and coalesce((to_jsonb(cfg)->'signature_writers'->p_actor)?'OWN_SIGNATURE',false),'documentsAvailable',coalesce((to_jsonb(cfg)->>'documents_enabled')::boolean,false) and jsonb_typeof(to_jsonb(cfg)->'document_readers'->p_actor)='array' and coalesce((to_jsonb(cfg)->'document_readers'->p_actor)?'UNPRICED',false),'repeatAvailable',cfg.repeat_enabled,'repeatMistakeEmployees',coalesce(repeat_people,'[]'),'departmentConfigured',cfg.department is not null,'qcAvailable',coalesce((to_jsonb(cfg)->>'qc_enabled')::boolean,false),'deliveryAvailable',coalesce((to_jsonb(cfg)->>'delivery_enabled')::boolean,false),'mechanics',mechanics,'checklists',rows,'nextAfter',next_after,'detail',detail);
end $$;
revoke all on function public.zukait_mechanical_dashboard(text,text,bigint,uuid) from public,anon,authenticated;
grant execute on function public.zukait_mechanical_dashboard(text,text,bigint,uuid) to service_role;

-- SOURCE: experiments/mechanical-qc-persistence.sql
-- Disposable fixture candidate ONLY; not a generated/applied production migration.
-- Draft route is gated off separately. Delivery integration/guards remain required.
alter table zukait_mechanical.settings add column qc_enabled boolean not null default false;
-- NULL means the owner has not selected a mixed-job policy. Never infer true/false.
alter table zukait_mechanical.settings add column mixed_mechanical_qc_required boolean;
create table zukait_mechanical.qc_events (
 request_id uuid primary key references zukait_mechanical.receipts(request_id),
 checklist_id uuid not null references zukait_mechanical.checklists(id),
 actor_id text not null references public.staff_credentials(user_id) check(actor_id='SUP003'),
 result text not null check(result in ('PASS','FAIL')),
 reason text not null check(length(reason)<=500 and (result<>'FAIL' or length(trim(reason))>0)),
 route text not null check(route in ('MECHANICAL_ONLY','MIXED')),
 work_fingerprint text not null check(work_fingerprint ~ '^[0-9a-f]{64}$'),
 source_records_revision bigint not null check(source_records_revision>=0),
 source_workshop_revision bigint not null check(source_workshop_revision>=0),
 records_revision bigint not null unique,
 recorded_at timestamptz not null default clock_timestamp()
);
create index on zukait_mechanical.qc_events(checklist_id,records_revision desc);
alter table zukait_mechanical.qc_events enable row level security;
revoke all on zukait_mechanical.qc_events from public,anon,authenticated,service_role;
grant select,insert on zukait_mechanical.qc_events to service_role;
create trigger immutable_qc_event before update or delete or truncate on zukait_mechanical.qc_events for each statement execute function zukait_mechanical.append_only();
create function public.zukait_mechanical_qc_commit(
 p_actor text,p_request uuid,p_fingerprint text,p_expected_records bigint,p_expected_workshop bigint,p_entity uuid,p_device text,p_plan jsonb,p_session_hash text
) returns jsonb language plpgsql security invoker set search_path=pg_catalog as $$
declare cfg zukait_mechanical.settings; ctl zukait_mechanical.control; receipt zukait_mechanical.receipts;
 ws_revision bigint; jc text; ws jsonb; result jsonb;
begin
 perform zukait_mechanical.authorize_session(p_actor,p_session_hash,'MECHANICAL_QC');
 -- Keep settings read-only for service_role; no privilege to enable itself.
 select * into cfg from zukait_mechanical.settings where singleton;
 if not cfg.qc_enabled then raise exception 'mechanical_qc_disabled';end if;
 if p_actor is distinct from 'SUP003' or not exists(select 1 from public.staff_credentials where user_id=p_actor and role in ('Supervisor','Mechanical Supervisor') and active) then raise exception 'mechanical_qc_approver_required';end if;
 if cfg.department is null then raise exception 'mechanical_qc_policy_required';end if;
 if p_request is null or p_entity is null or p_fingerprint is null or p_fingerprint !~ '^[0-9a-f]{64}$' or p_device is null or length(p_device) not between 1 and 128 or jsonb_typeof(p_plan) is distinct from 'object' or octet_length(p_plan::text)>4096 then raise exception 'invalid_mechanical_qc_plan';end if;
 if (p_plan-array['result','reason','route','workFingerprint'])<>'{}'::jsonb or coalesce(p_plan->>'result','') not in ('PASS','FAIL') or jsonb_typeof(p_plan->'reason') is distinct from 'string' or length(p_plan->>'reason')>500 or (p_plan->>'result'='FAIL' and length(trim(p_plan->>'reason'))=0) or coalesce(p_plan->>'route','') not in ('MECHANICAL_ONLY','MIXED') or coalesce(p_plan->>'workFingerprint','') !~ '^[0-9a-f]{64}$' then raise exception 'invalid_mechanical_qc_plan';end if;
 -- Same ordering as the existing Mechanical commit: session, control, workshop.
 select * into ctl from zukait_mechanical.control where singleton for update;
 select * into receipt from zukait_mechanical.receipts where request_id=p_request;
 if found then
  if receipt.actor_id is distinct from p_actor or receipt.fingerprint is distinct from p_fingerprint or receipt.result->>'operation' is distinct from 'MECHANICAL_QC' or receipt.result->>'entityId' is distinct from p_entity::text then raise exception 'mechanical_request_reused';end if;
  return receipt.result||'{"duplicate":true}'::jsonb;
 end if;
 if p_expected_records is null or ctl.revision<>p_expected_records then raise exception 'mechanical_revision_conflict';end if;
 select revision,data into ws_revision,ws from public.workshop_state where id='main' for update;
 if not found or p_expected_workshop is null or ws_revision<>p_expected_workshop then raise exception 'workshop_revision_conflict';end if;
 if ctl.revision>=9007199254740991 or ws_revision>=9007199254740991 then raise exception 'revision_exhausted';end if;
 select job_card into jc from zukait_mechanical.checklists where id=p_entity;
 if not found then raise exception 'mechanical_checklist_required';end if;
 if not exists(select 1 from jsonb_array_elements(coalesce(ws->'jobs','[]')) j where upper(trim(j->>'no'))=upper(trim(jc)) and upper(trim(j->>'no'))<>'ID001' and not coalesce((j->>'delivered')::boolean,false) and not coalesce((j->>'cancelled')::boolean,false) and not coalesce((j->>'deleted')::boolean,false) and not coalesce((j->>'archived')::boolean,false) and upper(coalesce(j->>'status',''))<>'CANCELLED') then raise exception 'job_inactive';end if;
 if p_plan->>'route'='MIXED' then
  raise exception 'mechanical_mixed_job_not_allowed';
  if not cfg.mixed_mechanical_qc_required then raise exception 'mechanical_mixed_qc_not_required';end if;
 end if;
 -- Only the trusted server evaluator constructs this digest/route after work checks.
 -- Both locked revisions bind it to the snapshot evaluated; no full state/history
 -- or session token arrays enter this RPC. This is not a public work evaluator.
 result:=jsonb_build_object('ok',true,'requestId',p_request,'operation','MECHANICAL_QC','entityId',p_entity,'recordsRevision',ctl.revision+1,'workshopRevision',ws_revision,'requiresReadinessRefresh',true);
 insert into zukait_mechanical.receipts(request_id,actor_id,fingerprint,result) values(p_request,p_actor,p_fingerprint,result);
 insert into zukait_mechanical.qc_events(request_id,checklist_id,actor_id,result,reason,route,work_fingerprint,source_records_revision,source_workshop_revision,records_revision)
 values(p_request,p_entity,p_actor,p_plan->>'result',trim(p_plan->>'reason'),p_plan->>'route',p_plan->>'workFingerprint',ctl.revision,ws_revision,ctl.revision+1);
 insert into zukait_mechanical.audit(request_id,actor_id,operation,entity_id,device_id,reason,after_value) values(p_request,p_actor,'MECHANICAL_QC',p_entity,p_device,trim(p_plan->>'reason'),p_plan);
 update zukait_mechanical.control set revision=revision+1 where singleton;
 return result;
end $$;
revoke all on function public.zukait_mechanical_qc_commit(text,uuid,text,bigint,bigint,uuid,text,jsonb,text) from public,anon,authenticated;
grant execute on function public.zukait_mechanical_qc_commit(text,uuid,text,bigint,bigint,uuid,text,jsonb,text) to service_role;

-- SOURCE: experiments/mechanical-qc-readers.sql
-- Fixture ONLY. Load after mechanical-qc-persistence.sql. Never expose context.
create function public.zukait_mechanical_qc_read(p_actor text,p_session_hash text,p_kind text,p_entity uuid default null,p_request uuid default null)
returns jsonb language plpgsql security invoker set search_path=pg_catalog as $$
declare cfg zukait_mechanical.settings; operation text; policy jsonb; prior zukait_mechanical.receipts;
 revision bigint; ws_revision bigint; ws jsonb; jc text; checklists jsonb; tasks jsonb; links jsonb;
 assignments jsonb; sessions jsonb; users jsonb; jobs jsonb; approval jsonb;
begin
 select * into cfg from zukait_mechanical.settings where singleton;
 if p_kind='delivery_context' then
  policy:=zukait_mechanical.authorize_delivery(p_actor,p_session_hash);
 else
  select value into operation from jsonb_array_elements_text(case when jsonb_typeof(cfg.capabilities->p_actor)='array' then cfg.capabilities->p_actor else '[]'::jsonb end)
  where value in ('MC_CREATE','TASK_CREATE','TASK_ASSIGN','TASK_HANDOVER','MECHANICAL_QC','MECHANICAL_DELIVER') limit 1;
  policy:=zukait_mechanical.authorize_session(p_actor,p_session_hash,operation);
 end if;
 if not cfg.qc_enabled then raise exception 'mechanical_qc_disabled';end if;
 policy:=policy||jsonb_build_object('mechanicalDeliveryEnabled',coalesce((to_jsonb(cfg)->>'delivery_enabled')::boolean,false),'qc',jsonb_build_object('mechanicalApproverId','SUP003','mechanicalOnlyMode','SOLE_MECHANICAL_APPROVER','mixedPaintingApproverId','SUP002','mixedFinalApproverId','SUP001','mixedMechanicalRequired',cfg.mixed_mechanical_qc_required));
 if p_kind='policy' then return policy;end if;
 if p_kind='receipt' then
  if p_request is null then raise exception 'invalid_mechanical_command';end if;
  perform zukait_mechanical.authorize_session(p_actor,p_session_hash,'MECHANICAL_QC');
  if p_actor<>'SUP003' then raise exception 'mechanical_qc_approver_required';end if;
  select * into prior from zukait_mechanical.receipts where request_id=p_request;
  if not found then return 'null'::jsonb;end if;
  if prior.actor_id<>p_actor then raise exception 'mechanical_request_reused';end if;
  return jsonb_build_object('actorId',prior.actor_id,'fingerprint',prior.fingerprint,'result',prior.result);
 end if;
 if p_kind not in ('context','delivery_context') or p_kind is null or p_entity is null then raise exception 'invalid_mechanical_command';end if;
 -- Capture both revisions with the workshop in one statement snapshot.
 -- Control is read first as in writers, but no row locks/writes on this path.
 select c.revision,w.revision,w.data into revision,ws_revision,ws from zukait_mechanical.control c cross join public.workshop_state w where c.singleton and w.id='main';
 if ws_revision is null then raise exception 'workshop_missing';end if;
 -- Each following statement may observe concurrent normalized writes. The
 -- ending revision check rejects that result; commands still use locked CAS.
 select c.job_card,jsonb_build_array(jsonb_build_object('id',c.id,'number',c.number,'manualJobCard',jsonb_build_object('number',c.job_card,'date',c.manual_jc_date))) into jc,checklists from zukait_mechanical.checklists c where c.id=p_entity;
 if jc is null then raise exception 'mechanical_checklist_missing';end if;
 select coalesce(jsonb_agg(jsonb_build_object('id',t.id,'checklistId',t.checklist_id,'title',t.title)),'[]') into tasks from (select * from zukait_mechanical.tasks where checklist_id=p_entity order by id limit 101) t;
 select coalesce(jsonb_agg(jsonb_build_object('taskId',l.task_id,'assignmentId',l.assignment_id,'employeeId',l.employee_id)||case when l.successor_id is null then '{}'::jsonb else jsonb_build_object('handedOverTo',l.successor_id) end),'[]') into links
 from (select l.* from zukait_mechanical.links l join zukait_mechanical.tasks t on t.id=l.task_id where t.checklist_id=p_entity order by l.assignment_id limit 501) l;
 select coalesce(jsonb_agg(jsonb_build_object('id',a->'id','job',a->'job','emp',a->'emp','completed',a->'completed','completedAt',a->'completedAt','cancelled',a->'cancelled','rework',a->'rework','mechanicalTaskId',a->'mechanicalTaskId','mechanicalChecklistId',a->'mechanicalChecklistId','handedOverToAssignmentId',a->'handedOverToAssignmentId')),'[]') into assignments from (select a from jsonb_array_elements(coalesce(ws->'assign','[]')) a where upper(trim(a->>'job'))=upper(trim(jc)) limit 501) a;
 select coalesce(jsonb_agg(jsonb_build_object('id',s->'id','job',s->'job','emp',s->'emp','assignmentId',s->'assignmentId','start',s->'start','end',s->'end','paused',s->'paused','cancelled',s->'cancelled','voided',s->'voided','deleted',s->'deleted')),'[]') into sessions
 from (select s from jsonb_array_elements(coalesce(ws->'sessions','[]')) s where upper(trim(s->>'job'))=upper(trim(jc)) limit 10001) s;
 if jsonb_array_length(tasks)>100 or jsonb_array_length(links)>500 or jsonb_array_length(assignments)>500 or jsonb_array_length(sessions)>10000 then raise exception 'mechanical_context_limit';end if;
 -- Departments come from trusted credentials, not client-editable user JSON.
 select coalesce(jsonb_agg(jsonb_build_object('id',c.user_id,'department',c.department)),'[]') into users from public.staff_credentials c where c.user_id in (select a->>'emp' from jsonb_array_elements(assignments) a);
 select coalesce(jsonb_agg(jsonb_build_object('no',j->'no','receptionNo',j->'receptionNo','vehicle',j->'vehicle','reg',j->'reg','status',j->'status','delivered',j->'delivered','cancelled',j->'cancelled','deleted',j->'deleted','archived',j->'archived','qcWorkflow',j->'qcWorkflow')),'[]') into jobs from jsonb_array_elements(coalesce(ws->'jobs','[]')) j where upper(trim(j->>'no'))=upper(trim(jc));
 if jsonb_array_length(jobs)<>1 then raise exception 'mechanical_qc_scope_review';end if;
 if p_kind='delivery_context' and exists(select 1 from public.staff_credentials where user_id=p_actor and role='Receptionist') and coalesce(jobs->0->>'receptionNo','')='' then raise exception 'mechanical_forbidden';end if;
 select jsonb_build_object('requestId',e.request_id,'by',e.actor_id,'result',e.result,'workFingerprint',e.work_fingerprint) into approval from zukait_mechanical.qc_events e where e.checklist_id=p_entity order by e.records_revision desc limit 1;
 if revision is distinct from (select c.revision from zukait_mechanical.control c where c.singleton) or ws_revision is distinct from (select w.revision from public.workshop_state w where w.id='main') then raise exception 'mechanical_revision_conflict';end if;
 return jsonb_build_object('policy',policy,'records',jsonb_build_object('revision',revision,'checklists',checklists,'tasks',tasks,'links',links,'receipts','[]'::jsonb,'audit','[]'::jsonb),
  'snapshot',jsonb_build_object('revision',ws_revision,'data',jsonb_build_object('users',users,'jobs',jobs,'assign',assignments,'sessions',sessions)),'approval',approval);
end $$;
revoke all on function public.zukait_mechanical_qc_read(text,text,text,uuid,uuid) from public,anon,authenticated;
grant execute on function public.zukait_mechanical_qc_read(text,text,text,uuid,uuid) to service_role;

-- SOURCE: experiments/mechanical-delivery.sql
-- Disposable fixture candidate ONLY. Draft route requires separate off-by-default gates.
alter table zukait_mechanical.settings add column delivery_enabled boolean not null default false;
create table zukait_mechanical.deliveries (
 request_id uuid primary key references zukait_mechanical.receipts(request_id),
 checklist_id uuid not null unique references zukait_mechanical.checklists(id),
 actor_id text not null references public.staff_credentials(user_id),
 qc_request_id uuid references zukait_mechanical.qc_events(request_id),
 work_fingerprint text not null check(work_fingerprint ~ '^[0-9a-f]{64}$'),
 route text not null check(route in ('MECHANICAL_ONLY','MIXED')),
 source_records_revision bigint not null,source_workshop_revision bigint not null,
 records_revision bigint not null unique,workshop_revision bigint not null,
 projection jsonb not null,recorded_at timestamptz not null default clock_timestamp()
);
alter table zukait_mechanical.deliveries enable row level security;
revoke all on zukait_mechanical.deliveries from public,anon,authenticated,service_role;
grant select,insert on zukait_mechanical.deliveries to service_role;
create trigger immutable_delivery before update or delete or truncate on zukait_mechanical.deliveries for each statement execute function zukait_mechanical.append_only();

create function public.zukait_mechanical_deliver(p_actor text,p_request uuid,p_fingerprint text,p_expected_records bigint,p_expected_workshop bigint,p_entity uuid,p_device text,p_plan jsonb,p_session_hash text)
returns jsonb language plpgsql security invoker set search_path=pg_catalog as $$
declare cfg zukait_mechanical.settings; ctl zukait_mechanical.control; prior zukait_mechanical.receipts; qc zukait_mechanical.qc_events;
 staff_role text; staff_name text; jc text; ws jsonb; ws_revision bigint; ws_by text; ws_at timestamptz; job jsonb; after_job jsonb; jobs jsonb; audit jsonb; projection jsonb; result jsonb; at_ms bigint; qc_revision bigint; needs_mechanical boolean;
begin
 select * into cfg from zukait_mechanical.settings where singleton;
 if not coalesce(cfg.enabled and cfg.qc_enabled and cfg.delivery_enabled,false) then raise exception 'mechanical_delivery_disabled';end if;
 if p_session_hash is null or p_session_hash !~ '^[0-9a-f]{64}$' then raise exception 'mechanical_invalid_session';end if;
 select role,display_name into staff_role,staff_name from public.staff_credentials where user_id=p_actor and active for share;
 if staff_role is null or staff_role not in ('Supervisor','Receptionist','Mechanical Supervisor') or jsonb_typeof(cfg.capabilities->p_actor) is distinct from 'array' or not coalesce((cfg.capabilities->p_actor)?'MECHANICAL_DELIVER',false) then raise exception 'mechanical_forbidden';end if;
 perform 1 from public.staff_sessions where token_hash=p_session_hash and user_id=p_actor and revoked_at is null for share;
 if not found then raise exception 'mechanical_invalid_session';end if;
 if cfg.department is null then raise exception 'mechanical_qc_policy_required';end if;
 if p_request is null or p_entity is null or p_fingerprint is null or p_fingerprint !~ '^[0-9a-f]{64}$' or p_device is null or length(p_device) not between 1 and 128 or jsonb_typeof(p_plan) is distinct from 'object' or octet_length(p_plan::text)>2048 then raise exception 'invalid_mechanical_delivery';end if;
 if (p_plan-array['route','workFingerprint','qcRequestId'])<>'{}'::jsonb or coalesce(p_plan->>'route','') not in ('MECHANICAL_ONLY','MIXED') or coalesce(p_plan->>'workFingerprint','') !~ '^[0-9a-f]{64}$' then raise exception 'invalid_mechanical_delivery';end if;
 -- Credentials/session, then control, then workshop: same order as QC writes.
 select * into ctl from zukait_mechanical.control where singleton for update;
 select * into prior from zukait_mechanical.receipts where request_id=p_request;
 if found then
  if prior.actor_id is distinct from p_actor or prior.fingerprint is distinct from p_fingerprint or prior.result->>'operation' is distinct from 'MECHANICAL_DELIVER' or prior.result->>'entityId' is distinct from p_entity::text then raise exception 'mechanical_request_reused';end if;
  return prior.result||'{"duplicate":true}'::jsonb;
 end if;
 if p_expected_records is null or ctl.revision<>p_expected_records then raise exception 'mechanical_revision_conflict';end if;
 select revision,data,updated_by,updated_at into ws_revision,ws,ws_by,ws_at from public.workshop_state where id='main' for update;
 if not found or p_expected_workshop is null or ws_revision<>p_expected_workshop then raise exception 'workshop_revision_conflict';end if;
 if ctl.revision>=9007199254740991 or ws_revision>=9007199254740991 then raise exception 'revision_exhausted';end if;
 select job_card into jc from zukait_mechanical.checklists where id=p_entity;
 if not found then raise exception 'mechanical_checklist_required';end if;
 if (select count(*) from jsonb_array_elements(coalesce(ws->'jobs','[]')) j where upper(trim(j->>'no'))=upper(trim(jc)))<>1 then raise exception 'mechanical_qc_scope_review';end if;
 select j into job from jsonb_array_elements(ws->'jobs') j where upper(trim(j->>'no'))=upper(trim(jc));
 if upper(trim(jc))='ID001' or coalesce((job->>'delivered')::boolean,false) or coalesce((job->>'cancelled')::boolean,false) or coalesce((job->>'deleted')::boolean,false) or coalesce((job->>'archived')::boolean,false) or upper(coalesce(job->>'status',''))='CANCELLED' then raise exception 'job_inactive';end if;
 if staff_role='Receptionist' and coalesce(job->>'receptionNo','')='' then raise exception 'mechanical_forbidden';end if;
 if p_plan->>'route'='MIXED' then raise exception 'mechanical_mixed_job_not_allowed';end if;
 perform zukait_mechanical.assert_separate_job(ws,jc,cfg.department);
 needs_mechanical:=p_plan->>'route'='MECHANICAL_ONLY' or cfg.mixed_mechanical_qc_required;
 if needs_mechanical then
  select * into qc from zukait_mechanical.qc_events where checklist_id=p_entity order by records_revision desc limit 1;
  if not found or qc.result<>'PASS' or qc.actor_id<>'SUP003' or qc.request_id::text is distinct from p_plan->>'qcRequestId' or qc.work_fingerprint is distinct from p_plan->>'workFingerprint' or qc.route is distinct from p_plan->>'route' then raise exception 'mechanical_delivery_not_ready';end if;
 elsif p_plan->>'qcRequestId' is not null then raise exception 'invalid_mechanical_delivery';end if;
 -- Work/route/legacy QC are evaluated by the trusted server planner, bound to
 -- locked revisions. Never expose this internal service RPC to ordinary roles.
 at_ms:=floor(extract(epoch from clock_timestamp())*1000)::bigint;
 qc_revision:=coalesce((job->'qcWorkflow'->>'revision')::bigint,0);
 if qc_revision<0 or qc_revision>=9007199254740991 then raise exception 'revision_exhausted';end if;
 audit:=jsonb_build_object('operation','DELIVER','by',p_actor,'name',staff_name,'at',at_ms);
 projection:=jsonb_build_object('delivered',true,'deliveredAt',at_ms,'deliveredBy',p_actor,'deliveredByName',staff_name,'status','Delivered','qcPassed',true,'mechanicalDelivery',jsonb_build_object('requestId',p_request,'checklistId',p_entity));
 after_job:=job||projection||jsonb_build_object('qcWorkflow',(case when jsonb_typeof(job->'qcWorkflow')='object' then job->'qcWorkflow' else '{}'::jsonb end)||jsonb_build_object('revision',qc_revision+1,'history',(case when jsonb_typeof(job->'qcWorkflow'->'history')='array' then job->'qcWorkflow'->'history' else '[]'::jsonb end)||jsonb_build_array(audit)));
 result:=jsonb_build_object('ok',true,'requestId',p_request,'operation','MECHANICAL_DELIVER','entityId',p_entity,'recordsRevision',ctl.revision+1,'workshopRevision',ws_revision+1);
 insert into zukait_mechanical.receipts(request_id,actor_id,fingerprint,result) values(p_request,p_actor,p_fingerprint,result);
 insert into zukait_mechanical.deliveries(request_id,checklist_id,actor_id,qc_request_id,work_fingerprint,route,source_records_revision,source_workshop_revision,records_revision,workshop_revision,projection)
 values(p_request,p_entity,p_actor,case when needs_mechanical then qc.request_id else null end,p_plan->>'workFingerprint',p_plan->>'route',ctl.revision,ws_revision,ctl.revision+1,ws_revision+1,projection);
 insert into zukait_mechanical.audit(request_id,actor_id,operation,entity_id,device_id,after_value) values(p_request,p_actor,'MECHANICAL_DELIVER',p_entity,p_device,projection);
 select jsonb_agg(case when upper(trim(j->>'no'))=upper(trim(jc)) then after_job else j end order by n) into jobs from jsonb_array_elements(ws->'jobs') with ordinality x(j,n);
 insert into public.workshop_state_history(revision,data,updated_at,updated_by) values(ws_revision,ws,ws_at,ws_by) on conflict(revision) do nothing;
 update public.workshop_state set data=jsonb_set(ws,'{jobs}',jobs),revision=ws_revision+1,updated_by=p_actor,updated_at=clock_timestamp() where id='main';
 update zukait_mechanical.control set revision=revision+1 where singleton;
 return result;
end $$;
revoke all on function public.zukait_mechanical_deliver(text,uuid,text,bigint,bigint,uuid,text,jsonb,text) from public,anon,authenticated;
grant execute on function public.zukait_mechanical_deliver(text,uuid,text,bigint,bigint,uuid,text,jsonb,text) to service_role;

create function zukait_mechanical.protect_delivery() returns trigger language plpgsql security invoker set search_path=pg_catalog as $$
declare current_jobs jsonb; next_jobs jsonb; next_counts jsonb; c record; before_job jsonb; after_job jsonb; permit zukait_mechanical.deliveries; field text; correction jsonb; delivered_jobs text[];
begin
 if new.data is not distinct from old.data or not exists(select 1 from zukait_mechanical.checklists) then return new;end if;
 if jsonb_typeof(new.data->'jobs') is distinct from 'array' then raise exception 'mechanical_delivery_authority_conflict';end if;
 select coalesce(jsonb_object_agg(upper(trim(j->>'no')),j),'{}') into current_jobs from jsonb_array_elements(coalesce(old.data->'jobs','[]')) j;
 select coalesce(jsonb_object_agg(no,value),'{}'),coalesce(jsonb_object_agg(no,n),'{}') into next_jobs,next_counts
 from (select upper(trim(j->>'no')) no,jsonb_agg(j)->0 value,count(*) n from jsonb_array_elements(new.data->'jobs') j where j->>'no' is not null group by upper(trim(j->>'no'))) x;
 -- No control locks here: legacy saves already hold workshop; reversing the
 -- order would deadlock against a Mechanical control->workshop writer.
 for c in select id,job_card from zukait_mechanical.checklists loop
  before_job:=current_jobs->upper(trim(c.job_card));after_job:=next_jobs->upper(trim(c.job_card));
  -- Preserve unrelated writes if legacy metadata has no current job at all.
  if before_job is null and after_job is null then continue;end if;
  if after_job is null or (next_counts->>upper(trim(c.job_card)))::bigint<>1 then raise exception 'mechanical_delivery_authority_conflict';end if;
  if not coalesce((before_job->>'delivered')::boolean,false) then
   if coalesce((after_job->>'delivered')::boolean,false) or after_job ? 'mechanicalDelivery' or upper(coalesce(after_job->>'status',''))='DELIVERED' then
    select * into permit from zukait_mechanical.deliveries where checklist_id=c.id and source_workshop_revision=old.revision and workshop_revision=new.revision;
    if not found or new.updated_by is distinct from permit.actor_id or (select jsonb_object_agg(k,after_job->k) from jsonb_object_keys(permit.projection) k) is distinct from permit.projection then raise exception 'mechanical_delivery_authority_conflict';end if;
   end if;
  else
   foreach field in array array['delivered','deliveredBy','deliveredByName','status','mechanicalDelivery','qcPassed'] loop
    if after_job->field is distinct from before_job->field then raise exception 'mechanical_delivery_authority_conflict';end if;
   end loop;
   if after_job->'deliveredAt' is distinct from before_job->'deliveredAt' then
    correction:=after_job->'deliveryAudit'->-1;
    if not exists(select 1 from public.staff_credentials where user_id=new.updated_by and role='Manager' and active)
     or correction->>'operation' is distinct from 'DELIVERY_DATE_CORRECTION' or correction->>'by' is distinct from new.updated_by
     or correction->'from' is distinct from before_job->'deliveredAt' or correction->'to' is distinct from after_job->'deliveredAt'
     or coalesce(correction->>'reason','')='' or length(correction->>'reason')>2000
     or coalesce((correction->>'to')::numeric,0)<=0
     or ((after_job->'deliveryAudit') - (jsonb_array_length(after_job->'deliveryAudit')-1)) is distinct from coalesce(before_job->'deliveryAudit','[]'::jsonb)
     or (after_job->'qcWorkflow'->>'revision')::bigint is distinct from coalesce((before_job->'qcWorkflow'->>'revision')::bigint,0)+1
     or after_job->'qcWorkflow'->'history' is distinct from (coalesce(before_job->'qcWorkflow'->'history','[]'::jsonb)||jsonb_build_array(correction))
    then raise exception 'mechanical_delivery_authority_conflict';end if;
   end if;
  end if;
 end loop;
 -- Preserve closed historical corrections, but an older full save cannot
 -- reopen allocations or append running periods to an actual delivered job.
 if new.data->'assign' is distinct from old.data->'assign' or new.data->'sessions' is distinct from old.data->'sessions' then
  select array_agg(upper(trim(registered.job_card))) into delivered_jobs from zukait_mechanical.deliveries d join zukait_mechanical.checklists registered on registered.id=d.checklist_id;
  if delivered_jobs is not null then
   if exists(select 1 from jsonb_array_elements(coalesce(new.data->'assign','[]')) a where upper(trim(a->>'job'))=any(delivered_jobs) and not coalesce((a->>'cancelled')::boolean,false) and a->'completed' is distinct from 'true'::jsonb)
    or exists(select 1 from jsonb_array_elements(coalesce(new.data->'sessions','[]')) s where upper(trim(s->>'job'))=any(delivered_jobs) and not coalesce((s->>'cancelled')::boolean,false) and not coalesce((s->>'voided')::boolean,false) and not coalesce((s->>'deleted')::boolean,false) and (s->>'end' is null or s->>'end' in ('','0','null')))
   then raise exception 'mechanical_delivery_authority_conflict';end if;
  end if;
 end if;
 return new;
end $$;
revoke all on function zukait_mechanical.protect_delivery() from public,anon,authenticated;
create trigger mechanical_delivery_authority before update of data on public.workshop_state for each row execute function zukait_mechanical.protect_delivery();

-- Identical-state legacy RPC retries can still write p_live without a state
-- UPDATE. Protect that independent write path as well, with no flag bypass.
create function zukait_mechanical.protect_delivered_live() returns trigger language plpgsql security invoker set search_path=pg_catalog as $$
begin
 if new.status in ('Working','Paused','Overtime','ID001') then
  if exists(select 1 from zukait_mechanical.deliveries d join zukait_mechanical.checklists c on c.id=d.checklist_id where upper(trim(c.job_card))=upper(trim(new.job_no))) then raise exception 'mechanical_delivery_authority_conflict';end if;
  if new.assignment_id ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' then
   if exists(select 1 from zukait_mechanical.links l join zukait_mechanical.tasks t on t.id=l.task_id join zukait_mechanical.deliveries d on d.checklist_id=t.checklist_id where l.assignment_id=new.assignment_id::uuid) then raise exception 'mechanical_delivery_authority_conflict';end if;
  end if;
 end if;
 return new;
end $$;
revoke all on function zukait_mechanical.protect_delivered_live() from public,anon,authenticated;
create trigger mechanical_delivered_live_authority before insert or update on public.workshop_live_status for each row execute function zukait_mechanical.protect_delivered_live();

-- SOURCE: experiments/mechanical-delivery-readers.sql
-- Fixture ONLY. Load after mechanical-delivery.sql. No production migration.
create function zukait_mechanical.authorize_delivery(p_actor text,p_session_hash text) returns jsonb language plpgsql security invoker set search_path=pg_catalog as $$
declare cfg zukait_mechanical.settings; staff_role text;
begin
 select * into cfg from zukait_mechanical.settings where singleton;
 if not coalesce(cfg.enabled and cfg.qc_enabled and cfg.delivery_enabled,false) then raise exception 'mechanical_delivery_disabled';end if;
 if p_session_hash is null or p_session_hash !~ '^[0-9a-f]{64}$' then raise exception 'mechanical_invalid_session';end if;
 select role into staff_role from public.staff_credentials where user_id=p_actor and active for share;
 if staff_role is null or staff_role not in ('Supervisor','Receptionist','Mechanical Supervisor') or jsonb_typeof(cfg.capabilities->p_actor) is distinct from 'array' or not coalesce((cfg.capabilities->p_actor)?'MECHANICAL_DELIVER',false) then raise exception 'mechanical_forbidden';end if;
 perform 1 from public.staff_sessions where token_hash=p_session_hash and user_id=p_actor and revoked_at is null for share;
 if not found then raise exception 'mechanical_invalid_session';end if;
 return jsonb_build_object('flags',jsonb_build_object('mechanical',true),'mechanicalDeliveryEnabled',true,'mechanicalDepartment',cfg.department,'mechanicalStaff',jsonb_build_object(p_actor,cfg.capabilities->p_actor),'qc',jsonb_build_object('mechanicalApproverId','SUP003','mechanicalOnlyMode','SOLE_MECHANICAL_APPROVER','mixedPaintingApproverId','SUP002','mixedFinalApproverId','SUP001','mixedMechanicalRequired',cfg.mixed_mechanical_qc_required));
end $$;
revoke all on function zukait_mechanical.authorize_delivery(text,text) from public,anon,authenticated;
grant execute on function zukait_mechanical.authorize_delivery(text,text) to service_role;

-- Lookup preserves ordinary delivery rights: no Mechanical capability is
-- required merely to learn that an ordinary JC has no Mechanical checklist.
create function public.zukait_mechanical_delivery_lookup(p_actor text,p_session_hash text,p_job_card text) returns jsonb language plpgsql security invoker set search_path=pg_catalog as $$
declare staff_role text; checklist uuid; linked boolean;
begin
 if p_session_hash is null or p_session_hash !~ '^[0-9a-f]{64}$' then raise exception 'mechanical_invalid_session';end if;
 select role into staff_role from public.staff_credentials where user_id=p_actor and active for share;
 if staff_role is null or staff_role not in ('Supervisor','Receptionist','Mechanical Supervisor') then raise exception 'mechanical_forbidden';end if;
 perform 1 from public.staff_sessions where token_hash=p_session_hash and user_id=p_actor and revoked_at is null for share;
 if not found then raise exception 'mechanical_invalid_session';end if;
 if p_job_card is null or length(trim(p_job_card)) not between 1 and 80 then raise exception 'invalid_mechanical_command';end if;
 if (select count(*) from zukait_mechanical.checklists where upper(trim(job_card))=upper(trim(p_job_card)))>1 then raise exception 'mechanical_qc_scope_review';end if;
 select id into checklist from zukait_mechanical.checklists where upper(trim(job_card))=upper(trim(p_job_card));
 if checklist is null then return jsonb_build_object('ok',true,'registered',false);end if;
 if staff_role='Receptionist' then
  select exists(select 1 from public.workshop_state w cross join lateral jsonb_array_elements(coalesce(w.data->'jobs','[]')) j where w.id='main' and upper(trim(j->>'no'))=upper(trim(p_job_card)) and coalesce(j->>'receptionNo','')<>'') into linked;
  if not linked then raise exception 'mechanical_forbidden';end if;
 end if;
 return jsonb_build_object('ok',true,'registered',true,'checklistId',checklist);
end $$;
revoke all on function public.zukait_mechanical_delivery_lookup(text,text,text) from public,anon,authenticated;
grant execute on function public.zukait_mechanical_delivery_lookup(text,text,text) to service_role;

create function public.zukait_mechanical_delivery_read(p_actor text,p_session_hash text,p_kind text,p_entity uuid default null,p_request uuid default null) returns jsonb language plpgsql security invoker set search_path=pg_catalog as $$
declare policy jsonb; prior zukait_mechanical.receipts; context jsonb;
begin
 policy:=zukait_mechanical.authorize_delivery(p_actor,p_session_hash);
 if p_kind='policy' then return policy;end if;
 if p_kind='receipt' then
  if p_request is null then raise exception 'invalid_mechanical_command';end if;
  select * into prior from zukait_mechanical.receipts where request_id=p_request;
  if not found then return 'null'::jsonb;end if;
  if prior.actor_id<>p_actor then raise exception 'mechanical_request_reused';end if;
  return jsonb_build_object('actorId',prior.actor_id,'fingerprint',prior.fingerprint,'result',prior.result);
 end if;
 if p_kind is distinct from 'context' or p_entity is null then raise exception 'invalid_mechanical_command';end if;
 context:=public.zukait_mechanical_qc_read(p_actor,p_session_hash,'delivery_context',p_entity,null);
 if exists(select 1 from public.staff_credentials where user_id=p_actor and role='Receptionist') and coalesce(context->'snapshot'->'data'->'jobs'->0->>'receptionNo','')='' then raise exception 'mechanical_forbidden';end if;
 return context;
end $$;
revoke all on function public.zukait_mechanical_delivery_read(text,text,text,uuid,uuid) from public,anon,authenticated;
grant execute on function public.zukait_mechanical_delivery_read(text,text,text,uuid,uuid) to service_role;

-- SOURCE: experiments/mechanical-qc-overview.sql
-- Read-only fixture candidate. One bounded current-state/metadata projection,
-- not per-row RPCs and never historical workshop_state_history JSON.
create function public.zukait_mechanical_qc_overview_read(p_actor text,p_session_hash text) returns jsonb language plpgsql security invoker set search_path=pg_catalog as $$
declare cfg zukait_mechanical.settings; staff_role text; revision bigint; ws_revision bigint; ws jsonb;
 jobs jsonb; job_keys jsonb; assignments jsonb; sessions jsonb; users jsonb; checklists jsonb; tasks jsonb; links jsonb; approvals jsonb; policy jsonb;
begin
 select * into cfg from zukait_mechanical.settings where singleton;
 if not coalesce(cfg.enabled and cfg.qc_enabled,false) then raise exception 'mechanical_qc_disabled';end if;
 if p_session_hash is null or p_session_hash !~ '^[0-9a-f]{64}$' then raise exception 'mechanical_invalid_session';end if;
 select role into staff_role from public.staff_credentials where user_id=p_actor and active for share;
 if staff_role is null or staff_role not in ('Supervisor','Manager','Mechanical Supervisor') then raise exception 'mechanical_forbidden';end if;
 perform 1 from public.staff_sessions where token_hash=p_session_hash and user_id=p_actor and revoked_at is null for share;
 if not found then raise exception 'mechanical_invalid_session';end if;
 select c.revision,w.revision,w.data into revision,ws_revision,ws from zukait_mechanical.control c cross join public.workshop_state w where c.singleton and w.id='main';
 if ws_revision is null then raise exception 'workshop_missing';end if;
 select coalesce(jsonb_agg(jsonb_build_object('no',j->'no','vehicle',j->'vehicle','reg',j->'reg','status',j->'status','qcWorkflow',jsonb_build_object('fingerprint',j->'qcWorkflow'->'fingerprint','painting',j->'qcWorkflow'->'painting','final',j->'qcWorkflow'->'final'))),'[]') into jobs
 from (select j from jsonb_array_elements(coalesce(ws->'jobs','[]')) j where upper(trim(j->>'no'))<>'ID001' and not coalesce((j->>'delivered')::boolean,false) and not coalesce((j->>'cancelled')::boolean,false) and not coalesce((j->>'deleted')::boolean,false) and not coalesce((j->>'archived')::boolean,false) and upper(coalesce(j->>'status',''))<>'CANCELLED' limit 1001) j;
 if jsonb_array_length(jobs)>1000 then raise exception 'mechanical_overview_limit';end if;
 if exists(select 1 from jsonb_array_elements(jobs) j group by upper(trim(j->>'no')) having count(*)>1) then raise exception 'mechanical_qc_scope_review';end if;
 select coalesce(jsonb_object_agg(upper(trim(j->>'no')),true),'{}') into job_keys from jsonb_array_elements(jobs) j;
 select coalesce(jsonb_agg(jsonb_build_object('id',c.id,'manualJobCard',jsonb_build_object('number',c.job_card))),'[]') into checklists from (select * from zukait_mechanical.checklists where job_keys?upper(trim(job_card)) limit 1001) c;
 select coalesce(jsonb_agg(jsonb_build_object('id',t.id,'checklistId',t.checklist_id,'title',t.title)),'[]') into tasks from (select t.* from zukait_mechanical.tasks t join zukait_mechanical.checklists c on c.id=t.checklist_id where job_keys?upper(trim(c.job_card)) limit 5001) t;
 select coalesce(jsonb_agg(jsonb_build_object('assignmentId',l.assignment_id,'taskId',l.task_id,'employeeId',l.employee_id)||case when l.successor_id is null then '{}'::jsonb else jsonb_build_object('handedOverTo',l.successor_id) end),'[]') into links
 from (select l.* from zukait_mechanical.links l join zukait_mechanical.tasks t on t.id=l.task_id join zukait_mechanical.checklists c on c.id=t.checklist_id where job_keys?upper(trim(c.job_card)) limit 10001) l;
 select coalesce(jsonb_agg(jsonb_build_object('id',a->'id','job',a->'job','emp',a->'emp','completed',a->'completed','completedAt',a->'completedAt','cancelled',a->'cancelled','rework',a->'rework','mechanicalTaskId',a->'mechanicalTaskId','mechanicalChecklistId',a->'mechanicalChecklistId','handedOverToAssignmentId',a->'handedOverToAssignmentId')),'[]') into assignments
 from (select a from jsonb_array_elements(coalesce(ws->'assign','[]')) a where job_keys?upper(trim(a->>'job')) limit 10001) a;
 select coalesce(jsonb_agg(jsonb_build_object('id',s->'id','job',s->'job','emp',s->'emp','start',s->'start','end',s->'end','paused',s->'paused','cancelled',s->'cancelled','voided',s->'voided','deleted',s->'deleted')),'[]') into sessions
 from (select s from jsonb_array_elements(coalesce(ws->'sessions','[]')) s where job_keys?upper(trim(s->>'job')) limit 50001) s;
 if jsonb_array_length(checklists)>1000 or jsonb_array_length(tasks)>5000 or jsonb_array_length(links)>10000 or jsonb_array_length(assignments)>10000 or jsonb_array_length(sessions)>50000 then raise exception 'mechanical_overview_limit';end if;
 select coalesce(jsonb_agg(jsonb_build_object('id',user_id,'department',department)),'[]') into users from public.staff_credentials where user_id in (select a->>'emp' from jsonb_array_elements(assignments) a);
 select coalesce(jsonb_agg(jsonb_build_object('checklistId',c.id,'requestId',e.request_id,'by',e.actor_id,'result',e.result,'workFingerprint',e.work_fingerprint,'at',floor(extract(epoch from e.recorded_at)*1000))),'[]') into approvals
 from zukait_mechanical.checklists c join lateral (select * from zukait_mechanical.qc_events e where e.checklist_id=c.id order by records_revision desc limit 1) e on true where job_keys?upper(trim(c.job_card));
 policy:=jsonb_build_object('mechanicalDepartment',cfg.department,'mechanicalStaff',jsonb_build_object(p_actor,coalesce(cfg.capabilities->p_actor,'[]'::jsonb)),'qc',jsonb_build_object('mechanicalApproverId','SUP003','mechanicalOnlyMode','SOLE_MECHANICAL_APPROVER','mixedPaintingApproverId','SUP002','mixedFinalApproverId','SUP001','mixedMechanicalRequired',cfg.mixed_mechanical_qc_required));
 if revision is distinct from (select c.revision from zukait_mechanical.control c where c.singleton) or ws_revision is distinct from (select w.revision from public.workshop_state w where w.id='main') then raise exception 'mechanical_revision_conflict';end if;
 return jsonb_build_object('actor',jsonb_build_object('id',p_actor,'role',staff_role,'active',true),'policy',policy,'records',jsonb_build_object('revision',revision,'checklists',checklists,'tasks',tasks,'links',links),
 'snapshot',jsonb_build_object('revision',ws_revision,'data',jsonb_build_object('jobs',jobs,'assign',assignments,'sessions',sessions,'users',users)),'approvals',approvals);
end $$;
revoke all on function public.zukait_mechanical_qc_overview_read(text,text) from public,anon,authenticated;
grant execute on function public.zukait_mechanical_qc_overview_read(text,text) to service_role;

-- SOURCE: experiments/mechanical-tracking.sql
-- Disposable fixture candidate ONLY. No generated/applied migration.
alter table zukait_mechanical.settings add column tracking_enabled boolean not null default false;
alter table zukait_mechanical.settings add column priority_values jsonb not null default '[]' check(jsonb_typeof(priority_values)='array');
alter table zukait_mechanical.settings add column hold_mode text default 'STATUS_ONLY' check(hold_mode is null or hold_mode='STATUS_ONLY');
create table zukait_mechanical.tracking (
 checklist_id uuid primary key references zukait_mechanical.checklists(id),priority text,promise_date date,waiting_for_parts boolean not null default false,
 updated_by text not null references public.staff_credentials(user_id),updated_at timestamptz not null default clock_timestamp()
);
alter table zukait_mechanical.tracking enable row level security;
revoke all on zukait_mechanical.tracking from public,anon,authenticated,service_role;
grant select,insert,update on zukait_mechanical.tracking to service_role;
create function zukait_mechanical.authorize_tracking(p_actor text,p_session_hash text,p_operation text) returns jsonb language plpgsql security invoker set search_path=pg_catalog as $$
declare cfg zukait_mechanical.settings; staff_role text;
begin
 select * into cfg from zukait_mechanical.settings where singleton;
 if not coalesce(cfg.enabled and cfg.tracking_enabled,false) then raise exception 'mechanical_tracking_disabled';end if;
 if p_session_hash is null or p_session_hash !~ '^[0-9a-f]{64}$' then raise exception 'mechanical_invalid_session';end if;
 select role into staff_role from public.staff_credentials where user_id=p_actor and active for share;
 if staff_role is null or staff_role not in ('Manager','Supervisor','Mechanical Supervisor') then raise exception 'mechanical_forbidden';end if;
 perform 1 from public.staff_sessions where user_id=p_actor and token_hash=p_session_hash and revoked_at is null for share;
 if not found then raise exception 'mechanical_invalid_session';end if;
 if p_operation is not null and (p_operation not in ('PRIORITY_SET','PROMISE_SET','HOLD_SET') or jsonb_typeof(cfg.capabilities->p_actor) is distinct from 'array' or not coalesce((cfg.capabilities->p_actor)?p_operation,false)) then raise exception 'mechanical_forbidden';end if;
 return jsonb_build_object('flags',jsonb_build_object('mechanical',true),'trackingEnabled',true,'mechanicalStaff',jsonb_build_object(p_actor,coalesce(cfg.capabilities->p_actor,'[]')),'priorityValues',cfg.priority_values,'holdMode',cfg.hold_mode);
end $$;
revoke all on function zukait_mechanical.authorize_tracking(text,text,text) from public,anon,authenticated;
grant execute on function zukait_mechanical.authorize_tracking(text,text,text) to service_role;
create function public.zukait_mechanical_tracking_read(p_actor text,p_session_hash text,p_kind text,p_operation text default null,p_entity uuid default null,p_request uuid default null) returns jsonb language plpgsql security invoker set search_path=pg_catalog as $$
declare policy jsonb; ctl bigint; rev bigint; jc text; j jsonb; jobs jsonb; matches integer; row zukait_mechanical.tracking; prior zukait_mechanical.receipts; result jsonb;
begin
 policy:=zukait_mechanical.authorize_tracking(p_actor,p_session_hash,p_operation);
 if p_kind='policy' then return policy;end if;
 if p_kind='receipt' then
  if p_operation is null or p_request is null then raise exception 'invalid_mechanical_command';end if;
  select * into prior from zukait_mechanical.receipts where request_id=p_request;if not found then return 'null'::jsonb;end if;
  if prior.actor_id<>p_actor then raise exception 'mechanical_request_reused';end if;
  return jsonb_build_object('actorId',prior.actor_id,'fingerprint',prior.fingerprint,'result',prior.result);
 end if;
 if p_kind not in ('context','view') or p_entity is null then raise exception 'invalid_mechanical_command';end if;
 select revision into ctl from zukait_mechanical.control where singleton;
 select revision,data->'jobs' into rev,jobs from public.workshop_state where id='main';
 select job_card into jc from zukait_mechanical.checklists where id=p_entity;if jc is null then raise exception 'mechanical_checklist_missing';end if;
 select count(*),jsonb_agg(x)->0 into matches,j from jsonb_array_elements(coalesce(jobs,'[]')) x where upper(trim(x->>'no'))=upper(trim(jc));
 if matches<>1 then raise exception 'mechanical_qc_scope_review';end if;
 select * into row from zukait_mechanical.tracking where checklist_id=p_entity;
 result:=jsonb_build_object('ok',true,'checklistId',p_entity,'jobCard',jc,'recordsRevision',ctl,'workshopRevision',rev,
 'active',not(coalesce((j->>'delivered')::boolean,false) or coalesce((j->>'cancelled')::boolean,false) or coalesce((j->>'archived')::boolean,false) or coalesce((j->>'deleted')::boolean,false) or upper(coalesce(j->>'status',''))='CANCELLED'),
 'tracking',jsonb_build_object('priority',row.priority,'promiseDate',row.promise_date,'waitingForParts',coalesce(row.waiting_for_parts,false),'updatedBy',row.updated_by,'updatedAt',floor(extract(epoch from row.updated_at)*1000)));
 if ctl is distinct from (select revision from zukait_mechanical.control where singleton) or rev is distinct from (select revision from public.workshop_state where id='main') then raise exception 'mechanical_revision_conflict';end if;
 if p_kind='view' then result:=result||jsonb_build_object('capabilities',policy->'mechanicalStaff'->p_actor,'priorityValues',policy->'priorityValues','holdMode',policy->'holdMode');end if;
 return result;
end $$;
revoke all on function public.zukait_mechanical_tracking_read(text,text,text,text,uuid,uuid) from public,anon,authenticated;
grant execute on function public.zukait_mechanical_tracking_read(text,text,text,text,uuid,uuid) to service_role;
create function public.zukait_mechanical_tracking_commit(p_actor text,p_session_hash text,p_operation text,p_request uuid,p_fingerprint text,p_entity uuid,p_device text,p_expected_records bigint,p_expected_workshop bigint,p_payload jsonb) returns jsonb language plpgsql security invoker set search_path=pg_catalog as $$
declare policy jsonb; ctl bigint; rev bigint; jc text; j jsonb; matches integer; old zukait_mechanical.tracking; priority text; promised date; waiting boolean; reason text; before_value jsonb; after_value jsonb; result jsonb; prior zukait_mechanical.receipts;
begin
 policy:=zukait_mechanical.authorize_tracking(p_actor,p_session_hash,p_operation);
 if p_operation is null or p_request is null or p_entity is null or p_fingerprint is null or p_fingerprint !~ '^[0-9a-f]{64}$' or length(coalesce(p_device,'')) not between 1 and 128 or jsonb_typeof(p_payload) is distinct from 'object' or octet_length(p_payload::text)>2048 then raise exception 'invalid_tracking_change';end if;
 if jsonb_typeof(p_payload->'reason') is distinct from 'string' then raise exception 'invalid_tracking_change';end if;
 reason:=trim(p_payload->>'reason');if coalesce(length(reason),0)<1 or length(p_payload->>'reason')>500 then raise exception 'invalid_tracking_change';end if;
 select revision into ctl from zukait_mechanical.control where singleton for update;
 select * into prior from zukait_mechanical.receipts where request_id=p_request;
 if found then
  if prior.actor_id is distinct from p_actor or prior.fingerprint is distinct from p_fingerprint or prior.result->>'operation' is distinct from p_operation or prior.result->>'entityId' is distinct from p_entity::text then raise exception 'mechanical_request_reused';end if;
  return prior.result||'{"duplicate":true}'::jsonb;
 end if;
 if p_expected_records is null or ctl<>p_expected_records then raise exception 'mechanical_revision_conflict';end if;
 select revision into rev from public.workshop_state where id='main' for share;
 if p_expected_workshop is null or rev is null or rev<>p_expected_workshop then raise exception 'workshop_revision_conflict';end if;
 select job_card into jc from zukait_mechanical.checklists where id=p_entity;if jc is null then raise exception 'mechanical_checklist_missing';end if;
 select count(*),jsonb_agg(x)->0 into matches,j from public.workshop_state w cross join lateral jsonb_array_elements(coalesce(w.data->'jobs','[]')) x where w.id='main' and upper(trim(x->>'no'))=upper(trim(jc));
 if matches<>1 then raise exception 'mechanical_qc_scope_review';end if;
 if coalesce((j->>'delivered')::boolean,false) or coalesce((j->>'cancelled')::boolean,false) or coalesce((j->>'archived')::boolean,false) or coalesce((j->>'deleted')::boolean,false) or upper(coalesce(j->>'status',''))='CANCELLED' then raise exception 'checklist_inactive';end if;
 select * into old from zukait_mechanical.tracking where checklist_id=p_entity;
 priority:=old.priority;promised:=old.promise_date;waiting:=coalesce(old.waiting_for_parts,false);
 before_value:=jsonb_build_object('priority',priority,'promiseDate',promised,'waitingForParts',waiting);
 if p_operation='PRIORITY_SET' then
  if p_payload-array['priority','reason']<>'{}'::jsonb or not(p_payload?'priority') or jsonb_typeof(p_payload->'priority') not in ('string','null') then raise exception 'invalid_tracking_change';end if;
  priority:=p_payload->>'priority';if priority is not null and (length(priority)>40 or not coalesce((policy->'priorityValues')?priority,false)) then raise exception 'tracking_priority_policy_required';end if;
 elsif p_operation='PROMISE_SET' then
  if p_payload-array['date','reason']<>'{}'::jsonb or not(p_payload?'date') or jsonb_typeof(p_payload->'date') not in ('string','null') then raise exception 'invalid_promise_date';end if;
  if p_payload->>'date' is not null and ((p_payload->>'date') !~ '^\d{4}-\d{2}-\d{2}$' or p_payload->>'date'<'1900-01-01') then raise exception 'invalid_promise_date';end if;
  begin promised:=(p_payload->>'date')::date;exception when others then raise exception 'invalid_promise_date';end;
 elsif p_operation='HOLD_SET' then
  if policy->>'holdMode' is distinct from 'STATUS_ONLY' then raise exception 'tracking_hold_policy_required';end if;
  if p_payload-array['waiting','reason']<>'{}'::jsonb or jsonb_typeof(p_payload->'waiting') is distinct from 'boolean' then raise exception 'invalid_tracking_change';end if;
  waiting:=(p_payload->>'waiting')::boolean;
 end if;
 after_value:=jsonb_build_object('priority',priority,'promiseDate',promised,'waitingForParts',waiting);
 if after_value=before_value then raise exception 'tracking_no_change';end if;
 result:=jsonb_build_object('ok',true,'operation',p_operation,'requestId',p_request,'entityId',p_entity,'requiresRefresh',true,'recordsRevision',ctl+1,'workshopRevision',rev);
 insert into zukait_mechanical.tracking(checklist_id,priority,promise_date,waiting_for_parts,updated_by) values(p_entity,priority,promised,waiting,p_actor) on conflict(checklist_id) do update set priority=excluded.priority,promise_date=excluded.promise_date,waiting_for_parts=excluded.waiting_for_parts,updated_by=excluded.updated_by,updated_at=clock_timestamp();
 insert into zukait_mechanical.receipts(request_id,actor_id,fingerprint,result) values(p_request,p_actor,p_fingerprint,result);
 insert into zukait_mechanical.audit(request_id,actor_id,operation,entity_id,device_id,reason,before_value,after_value) values(p_request,p_actor,p_operation,p_entity,p_device,reason,before_value,after_value);
 update zukait_mechanical.control set revision=ctl+1 where singleton;
 return result;
end $$;
revoke all on function public.zukait_mechanical_tracking_commit(text,text,text,uuid,text,uuid,text,bigint,bigint,jsonb) from public,anon,authenticated;
grant execute on function public.zukait_mechanical_tracking_commit(text,text,text,uuid,text,uuid,text,bigint,bigint,jsonb) to service_role;

-- SOURCE: experiments/mechanical-documents.sql
-- Disposable fixture candidate only; no generated/applied production migration.
alter table zukait_mechanical.settings add column documents_enabled boolean not null default false;
alter table zukait_mechanical.settings add column document_readers jsonb not null default '{}' check(jsonb_typeof(document_readers)='object');
create function public.zukait_mechanical_document_read(p_actor text,p_session_hash text,p_kind text,p_entity uuid default null,p_expected_records bigint default null,p_expected_workshop bigint default null)
returns jsonb language plpgsql security invoker set search_path=pg_catalog as $$
declare cfg zukait_mechanical.settings; staff_role text; ctl bigint; rev bigint; ws jsonb; c zukait_mechanical.checklists;
 tasks jsonb; links jsonb; assignments jsonb; people jsonb; jobs jsonb; policy jsonb;
begin
 select * into cfg from zukait_mechanical.settings where singleton;
 if not coalesce(cfg.enabled and cfg.documents_enabled,false) then raise exception 'mechanical_documents_disabled';end if;
 if p_session_hash is null or p_session_hash !~ '^[0-9a-f]{64}$' then raise exception 'mechanical_invalid_session';end if;
 select role into staff_role from public.staff_credentials where user_id=p_actor and active for share;
 if staff_role is null or staff_role not in ('Manager','Supervisor','Mechanical Supervisor') then raise exception 'mechanical_document_forbidden';end if;
 perform 1 from public.staff_sessions where token_hash=p_session_hash and user_id=p_actor and revoked_at is null for share;
 if not found then raise exception 'mechanical_invalid_session';end if;
 if jsonb_typeof(cfg.document_readers->p_actor) is distinct from 'array' or not coalesce((cfg.document_readers->p_actor)?'UNPRICED',false) then raise exception 'mechanical_document_forbidden';end if;
 policy:=jsonb_build_object('documentsEnabled',true,'documentReaders',jsonb_build_object(p_actor,cfg.document_readers->p_actor));
 if p_kind='policy' then return policy;end if;
 if p_kind not in('context','verify') or p_entity is null or p_expected_records is null or p_expected_workshop is null or p_expected_records not between 0 and 9007199254740991 or p_expected_workshop not between 0 and 9007199254740991 then raise exception 'invalid_document_request';end if;
 -- Same lock order as commands; prevents a torn print snapshot. Locks only;
 -- this reader does not update state, history, audit, receipt or session rows.
 select revision into ctl from zukait_mechanical.control where singleton for share;
 select revision,data into rev,ws from public.workshop_state where id='main' for share;
 if ctl is distinct from p_expected_records or rev is distinct from p_expected_workshop then raise exception 'mechanical_document_changed';end if;
 select * into c from zukait_mechanical.checklists where id=p_entity;
 if not found then raise exception 'mechanical_checklist_missing';end if;
 if p_kind='verify' then return jsonb_build_object('ok',true,'checklistId',p_entity,'recordsRevision',ctl,'workshopRevision',rev);end if;
 select coalesce(jsonb_agg(jsonb_build_object('id',id,'checklistId',checklist_id,'title',title) order by created_at,id),'[]') into tasks from(select * from zukait_mechanical.tasks where checklist_id=p_entity order by created_at,id limit 101) t;
 if jsonb_array_length(tasks)>100 then raise exception 'mechanical_document_limit';end if;
 select coalesce(jsonb_agg(jsonb_build_object('taskId',l.task_id,'assignmentId',l.assignment_id,'employeeId',l.employee_id)||case when l.successor_id is null then '{}'::jsonb else jsonb_build_object('handedOverTo',l.successor_id) end order by l.created_at,l.assignment_id),'[]') into links from(select l.* from zukait_mechanical.links l join zukait_mechanical.tasks t on t.id=l.task_id where t.checklist_id=p_entity order by l.created_at,l.assignment_id limit 501) l;
 if jsonb_array_length(links)>500 then raise exception 'mechanical_document_limit';end if;
 select coalesce(jsonb_agg(jsonb_build_object('id',a->'id','job',a->'job','emp',a->'emp','mechanicalTaskId',a->'mechanicalTaskId','mechanicalChecklistId',a->'mechanicalChecklistId','suggested',a->'suggested','completed',a->'completed','cancelled',a->'cancelled','rework',a->'rework')),'[]') into assignments from jsonb_array_elements(coalesce(ws->'assign','[]')) a where a->>'id' in(select l->>'assignmentId' from jsonb_array_elements(links) l);
 if jsonb_array_length(assignments)>500 then raise exception 'mechanical_document_limit';end if;
 select coalesce(jsonb_agg(jsonb_build_object('id',user_id,'name',display_name)),'[]') into people from public.staff_credentials where user_id in(select l->>'employeeId' from jsonb_array_elements(links) l);
 select coalesce(jsonb_agg(jsonb_build_object('no',j->'no')),'[]') into jobs from jsonb_array_elements(coalesce(ws->'jobs','[]')) j where upper(trim(j->>'no'))=upper(trim(c.job_card));
 return jsonb_build_object('records',jsonb_build_object('revision',ctl,'checklists',jsonb_build_array(jsonb_build_object('id',c.id,'number',c.number,'manualJobCard',jsonb_build_object('number',c.job_card,'date',c.manual_jc_date))),'tasks',tasks,'links',links),
 'snapshot',jsonb_build_object('revision',rev,'data',jsonb_build_object('jobs',jobs,'assign',assignments,'users',people)));
end $$;
revoke all on function public.zukait_mechanical_document_read(text,text,text,uuid,bigint,bigint) from public,anon,authenticated;
grant execute on function public.zukait_mechanical_document_read(text,text,text,uuid,bigint,bigint) to service_role;

-- SOURCE: experiments/mechanical-signatures.sql
-- Disposable fixtures only. No generated/applied production migration.
alter table zukait_mechanical.settings add column signatures_enabled boolean not null default false;
alter table zukait_mechanical.settings add column signature_writers jsonb not null default '{}' check(jsonb_typeof(signature_writers)='object');
create table zukait_mechanical.signatures(
 request_id uuid primary key,checklist_id uuid not null references zukait_mechanical.checklists(id),actor_id text not null references public.staff_credentials(user_id),
 device_id text not null check(length(device_id) between 1 and 128),records_revision bigint not null,workshop_revision bigint not null,
 source_hash text not null check(source_hash ~ '^[0-9a-f]{64}$'),fingerprint text not null check(fingerprint ~ '^[0-9a-f]{64}$'),
 consent_version text not null default 'OWN_CHECKLIST_SIGNATURE_V1' check(consent_version='OWN_CHECKLIST_SIGNATURE_V1'),strokes jsonb not null,signed_at timestamptz not null default clock_timestamp(),unique(checklist_id,records_revision,workshop_revision,source_hash)
);
alter table zukait_mechanical.signatures enable row level security;
revoke all on zukait_mechanical.signatures from public,anon,authenticated,service_role;
grant select,insert on zukait_mechanical.signatures to service_role;
create trigger immutable_signature before update or delete or truncate on zukait_mechanical.signatures for each statement execute function zukait_mechanical.append_only();
create function zukait_mechanical.authorize_signature(p_actor text,p_session_hash text) returns jsonb language plpgsql security invoker set search_path=pg_catalog as $$
declare cfg zukait_mechanical.settings; staff_role text;
begin
 select * into cfg from zukait_mechanical.settings where singleton;
 if not coalesce(cfg.enabled and cfg.documents_enabled and cfg.signatures_enabled,false) then raise exception 'mechanical_signatures_disabled';end if;
 if p_actor is distinct from 'SUP003' then raise exception 'mechanical_signature_forbidden';end if;
 select role into staff_role from public.staff_credentials where user_id=p_actor and active for share;
 if staff_role is null or staff_role not in ('Supervisor','Mechanical Supervisor') then raise exception 'mechanical_signature_forbidden';end if;
 if p_session_hash is null or p_session_hash !~ '^[0-9a-f]{64}$' then raise exception 'mechanical_invalid_session';end if;
 perform 1 from public.staff_sessions where user_id=p_actor and token_hash=p_session_hash and revoked_at is null for share;
 if not found then raise exception 'mechanical_invalid_session';end if;
 if jsonb_typeof(cfg.signature_writers->p_actor) is distinct from 'array' or not coalesce((cfg.signature_writers->p_actor)?'OWN_SIGNATURE',false) then raise exception 'mechanical_signature_forbidden';end if;
 return jsonb_build_object('signaturesEnabled',true,'signatureWriters',jsonb_build_object(p_actor,cfg.signature_writers->p_actor));
end $$;
revoke all on function zukait_mechanical.authorize_signature(text,text) from public,anon,authenticated;
grant execute on function zukait_mechanical.authorize_signature(text,text) to service_role;
create function public.zukait_mechanical_signature_read(p_actor text,p_session_hash text,p_kind text,p_request uuid default null,p_entity uuid default null,p_records bigint default null,p_workshop bigint default null,p_source_hash text default null) returns jsonb language plpgsql security invoker set search_path=pg_catalog as $$
declare policy jsonb;r zukait_mechanical.signatures;verification jsonb;
begin
 policy:=zukait_mechanical.authorize_signature(p_actor,p_session_hash);
 if p_kind='policy' then return policy;end if;
 if p_kind='receipt' then
  select * into r from zukait_mechanical.signatures where request_id=p_request;
  if not found then return 'null'::jsonb;end if;
  if r.actor_id<>p_actor then raise exception 'mechanical_signature_forbidden';end if;
 elsif p_kind in('current','export','verify_export') then
  if p_kind in('export','verify_export') and not coalesce((policy->'signatureWriters'->p_actor)?'SIGNED_UNPRICED',false) then raise exception 'mechanical_signature_forbidden';end if;
  if p_source_hash is null or p_source_hash !~ '^[0-9a-f]{64}$' then raise exception 'invalid_mechanical_signature';end if;
  verification:=public.zukait_mechanical_document_read(p_actor,p_session_hash,'verify',p_entity,p_records,p_workshop);
  select * into r from zukait_mechanical.signatures where checklist_id=p_entity and records_revision=p_records and workshop_revision=p_workshop and source_hash=p_source_hash;
  if not found then return 'null'::jsonb;end if;
 else raise exception 'invalid_mechanical_signature';end if;
 -- This private reader is not exposed to ordinary unpriced document recipients.
 return jsonb_build_object('actorId',r.actor_id,'fingerprint',r.fingerprint,'result',jsonb_build_object('requestId',r.request_id,'checklistId',r.checklist_id,'actorId',r.actor_id,'recordsRevision',r.records_revision,'workshopRevision',r.workshop_revision,'sourceHash',r.source_hash,'signedAt',r.signed_at))||case when p_kind='export' then jsonb_build_object('strokes',r.strokes) else '{}'::jsonb end;
end $$;
revoke all on function public.zukait_mechanical_signature_read(text,text,text,uuid,uuid,bigint,bigint,text) from public,anon,authenticated;
grant execute on function public.zukait_mechanical_signature_read(text,text,text,uuid,uuid,bigint,bigint,text) to service_role;
create function public.zukait_mechanical_signature_commit(p_actor text,p_session_hash text,p_request uuid,p_entity uuid,p_records bigint,p_workshop bigint,p_device text,p_source_hash text,p_fingerprint text,p_strokes jsonb) returns jsonb language plpgsql security invoker set search_path=pg_catalog as $$
declare prior jsonb;r zukait_mechanical.signatures;stroke jsonb;point jsonb;first_point jsonb;count_points integer:=0;moved boolean:=false;verification jsonb;
begin
 perform zukait_mechanical.authorize_signature(p_actor,p_session_hash);
 if p_request is null or p_entity is null or p_source_hash is null or p_source_hash !~ '^[0-9a-f]{64}$' or p_fingerprint is null or p_fingerprint !~ '^[0-9a-f]{64}$' or length(trim(coalesce(p_device,''))) not between 1 and 128 then raise exception 'invalid_mechanical_signature';end if;
 -- Exact retry remains historical evidence, never current-document approval.
 select * into r from zukait_mechanical.signatures where request_id=p_request;
 if found then
  if r.actor_id<>p_actor or r.fingerprint<>p_fingerprint then raise exception 'mechanical_signature_request_reused';end if;
  return jsonb_build_object('requestId',r.request_id,'checklistId',r.checklist_id,'actorId',r.actor_id,'recordsRevision',r.records_revision,'workshopRevision',r.workshop_revision,'sourceHash',r.source_hash,'signedAt',r.signed_at);
 end if;
 verification:=public.zukait_mechanical_document_read(p_actor,p_session_hash,'verify',p_entity,p_records,p_workshop);
 if jsonb_typeof(p_strokes) is distinct from 'array' or jsonb_array_length(p_strokes) not between 1 and 64 or octet_length(p_strokes::text)>50000 then raise exception 'invalid_mechanical_signature';end if;
 for stroke in select value from jsonb_array_elements(p_strokes) loop
  if jsonb_typeof(stroke) is distinct from 'array' or jsonb_array_length(stroke) not between 2 and 256 then raise exception 'invalid_mechanical_signature';end if;
  for point in select value from jsonb_array_elements(stroke) loop
   count_points:=count_points+1;
   if count_points>1024 or jsonb_typeof(point) is distinct from 'array' or jsonb_array_length(point)<>2 or jsonb_typeof(point->0) is distinct from 'number' or jsonb_typeof(point->1) is distinct from 'number' then raise exception 'invalid_mechanical_signature';end if;
   if (point->>0)::numeric<>trunc((point->>0)::numeric) or (point->>1)::numeric<>trunc((point->>1)::numeric) or (point->>0)::numeric not between 0 and 10000 or (point->>1)::numeric not between 0 and 10000 then raise exception 'invalid_mechanical_signature';end if;
   if first_point is null then first_point:=point;end if;
   if abs((point->>0)::numeric-(first_point->>0)::numeric)+abs((point->>1)::numeric-(first_point->>1)::numeric)>=100 then moved:=true;end if;
  end loop;
 end loop;
 if not moved then raise exception 'invalid_mechanical_signature';end if;
 -- Serialize on a signature-only advisory key; two different UUIDs cannot sign the
 -- same print source twice, without advancing unrelated workshop/control revisions.
 perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended('mechanical-signature:'||p_entity::text,0));
 select * into r from zukait_mechanical.signatures where request_id=p_request;
 if found then
  if r.actor_id<>p_actor or r.fingerprint<>p_fingerprint then raise exception 'mechanical_signature_request_reused';end if;
 elsif exists(select 1 from zukait_mechanical.signatures where checklist_id=p_entity and records_revision=p_records and workshop_revision=p_workshop and source_hash=p_source_hash) then raise exception 'mechanical_signature_already_recorded';
 else
  insert into zukait_mechanical.signatures(request_id,checklist_id,actor_id,device_id,records_revision,workshop_revision,source_hash,fingerprint,strokes) values(p_request,p_entity,p_actor,p_device,p_records,p_workshop,p_source_hash,p_fingerprint,p_strokes) returning * into r;
 end if;
 return jsonb_build_object('requestId',r.request_id,'checklistId',r.checklist_id,'actorId',r.actor_id,'recordsRevision',r.records_revision,'workshopRevision',r.workshop_revision,'sourceHash',r.source_hash,'signedAt',r.signed_at);
end $$;
revoke all on function public.zukait_mechanical_signature_commit(text,text,uuid,uuid,bigint,bigint,text,text,text,jsonb) from public,anon,authenticated;
grant execute on function public.zukait_mechanical_signature_commit(text,text,uuid,uuid,bigint,bigint,text,text,text,jsonb) to service_role;

-- SOURCE: experiments/mechanical-reports.sql
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
 if staff_role is null or staff_role not in ('Manager','Supervisor','Mechanical Supervisor') then raise exception 'mechanical_report_forbidden';end if;
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
