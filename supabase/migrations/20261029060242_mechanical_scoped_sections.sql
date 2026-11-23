begin;
-- Domain membership is private metadata, separate from Cash/Insurance job type.
create table zukait_mechanical.intake_jobs(job_card text primary key,created_by text not null references public.staff_credentials(user_id),created_at timestamptz not null default now());
create table zukait_mechanical.intake_estimates(estimate_id text primary key,created_by text not null references public.staff_credentials(user_id),created_at timestamptz not null default now());
create table zukait_mechanical.section_receipts(request_id uuid primary key,actor_id text not null,command jsonb not null,result jsonb not null,recorded_at timestamptz not null default now());
create table zukait_mechanical.section_audit(request_id uuid primary key references zukait_mechanical.section_receipts(request_id) deferrable initially deferred,actor_id text not null,operation text not null,before_value jsonb,after_value jsonb,reason text not null,recorded_at timestamptz not null default now());
alter table zukait_mechanical.intake_jobs enable row level security;
alter table zukait_mechanical.intake_estimates enable row level security;
alter table zukait_mechanical.section_receipts enable row level security;
alter table zukait_mechanical.section_audit enable row level security;
revoke all on zukait_mechanical.intake_jobs,zukait_mechanical.intake_estimates,zukait_mechanical.section_receipts,zukait_mechanical.section_audit from public,anon,authenticated;
grant select,insert on zukait_mechanical.intake_jobs,zukait_mechanical.intake_estimates,zukait_mechanical.section_receipts,zukait_mechanical.section_audit to service_role;

-- Reuse the current direct-job validator, number authority, approval evidence
-- and audit. The additional role is accepted only inside this scoped RPC and
-- only for CREATE_DIRECT_JOB. Existing API role isolation remains unchanged.
do $patch$
declare definition text; old_guard text:='if actor_role not in (''Manager'',''Supervisor'',''Receptionist'') then';
begin
 definition:=pg_get_functiondef('public.zukait_reception_command(text,jsonb)'::regprocedure);
 if (length(definition)-length(replace(definition,old_guard,'')))/length(old_guard)<>1 then raise exception 'mechanical_direct_job_guard_drift';end if;
 definition:=replace(definition,old_guard,'if actor_role not in (''Manager'',''Supervisor'',''Receptionist'') and not (actor_role=''Mechanical Supervisor'' and p_actor_id=''SUP003'' and op=''CREATE_DIRECT_JOB'' and coalesce(current_setting(''zukait.mechanical_intake_actor'',true)=p_actor_id,false)) then');
 execute definition;
end $patch$;

create function zukait_mechanical.owns_job(p_job text) returns boolean language sql stable security invoker set search_path=pg_catalog as $$
 select exists(select 1 from zukait_mechanical.checklists where job_card=p_job) or exists(select 1 from zukait_mechanical.intake_jobs where job_card=p_job)
$$;
revoke all on function zukait_mechanical.owns_job(text) from public,anon,authenticated;
grant execute on function zukait_mechanical.owns_job(text) to service_role;

-- New Mechanical jobs are protected before their first checklist is registered.
create function zukait_mechanical.protect_intake_jobs() returns trigger language plpgsql security invoker set search_path=pg_catalog as $$
declare jc text; department text;
begin
 select s.department into department from zukait_mechanical.settings s where singleton;
 for jc in select job_card from zukait_mechanical.intake_jobs loop
  perform zukait_mechanical.assert_separate_job(new.data,jc,department);
 end loop;
 return new;
end $$;
revoke all on function zukait_mechanical.protect_intake_jobs() from public,anon,authenticated;
create trigger mechanical_intake_separate_jobs before update of data on public.workshop_state for each row execute function zukait_mechanical.protect_intake_jobs();

create function public.zukait_mechanical_section(p_actor text,p_session_hash text,p_command jsonb)
returns jsonb language plpgsql security invoker set search_path=pg_catalog as $$
declare cfg zukait_mechanical.settings; role_name text; op text:=p_command->>'operation';
 request uuid; prior zukait_mechanical.section_receipts; ws public.workshop_state;
 result jsonb; job jsonb; rows jsonb; people jsonb; assignments jsonb; sessions jsonb;
 estimate jsonb; previous jsonb; allocation public.workshop_v2_estimate_numbers;
 id text; seq bigint; number text; item jsonb; field text; reason text; deleted jsonb; section_name text:=coalesce(p_command->>'view','all');
