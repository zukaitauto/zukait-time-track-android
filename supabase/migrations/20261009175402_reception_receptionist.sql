-- Pending activation only. Filename generated with Supabase CLI 2.120.0 in
-- architecture-v2 workflow run 37969491834. Apply after all eight Phase 2 migrations.
begin;
do $$
begin
 if has_function_privilege('anon','public.zukait_v2_project_spare_part_event()','EXECUTE')
  or has_function_privilege('authenticated','public.zukait_v2_project_spare_part_event()','EXECUTE') then
  raise exception 'reception_receptionist_dependency_mismatch: pending trigger hardening required';
 end if;
end $$;
alter table public.staff_credentials drop constraint if exists staff_credentials_role_check;
alter table public.staff_credentials add constraint staff_credentials_role_check
 check(role in ('Employee','Supervisor','Manager','Purchaser','Receptionist'));

-- Retain the tested creation/vehicle-authority bodies, locks, retry journal,
-- sequence handling and immutable approval checks. Refuse unexpected definition
-- drift instead of silently changing a different permission expression.
do $$
declare fn text; source text; target text:='(''Manager'',''Supervisor'')';
begin
 foreach fn in array array['zukait_reception_phase1_command','zukait_reception_vehicle_command'] loop
  source:=pg_get_functiondef(to_regprocedure('public.'||fn||'(text,jsonb)'));
  if source is null or (length(source)-length(replace(source,target,'')))/length(target)<>2 then
   raise exception 'reception_receptionist_dependency_mismatch: %',fn;
  end if;
  source:=replace(source,target,'(''Manager'',''Supervisor'',''Receptionist'')');
  if fn='zukait_reception_phase1_command' then
   source:=replace(source,
    'if v_role is null then raise exception ''reception_forbidden''; end if;',
    'if v_role is null then raise exception ''reception_forbidden''; end if;
     if v_role=''Receptionist'' and v_op not in (''CAPABILITIES'',''MASTER'',''LIST'',''GET'',''CREATE'',''EDIT'',''MOVE'') then
      raise exception ''reception_forbidden'';
     end if;');
  end if;
  execute source;
 end loop;
end $$;

alter function public.zukait_reception_command(text,jsonb) rename to zukait_reception_role_base_command;
create function public.zukait_reception_command(p_actor_id text,p_command jsonb)
returns jsonb language plpgsql security invoker set search_path=public,pg_temp as $$
declare actor_role text;
begin
 select role into actor_role from public.staff_credentials where user_id=p_actor_id and active;
 if actor_role is null then raise exception 'reception_forbidden'; end if;
 if actor_role='Receptionist' and (p_command->>'operation' is null or
    p_command->>'operation' not in ('CAPABILITIES','MASTER','LIST','GET','CREATE','EDIT','MOVE','CREATE_JOB')) then
  raise exception 'reception_forbidden';
 end if;
 return public.zukait_reception_role_base_command(p_actor_id,p_command);
end $$;
revoke execute on function public.zukait_reception_command(text,jsonb) from public,anon,authenticated;
grant execute on function public.zukait_reception_command(text,jsonb) to service_role;
-- Development source appended to the pending Receptionist migration; not a deploy script.
alter table public.workshop_receptions add column job_type text not null default 'INSURANCE'
 check(job_type in ('INSURANCE','CASH','CREDIT'));
alter table public.workshop_receptions alter column insurance_id drop not null;
alter table public.workshop_receptions add constraint reception_insurer_by_type
 check((job_type='INSURANCE' and insurance_id is not null) or (job_type in ('CASH','CREDIT') and insurance_id is null));
do $$
declare c record;
begin
 for c in select conname from pg_constraint where conrelid='public.workshop_receptions'::regclass and contype='c'
  and pg_get_constraintdef(oid) like '%job_card IS NULL%' and pg_get_constraintdef(oid) like '%approval_status%' loop
  execute format('alter table public.workshop_receptions drop constraint %I',c.conname);
 end loop;
end $$;
alter table public.workshop_receptions add constraint reception_link_by_type
 check(job_card is null or (outcome is null and (job_type<>'INSURANCE' or approval_status='APPROVED')));

-- Reuse all established intake validation and movement audit. Cash/credit
-- checks are scoped by the authoritative row type, never by a supplied insurer.
do $$
declare source text;
begin
 source:=pg_get_functiondef('public.zukait_reception_phase1_command(text,jsonb)'::regprocedure);
 source:=replace(source,'r join public.workshop_insurance_companies c','r left join public.workshop_insurance_companies c');
 source:=replace(source,
 'if not exists(select 1 from public.workshop_insurance_companies where id=v_ins and (active or (v_op=''EDIT'' and id=v_old.insurance_id))) then',
 'if (case when v_op=''CREATE'' then coalesce(p_command->>''job_type'',''INSURANCE'') else v_old.job_type end)=''INSURANCE'' and not exists(select 1 from public.workshop_insurance_companies where id=v_ins and (active or (v_op=''EDIT'' and id=v_old.insurance_id))) then');
 source:=replace(source,
 'insert into public.workshop_receptions(rc_no,sequence_no,insurance_id,details,created_by,updated_by) values(v_rc,v_seq,v_ins,v_details,p_actor_id,p_actor_id);',
 'insert into public.workshop_receptions(rc_no,sequence_no,insurance_id,details,created_by,updated_by,job_type) values(v_rc,v_seq,v_ins,v_details,p_actor_id,p_actor_id,coalesce(p_command->>''job_type'',''INSURANCE''));');
 execute source;
end $$;
create or replace function public.zukait_reception_job_identity(r public.workshop_receptions)
returns jsonb language sql stable security invoker set search_path=public,pg_temp as $$
 select jsonb_build_object('receptionNo',r.rc_no,'receptionLocation',r.location,
 'make',r.details->>'make','model',r.details->>'model','brand',r.details->>'make',
 'vehicle',trim((r.details->>'make')||' '||(r.details->>'model')),
 'year',coalesce(r.details->>'year',''),'reg',coalesce(r.details->>'registration',''),
 'vin',coalesce(r.details->>'vin',''),'claimNo',coalesce(r.details->>'claim',''),
 'customerName',coalesce(r.details->>'customer',''),'customer',coalesce(r.details->>'customer',''),
 'mobile',coalesce(r.details->>'contact',''),'jobType',r.job_type,
 'insuranceCompany',(select name from public.workshop_insurance_companies where id=r.insurance_id),
 'insurance',(select name from public.workshop_insurance_companies where id=r.insurance_id));
$$;

create table public.workshop_reception_external_approvals (
 id uuid primary key,
 rc_no text not null references public.workshop_receptions(rc_no),
 reference text not null, approval_date date not null, evidence text not null,
 identity_snapshot jsonb not null, parts_snapshot jsonb not null,
 actor_id text not null references public.staff_credentials(user_id),
 recorded_at timestamptz not null default clock_timestamp(), reason text not null
);
create index reception_external_approval_rc_idx on public.workshop_reception_external_approvals(rc_no,recorded_at desc,id);
alter table public.workshop_reception_external_approvals enable row level security;
revoke all on public.workshop_reception_external_approvals from public,anon,authenticated,service_role;
grant select,insert on public.workshop_reception_external_approvals to service_role;
create function public.zukait_reception_external_approval_valid(r public.workshop_receptions)
returns boolean language sql stable security invoker set search_path=public,pg_temp as $$
 select r.job_type='INSURANCE' and r.approval_status='APPROVED' and r.outcome is null and exists(
 select 1 from (select * from public.workshop_reception_external_approvals where rc_no=r.rc_no order by recorded_at desc,id desc limit 1) a
 where a.identity_snapshot=public.zukait_reception_identity(r.details,r.insurance_id)
 and a.parts_snapshot='[]'::jsonb
 and coalesce((select items from public.workshop_reception_preliminary_parts where rc_no=r.rc_no),'[]'::jsonb)='[]'::jsonb);
$$;
alter function public.zukait_reception_job_approval_valid(text,text,jsonb) rename to zukait_reception_quotation_job_approval_valid;
create function public.zukait_reception_job_approval_valid(p_job text,p_rc text,p_data jsonb default null)
returns boolean language sql stable security invoker set search_path=public,pg_temp as $$
 select public.zukait_reception_quotation_job_approval_valid(p_job,p_rc,p_data)
 or exists(select 1 from public.workshop_receptions r where r.rc_no=p_rc and r.job_card=p_job and public.zukait_reception_external_approval_valid(r));
$$;

alter function public.zukait_reception_command(text,jsonb) rename to zukait_reception_restricted_command;
create function public.zukait_reception_command(p_actor_id text,p_command jsonb)
returns jsonb language plpgsql security invoker set search_path=public,pg_temp as $$
declare
 op text:=p_command->>'operation'; actor_role text; request uuid;
 cached public.workshop_reception_commands; r public.workshop_receptions;
 snapshot public.workshop_state; result jsonb; j jsonb; intake jsonb;
 job_no text:=upper(trim(coalesce(p_command->>'job_card','')));
 kind text:=p_command->>'job_type'; reason text:=trim(coalesce(p_command->>'reason',''));
 reference text:=trim(coalesce(p_command->>'reference','')); evidence text:=trim(coalesce(p_command->>'evidence',''));
 approval_day date; receipt uuid;
begin
 select role into actor_role from public.staff_credentials where user_id=p_actor_id and active;
 if actor_role is null then raise exception 'reception_forbidden'; end if;
 if op not in ('CREATE_DIRECT_JOB','RECORD_EXTERNAL_APPROVAL','CREATE_EXTERNAL_JOB') or op is null then
  -- Cash/credit types cannot enter the insurance quotation command.
  if op in ('CREATE_JOB','SAVE_PRELIMINARY','LINK_ESTIMATE','RECORD_APPROVAL','REVOKE_APPROVAL','SAVE_ADDITIONAL_REQUEST','LINK_ADDITIONAL_ESTIMATE','APPROVE_ADDITIONAL') and exists(select 1 from public.workshop_receptions where rc_no=p_command->>'rc_no' and job_type<>'INSURANCE') then raise exception 'reception_invalid_job_type'; end if;
  result:=public.zukait_reception_restricted_command(p_actor_id,p_command);
  if op='GET' then
   select * into r from public.workshop_receptions where rc_no=p_command->>'rc_no';
   result:=result||jsonb_build_object('external_approval',jsonb_build_object(
    'valid',public.zukait_reception_external_approval_valid(r),
    'can_record',actor_role in ('Manager','Supervisor') and r.job_type='INSURANCE' and r.job_card is null and r.outcome is null));
   if actor_role in ('Manager','Supervisor') then
    result:=result||jsonb_build_object('external_approval_history',(select coalesce(jsonb_agg(to_jsonb(a)-'identity_snapshot'-'parts_snapshot' order by recorded_at desc),'[]') from public.workshop_reception_external_approvals a where rc_no=r.rc_no));
   end if;
  end if;
  return result;
 end if;
 if actor_role not in ('Manager','Supervisor','Receptionist') then raise exception 'reception_job_forbidden'; end if;
 if op='RECORD_EXTERNAL_APPROVAL' and actor_role='Receptionist' then raise exception 'reception_approval_forbidden'; end if;
 if exists(select 1 from jsonb_object_keys(p_command) k where k not in ('operation','rc_no','expected_revision','request_id','job_card','job_type','details','credit_account','received_confirmed','reason','reference','approval_date','evidence')) then raise exception 'reception_invalid_fields'; end if;
 -- Operation-specific fields prevent approvals, finance or identity from being smuggled into creation.
 if op='CREATE_DIRECT_JOB' and exists(select 1 from jsonb_object_keys(p_command) k where k not in ('operation','request_id','job_card','job_type','details','credit_account','received_confirmed','reason')) then raise exception 'reception_invalid_fields'; end if;
 if op='CREATE_EXTERNAL_JOB' and exists(select 1 from jsonb_object_keys(p_command) k where k not in ('operation','rc_no','expected_revision','request_id','job_card','reason')) then raise exception 'reception_invalid_fields'; end if;
 if op='RECORD_EXTERNAL_APPROVAL' and exists(select 1 from jsonb_object_keys(p_command) k where k not in ('operation','rc_no','expected_revision','request_id','reference','approval_date','evidence','reason')) then raise exception 'reception_invalid_fields'; end if;
 if coalesce(p_command->>'request_id','') !~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' then raise exception 'reception_request_required'; end if;
 request:=(p_command->>'request_id')::uuid;
 perform pg_advisory_xact_lock(hashtextextended(request::text,0));
 select * into cached from public.workshop_reception_commands where request_id=request;
 if found then
  if cached.actor_id<>p_actor_id or cached.command<>p_command then raise exception 'reception_request_conflict'; end if;
  return cached.result||'{"duplicate":true}'::jsonb;
 end if;
 if jsonb_typeof(p_command->'reason') is distinct from 'string' or length(reason) not between 1 and 2000 then raise exception 'reception_reason_required'; end if;
 if op='CREATE_DIRECT_JOB' then
  if kind is null or kind not in ('CASH','CREDIT') then raise exception 'reception_invalid_job_type'; end if;
  if p_command->'received_confirmed' is distinct from 'true'::jsonb then raise exception 'reception_received_confirmation_required'; end if;
  if nullif(trim(p_command->'details'->>'customer'),'') is null or nullif(trim(p_command->'details'->>'contact'),'') is null then raise exception 'reception_customer_required'; end if;
  if kind='CREDIT' and (jsonb_typeof(p_command->'credit_account') is distinct from 'string' or length(trim(p_command->>'credit_account')) not between 1 and 200) then raise exception 'reception_credit_account_required'; end if;
  if kind='CASH' and p_command ? 'credit_account' then raise exception 'reception_invalid_fields'; end if;
 else
  select * into r from public.workshop_receptions where rc_no=p_command->>'rc_no' for update;
  if not found then raise exception 'reception_not_found'; end if;
  if coalesce(p_command->>'expected_revision','') !~ '^[0-9]+$' or (p_command->>'expected_revision')::numeric<>r.revision then raise exception 'reception_stale_revision'; end if;
  if r.outcome is not null then raise exception 'reception_case_closed'; end if;
  if r.job_card is not null then raise exception 'reception_job_already_created'; end if;
  if r.job_type<>'INSURANCE' then raise exception 'reception_invalid_job_type'; end if;
  if op='RECORD_EXTERNAL_APPROVAL' then
   if jsonb_typeof(p_command->'reference') is distinct from 'string' or length(reference) not between 1 and 200
    or jsonb_typeof(p_command->'evidence') is distinct from 'string' or length(evidence) not between 1 and 2000 then raise exception 'reception_external_evidence_required'; end if;
   if coalesce(p_command->>'approval_date','') !~ '^\d{4}-\d{2}-\d{2}$' then raise exception 'reception_invalid_approval_date'; end if;
   approval_day:=(p_command->>'approval_date')::date;
   if approval_day>(now() at time zone 'Asia/Muscat')::date then raise exception 'reception_invalid_approval_date'; end if;
   if coalesce((select items from public.workshop_reception_preliminary_parts where rc_no=r.rc_no),'[]'::jsonb)<>'[]'::jsonb then raise exception 'reception_external_parts_review_required'; end if;
   insert into public.workshop_reception_external_approvals(id,rc_no,reference,approval_date,evidence,identity_snapshot,parts_snapshot,actor_id,reason)
    values(request,r.rc_no,reference,approval_day,evidence,public.zukait_reception_identity(r.details,r.insurance_id),'[]',p_actor_id,reason);
   update public.workshop_receptions set approval_status='APPROVED',revision=revision+1,updated_by=p_actor_id,updated_at=now() where rc_no=r.rc_no returning * into r;
  else
   if not public.zukait_reception_external_approval_valid(r) then raise exception 'reception_external_approval_required'; end if;
   kind:='INSURANCE';
  end if;
 end if;
 if op<>'RECORD_EXTERNAL_APPROVAL' then
  if jsonb_typeof(p_command->'job_card') is distinct from 'string' or job_no !~ '^[A-Z0-9][A-Z0-9/-]{0,39}$' or job_no='ID001' then raise exception 'reception_invalid_job_number'; end if;
  perform pg_advisory_xact_lock(hashtextextended('rc-job:'||job_no,0));
  -- All creators lock RC before shared state. Direct intake takes its new RC
  -- lock before the shared-state lock as well.
  if op='CREATE_DIRECT_JOB' then
   receipt:=md5(request::text||':direct-intake')::uuid;
   intake:=public.zukait_reception_phase1_command(p_actor_id,jsonb_build_object('operation','CREATE','request_id',receipt,'job_type',kind,'details',p_command->'details'));
   select * into r from public.workshop_receptions where rc_no=intake->'record'->>'rc_no' for update;
  end if;
  select * into snapshot from public.workshop_state where id='main' for update;
  if not found then raise exception 'reception_workshop_unavailable'; end if;
  if exists(select 1 from jsonb_array_elements(coalesce(snapshot.data->'jobs','[]')) x where upper(x->>'no')=job_no)
   or exists(select 1 from public.workshop_v2_jobcards where upper(job_card)=job_no)
   or exists(select 1 from public.workshop_v2_spare_part_state where upper(job_card)=job_no)
   or exists(select 1 from public.workshop_v2_events where event_type like 'SPARE_PART%' and upper(payload->>'jobCard')=job_no) then raise exception 'reception_job_number_exists'; end if;
  update public.workshop_receptions set job_card=job_no,revision=revision+1,updated_by=p_actor_id,updated_at=now() where rc_no=r.rc_no returning * into r;
  j:=public.zukait_reception_job_identity(r)||jsonb_build_object('no',job_no,'status','Open','workflowStage','CREATED',
   'createdBy',p_actor_id,'createdAt',floor(extract(epoch from now())*1000),'v2EventId','rc-direct-'||request,'v2Created',true);
  if kind='CREDIT' then j:=j||jsonb_build_object('creditAccount',trim(p_command->>'credit_account')); end if;
  if kind='INSURANCE' then j:=j||jsonb_build_object('externalApprovalId',(select id from public.workshop_reception_external_approvals where rc_no=r.rc_no order by recorded_at desc,id desc limit 1)); end if;
  insert into public.workshop_state_history(revision,data,updated_at,updated_by) values(snapshot.revision,snapshot.data,snapshot.updated_at,snapshot.updated_by) on conflict(revision) do nothing;
  update public.workshop_state set data=jsonb_set(snapshot.data,'{jobs}',coalesce(snapshot.data->'jobs','[]')||jsonb_build_array(j)),revision=snapshot.revision+1,updated_by=p_actor_id,updated_at=now() where id='main';
  perform public.zukait_v2_commit_event('rc-direct-'||request,job_no,p_actor_id,'reception-server','JOB_CREATED',null,0,
   jsonb_build_object('jobCard',job_no,'registration',j->>'reg','vehicleMake',j->>'make','vehicleModel',j->>'model','vehicleYear',j->>'year','workflowStage','CREATED','status','OPEN','jobType',kind,'insuranceCompany',j->>'insuranceCompany','receptionNo',r.rc_no));
 end if;
 insert into public.workshop_reception_audit(rc_no,operation,actor_id,after_data,reason) values(r.rc_no,op,p_actor_id,
  case when op='RECORD_EXTERNAL_APPROVAL' then jsonb_build_object('approval_id',request,'reference',reference,'evidence',evidence) else jsonb_build_object('job_card',job_no,'job_type',kind) end,reason);
 result:=jsonb_build_object('ok',true,'record',to_jsonb(r));
 insert into public.workshop_reception_commands(request_id,actor_id,command,result) values(request,p_actor_id,p_command,result);
 return result;
end $$;
revoke all on function public.zukait_reception_command(text,jsonb),public.zukait_reception_external_approval_valid(public.workshop_receptions),public.zukait_reception_job_approval_valid(text,text,jsonb) from public,anon,authenticated;
grant execute on function public.zukait_reception_command(text,jsonb),public.zukait_reception_external_approval_valid(public.workshop_receptions),public.zukait_reception_job_approval_valid(text,text,jsonb) to service_role;

commit;