begin
 perform zukait_mechanical.authorize_session(p_actor,p_session_hash,'MC_CREATE');
 select role into role_name from public.staff_credentials where user_id=p_actor and active;
 if role_name is distinct from 'Manager' and not(p_actor='SUP003' and role_name in ('Supervisor','Mechanical Supervisor')) then raise exception 'mechanical_forbidden';end if;
 select * into cfg from zukait_mechanical.settings where singleton;
 if jsonb_typeof(p_command) is distinct from 'object' or pg_column_size(p_command)>70000 or op not in ('READ','ALLOCATE_ESTIMATE','SAVE_ESTIMATE','DELETE_DRAFT','CREATE_JOB') or op is null then raise exception 'invalid_mechanical_section';end if;
 if op='READ' then
  if exists(select 1 from jsonb_object_keys(p_command) k where k not in ('operation','view')) or section_name not in ('all','estimates','create-job','jobs','wip','qc','ready','delivered','exceeded') then raise exception 'invalid_mechanical_section';end if;
  select * into ws from public.workshop_state w where w.id='main';
  select coalesce(jsonb_agg(jsonb_build_object('no',j->'no','jobType',j->'jobType','vehicle',j->'vehicle','make',j->'make','model',j->'model','year',j->'year','reg',j->'reg','vin',j->'vin','customerName',j->'customerName','insuranceCompany',j->'insuranceCompany','mobile',j->'mobile','status',j->'status','delivered',j->'delivered','deliveredAt',j->'deliveredAt','archived',j->'archived','deleted',j->'deleted','cancelled',j->'cancelled','checklistId',(select c.id from zukait_mechanical.checklists c where c.job_card=j->>'no' limit 1))),'[]') into rows
  from jsonb_array_elements(coalesce(ws.data->'jobs','[]')) j where zukait_mechanical.owns_job(j->>'no');
  if jsonb_array_length(rows)>1000 then raise exception 'mechanical_section_limit';end if;
  assignments:='[]';sessions:='[]';
  if section_name in ('all','exceeded') then
  select coalesce(jsonb_agg(a),'[]') into assignments from jsonb_array_elements(coalesce(ws.data->'assign','[]')) a where a->>'id' in(select l.assignment_id::text from zukait_mechanical.links l join zukait_mechanical.tasks t on t.id=l.task_id join zukait_mechanical.checklists c on c.id=t.checklist_id);
  select coalesce(jsonb_agg(s),'[]') into sessions from jsonb_array_elements(coalesce(ws.data->'sessions','[]')) s where s->>'assignmentId' in(select a->>'id' from jsonb_array_elements(assignments) a) or (s->>'assignmentId' is null and zukait_mechanical.owns_job(s->>'job') and s->>'emp' in(select a->>'emp' from jsonb_array_elements(assignments) a));
  end if;
  if jsonb_array_length(assignments)>10000 or jsonb_array_length(sessions)>50000 then raise exception 'mechanical_section_limit';end if;
  select coalesce(jsonb_agg(jsonb_build_object('id',user_id,'name',display_name,'role',role,'department',department,'active',active)),'[]') into people from public.staff_credentials where role='Employee' and department=cfg.department;
  estimate:='[]';if section_name in ('all','estimates') then
  select coalesce(jsonb_agg(e),'[]') into estimate from jsonb_array_elements(coalesce(ws.data->'estimates','[]')) e where exists(select 1 from zukait_mechanical.intake_estimates where estimate_id=e->>'id') or zukait_mechanical.owns_job(e->>'jobCard');
  end if;if jsonb_array_length(estimate)>1000 then raise exception 'mechanical_section_limit';end if;
  return jsonb_build_object('ok',true,'jobs',rows,'users',people,'assign',assignments,'sessions',sessions,'estimates',estimate,'estimateAudit',coalesce((select jsonb_agg(a) from jsonb_array_elements(coalesce(ws.data->'estimateAudit','[]')) a where a->>'estimateId' in(select e->>'id' from jsonb_array_elements(estimate) e)),'[]'),'estimateDraftDeletes',coalesce((select jsonb_agg(d) from jsonb_array_elements(coalesce(ws.data->'estimateDraftDeletes','[]')) d where exists(select 1 from zukait_mechanical.intake_estimates ie where ie.estimate_id=d->>'estimateId')),'[]'),'workshopHolidays',coalesce(ws.data->'workshopHolidays','[]'),'companies',coalesce((select jsonb_agg(jsonb_build_object('id',i.id,'name',i.name)) from public.workshop_insurance_companies i where i.active),'[]'),'server_revision',ws.revision);
 end if;
 if coalesce(p_command->>'request_id','') !~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' then raise exception 'mechanical_request_required';end if;
 request:=(p_command->>'request_id')::uuid;
 perform pg_advisory_xact_lock(hashtextextended('mechanical-section:'||request,0));
 select * into prior from zukait_mechanical.section_receipts where request_id=request;
 if found then
  if prior.actor_id<>p_actor or prior.command<>p_command then raise exception 'mechanical_request_reused';end if;
  return prior.result||'{"duplicate":true}'::jsonb;
 end if;
 if op='CREATE_JOB' then
  if exists(select 1 from jsonb_object_keys(p_command) k where k not in ('operation','request_id','command')) or p_command->'command'->>'operation' is distinct from 'CREATE_DIRECT_JOB' or p_command->'command'->>'request_id' is distinct from request::text then raise exception 'invalid_mechanical_section';end if;
  perform set_config('zukait.mechanical_intake_actor',p_actor,true);
  result:=public.zukait_reception_command(p_actor,p_command->'command');
  perform set_config('zukait.mechanical_intake_actor','',true);
  number:=result->>'job_card';if number is null then raise exception 'mechanical_job_creation_unconfirmed';end if;
  insert into zukait_mechanical.intake_jobs(job_card,created_by) values(number,p_actor) on conflict(job_card) do nothing;
  reason:=p_command->'command'->>'reason';
 else
  if exists(select 1 from jsonb_object_keys(p_command) k where k not in ('operation','request_id','client_key','estimate','expected_revision','reason')) then raise exception 'invalid_mechanical_section';end if;
  id:=p_command->>'client_key';if coalesce(id,'') !~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' then raise exception 'mechanical_estimate_id_required';end if;
  perform pg_advisory_xact_lock(hashtextextended('estimate-no:'||id,0));
  select * into allocation from public.workshop_v2_estimate_numbers where client_key=id;
  if op='ALLOCATE_ESTIMATE' then
   if allocation.estimate_no is not null and not exists(select 1 from zukait_mechanical.intake_estimates where estimate_id=id) then raise exception 'mechanical_estimate_forbidden';end if;
   if allocation.estimate_no is null then
    seq:=nextval('public.workshop_v2_estimate_no_seq');number:='Zi-Qt'||case when length(seq::text)>3 then seq::text else lpad(seq::text,3,'0') end;
    insert into public.workshop_v2_estimate_numbers(estimate_no,sequence_no,client_key,created_by) values(number,seq,id,p_actor) returning * into allocation;
    insert into zukait_mechanical.intake_estimates(estimate_id,created_by) values(id,p_actor);
   end if;
   result:=jsonb_build_object('ok',true,'estimate',to_jsonb(allocation));reason:='Allocate Mechanical estimate number';
  else
   select * into ws from public.workshop_state w where w.id='main' for update;
   select e into previous from jsonb_array_elements(coalesce(ws.data->'estimates','[]')) e where e->>'id'=id;
   if allocation.estimate_no is null or not(exists(select 1 from zukait_mechanical.intake_estimates where estimate_id=id) or zukait_mechanical.owns_job(previous->>'jobCard')) then raise exception 'mechanical_estimate_forbidden';end if;
   if exists(select 1 from jsonb_array_elements(coalesce(ws.data->'estimateDraftDeletes','[]')) d where d->>'estimateId'=id) then raise exception 'estimate_draft_deleted';end if;
   if coalesce(p_command->>'expected_revision','') !~ '^[0-9]+$' or (p_command->>'expected_revision')::numeric<>coalesce((previous->>'revision')::numeric,0) then raise exception 'mechanical_estimate_revision_conflict';end if;
   reason:=trim(coalesce(p_command->>'reason',''));
   if length(reason) not between 1 and 500 then raise exception 'mechanical_reason_required';end if;
   if op='DELETE_DRAFT' then
    if previous->>'status'='Saved' then raise exception 'mechanical_saved_estimate_protected';end if;
    deleted:=jsonb_build_object('estimateId',id,'createdBy',p_actor,'at',floor(extract(epoch from now())*1000));
    ws.data:=jsonb_set(ws.data,'{estimateDraftDeletes}',coalesce(ws.data->'estimateDraftDeletes','[]')||jsonb_build_array(deleted));
    estimate:=null;
   else
    estimate:=p_command->'estimate';
    if jsonb_typeof(estimate) is distinct from 'object' or pg_column_size(estimate)>64000 or estimate->>'id' is distinct from id or estimate->>'estimateNo' is distinct from allocation.estimate_no or coalesce(estimate->>'type','') not in ('LS','PL') or jsonb_typeof(estimate->'vatEnabled') is distinct from 'boolean' then raise exception 'invalid_mechanical_estimate';end if;
    if nullif(estimate->>'receptionNo','') is not null or (nullif(estimate->>'jobCard','') is not null and not zukait_mechanical.owns_job(estimate->>'jobCard')) then raise exception 'mechanical_estimate_forbidden';end if;
    if exists(select 1 from jsonb_object_keys(estimate) k where k not in ('id','estimateNo','sequenceNo','date','type','vatEnabled','vatRate','customerName','cashCustomerName','mobile','makeModel','year','registration','vin','claimNo','jobCard','lsRows','labourRows','partRows','misc','lsSpareParts','notes','customerSuppliedParts','showCustomerSuppliedParts','status','createdAt','createdBy','updatedAt','updatedBy','revision','insuranceCompany','jobType','recoveredLocal')) then raise exception 'invalid_mechanical_estimate';end if;
    for field in select unnest(array['lsRows','labourRows','partRows']) loop
     if jsonb_typeof(estimate->field) is distinct from 'array' or jsonb_array_length(estimate->field)>200 then raise exception 'invalid_mechanical_estimate';end if;
     for item in select value from jsonb_array_elements(estimate->field) loop
      if jsonb_typeof(item) is distinct from 'object' then raise exception 'invalid_mechanical_estimate';end if;
      if field='partRows' then
       if coalesce(item->>'qty','') !~ '^[0-9]+([.][0-9]+)?$' or coalesce(item->>'unitPrice','') !~ '^[0-9]+([.][0-9]+)?$' or (item->>'qty')::numeric>1000000 or (item->>'unitPrice')::numeric>1000000 then raise exception 'invalid_mechanical_estimate';end if;
      elsif coalesce(item->>'amount','') !~ '^[0-9]+([.][0-9]+)?$' or (item->>'amount')::numeric>1000000 then raise exception 'invalid_mechanical_estimate';end if;
     end loop;
    end loop;
    if coalesce(estimate->>'misc','') !~ '^[0-9]+([.][0-9]+)?$' or coalesce(estimate->>'lsSpareParts','') !~ '^[0-9]+([.][0-9]+)?$' then raise exception 'invalid_mechanical_estimate';end if;
    estimate:=(estimate-'recoveredLocal')||jsonb_build_object('sequenceNo',allocation.sequence_no,'vatRate',0.05,'createdBy',coalesce(previous->>'createdBy',allocation.created_by),'createdAt',coalesce(previous->'createdAt',to_jsonb(floor(extract(epoch from allocation.created_at)*1000))),'updatedBy',p_actor,'updatedAt',floor(extract(epoch from now())*1000),'revision',coalesce((previous->>'revision')::numeric,0)+1,'status','Saved');
   end if;
   select coalesce(jsonb_agg(e),'[]') into rows from jsonb_array_elements(coalesce(ws.data->'estimates','[]')) e where e->>'id'<>id;
   if estimate is not null then rows:=rows||jsonb_build_array(estimate);end if;
   insert into public.workshop_state_history(revision,data,updated_at,updated_by) select revision,data,updated_at,updated_by from public.workshop_state w where w.id='main' on conflict(revision) do nothing;
   ws.data:=jsonb_set(ws.data,'{estimates}',rows);
   ws.data:=jsonb_set(ws.data,'{estimateAudit}',coalesce(ws.data->'estimateAudit','[]')||jsonb_build_array(jsonb_build_object('id',request,'estimateId',id,'estimateNo',allocation.estimate_no,'action',op,'by',p_actor,'role',role_name,'at',floor(extract(epoch from now())*1000),'reason',reason)));
   update public.workshop_state set data=ws.data,revision=ws.revision+1,updated_by=p_actor,updated_at=now() where public.workshop_state.id='main';
   result:=jsonb_build_object('ok',true,'estimate',estimate,'deleted_id',case when op='DELETE_DRAFT' then id end,'server_revision',ws.revision+1);
  end if;
 end if;
 result:=result||jsonb_build_object('request_id',request);
 insert into zukait_mechanical.section_receipts(request_id,actor_id,command,result) values(request,p_actor,p_command,result);
 insert into zukait_mechanical.section_audit(request_id,actor_id,operation,before_value,after_value,reason) values(request,p_actor,op,previous,coalesce(estimate,result),reason);
 return result;
end $$;
revoke all on function public.zukait_mechanical_section(text,text,jsonb) from public,anon,authenticated;
grant execute on function public.zukait_mechanical_section(text,text,jsonb) to service_role;
commit;
