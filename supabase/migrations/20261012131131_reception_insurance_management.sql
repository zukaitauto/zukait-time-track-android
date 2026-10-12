-- Staged only. Activate after backup/restore and exact-source acceptance.
begin;
alter table public.workshop_receptions
 add column repair_status text not null default 'PENDING' check(repair_status in ('PENDING','CTL','NOT_REPAIRED')),
 add column repair_notes text,
 add column released_date date,
 add column release_remark text,
 add constraint reception_release_details check((released_date is null and release_remark is null) or
  (released_date is not null and length(trim(release_remark)) between 1 and 2000 and repair_status='CTL'));
create index reception_repair_active_idx on public.workshop_receptions(repair_status,sequence_no desc) where job_card is null and released_date is null;

-- Historical direct-job RC rows stay accessible. New direct jobs use an explicit
-- approval record and never consume an RC number or insert a checklist.
create table public.workshop_direct_job_approvals (
 job_card text primary key, job_type text not null check(job_type in ('CASH','CREDIT','INSURANCE')),
 identity_snapshot jsonb not null, insurance_id bigint references public.workshop_insurance_companies(id),
 reference text, approval_date date, evidence text,
 actor_id text not null references public.staff_credentials(user_id),
 recorded_at timestamptz not null default now(), reason text not null,
 check(job_type<>'INSURANCE' or (insurance_id is not null and length(trim(reference)) between 1 and 200
  and approval_date is not null and length(trim(evidence)) between 1 and 2000))
);
alter table public.workshop_direct_job_approvals enable row level security;
revoke all on public.workshop_direct_job_approvals from public,anon,authenticated,service_role;
grant select,insert on public.workshop_direct_job_approvals to service_role;
create table public.workshop_direct_job_identity (
 job_card text primary key references public.workshop_direct_job_approvals(job_card),
 identity jsonb not null check(jsonb_typeof(identity)='object')
);
create table public.workshop_direct_job_audit (
 id bigint generated always as identity primary key,
 job_card text not null references public.workshop_direct_job_approvals(job_card),
 actor_id text not null references public.staff_credentials(user_id),
 at timestamptz not null default now(), before_data jsonb, after_data jsonb not null, reason text not null
);
alter table public.workshop_direct_job_identity enable row level security;
alter table public.workshop_direct_job_audit enable row level security;
revoke all on public.workshop_direct_job_identity,public.workshop_direct_job_audit from public,anon,authenticated,service_role;
grant select,insert,update on public.workshop_direct_job_identity to service_role;
grant select,insert on public.workshop_direct_job_audit to service_role;
revoke all on sequence public.workshop_direct_job_audit_id_seq from public,anon,authenticated;
grant usage,select on sequence public.workshop_direct_job_audit_id_seq to service_role;
create function public.zukait_direct_identity(j jsonb) returns jsonb language sql immutable security invoker set search_path=public,pg_temp as $$
 select coalesce(jsonb_object_agg(k,v),'{}') from jsonb_each(j) a(k,v) where k in
 ('make','model','brand','vehicle','year','vehicleYear','reg','vin','vinNumber','chassis','customer','customerName','mobile','customerMobile','claimNo','claimNumber','jobType','insuranceCompany','insurance','creditAccount');
$$;
create function public.zukait_direct_identity_state() returns trigger language plpgsql security invoker set search_path=public,pg_temp as $$
declare jobs jsonb;
begin
 if new.id='main' then
  select coalesce(jsonb_agg(case when d.job_card is not null then
   (j-'make'-'model'-'brand'-'vehicle'-'year'-'vehicleYear'-'reg'-'vin'-'vinNumber'-'chassis'-'customer'-'customerName'-'mobile'-'customerMobile'-'claimNo'-'claimNumber'-'jobType'-'insuranceCompany'-'insurance'-'creditAccount')||d.identity||'{"directReceptionJob":true}'::jsonb else j end order by n),'[]') into jobs
   from jsonb_array_elements(coalesce(new.data->'jobs','[]')) with ordinality a(j,n)
   left join public.workshop_direct_job_identity d on d.job_card=j->>'no' and not exists(select 1 from public.workshop_receptions where job_card=d.job_card);
  new.data:=jsonb_set(new.data,'{jobs}',jobs);
 end if;
 return new;
end $$;
create trigger workshop_direct_identity_state before insert or update of data on public.workshop_state for each row execute function public.zukait_direct_identity_state();
revoke all on function public.zukait_direct_identity(jsonb),public.zukait_direct_identity_state() from public,anon,authenticated;
grant execute on function public.zukait_direct_identity(jsonb),public.zukait_direct_identity_state() to service_role;

alter function public.zukait_manager_full_job_edit(bigint,jsonb,text,text,text,jsonb) rename to zukait_manager_linked_full_job_edit;
create function public.zukait_manager_full_job_edit(p_expected_revision bigint,p_data jsonb,p_actor_id text,p_job_card text,p_reason text,p_live jsonb)
returns jsonb language plpgsql security invoker set search_path=public,pg_temp as $$
declare original public.workshop_direct_job_identity; snapshot public.workshop_state; j jsonb; new_identity jsonb; result jsonb; company bigint;
begin
 if not exists(select 1 from public.staff_credentials where user_id=p_actor_id and active and role='Manager') then raise exception 'reception_manager_required'; end if;
 if length(trim(coalesce(p_reason,''))) not between 1 and 2000 then raise exception 'reception_reason_required'; end if;
 if exists(select 1 from public.workshop_receptions where job_card=p_job_card) then return public.zukait_manager_linked_full_job_edit(p_expected_revision,p_data,p_actor_id,p_job_card,p_reason,p_live); end if;
 select * into original from public.workshop_direct_job_identity where job_card=p_job_card for update;
 if not found then return public.zukait_manager_linked_full_job_edit(p_expected_revision,p_data,p_actor_id,p_job_card,p_reason,p_live); end if;
 select * into snapshot from public.workshop_state where id='main' for update;
 if snapshot.revision is distinct from p_expected_revision then return '{"ok":false,"code":"conflict"}'::jsonb; end if;
 select x into j from jsonb_array_elements(p_data->'jobs') x where x->>'no'=p_job_card;
 if j is null then raise exception 'reception_job_not_found'; end if;
 if coalesce(upper(j->>'jobType'),'') not in ('CASH','CREDIT','INSURANCE') then raise exception 'reception_invalid_job_type'; end if;
 if upper(j->>'jobType')='INSURANCE' then
  select id into company from public.workshop_insurance_companies where name=j->>'insuranceCompany';
  if company is null then raise exception 'reception_insurance_required'; end if;
  if not exists(select 1 from public.workshop_direct_job_approvals where job_card=p_job_card and job_type='INSURANCE') then raise exception 'reception_external_approval_required'; end if;
 end if;
 if upper(j->>'jobType')='CREDIT' then j:=j||jsonb_build_object('creditAccount',coalesce(nullif(original.identity->>'creditAccount',''),nullif(j->>'customer','')));if nullif(j->>'creditAccount','') is null then raise exception 'reception_credit_account_required'; end if; else j:=j-'creditAccount'; end if;
 new_identity:=public.zukait_direct_identity(j);
 if new_identity is distinct from original.identity then
  update public.workshop_direct_job_identity set identity=new_identity where job_card=p_job_card;
  insert into public.workshop_direct_job_audit(job_card,actor_id,before_data,after_data,reason) values(p_job_card,p_actor_id,original.identity,new_identity,p_reason);
 end if;
 result:=public.zukait_commit_workshop_state_v2(p_expected_revision,p_data,p_actor_id,p_live);
 if not coalesce((result->>'ok')::boolean,false) then raise exception 'reception_full_edit_commit_failed'; end if;
 select x into j from public.workshop_state s,jsonb_array_elements(s.data->'jobs') x where s.id='main' and x->>'no'=p_job_card;
 return result||jsonb_build_object('job',j);
end $$;
revoke all on function public.zukait_manager_full_job_edit(bigint,jsonb,text,text,text,jsonb),public.zukait_manager_linked_full_job_edit(bigint,jsonb,text,text,text,jsonb) from public,anon,authenticated;
grant execute on function public.zukait_manager_full_job_edit(bigint,jsonb,text,text,text,jsonb),public.zukait_manager_linked_full_job_edit(bigint,jsonb,text,text,text,jsonb) to service_role;

alter function public.zukait_reception_job_approval_valid(text,text,jsonb) rename to zukait_reception_linked_approval_valid;
create function public.zukait_reception_job_approval_valid(p_job text,p_rc text,p_data jsonb default null)
returns boolean language sql stable security invoker set search_path=public,pg_temp as $$
 select public.zukait_reception_linked_approval_valid(p_job,p_rc,p_data) or
 (nullif(p_rc,'') is null and exists(select 1 from public.workshop_direct_job_approvals
  where job_card=p_job and job_type='INSURANCE'));
$$;

alter function public.zukait_reception_command(text,jsonb) rename to zukait_reception_management_base_command;
create function public.zukait_reception_command(p_actor_id text,p_command jsonb)
returns jsonb language plpgsql security invoker set search_path=public,pg_temp as $$
declare op text:=p_command->>'operation'; actor_role text; request uuid;
 cached public.workshop_reception_commands; r public.workshop_receptions;
 result jsonb; before_row jsonb; notes text:=trim(coalesce(p_command->>'reason',''));
 day date; snapshot public.workshop_state; j jsonb; d jsonb; kind text; no text; insurer text;
 amount numeric; details_key text; child_request uuid; direct_command jsonb;
begin
 select role into actor_role from public.staff_credentials where user_id=p_actor_id and active;
 if actor_role is null then raise exception 'reception_forbidden'; end if;
 if op not in ('SET_CTL','SET_NOT_REPAIRED','RELEASE_CTL','SET_APPROVED','CREATE_DIRECT_JOB','CREATE_CHECKLIST_JOB') or op is null then
  if op in ('CREATE','EDIT') and coalesce(p_command->'details'->>'vin','')<>'' and (p_command->'details'->>'vin') !~ '^[A-HJ-NPR-Z0-9]{17}$' then
   if op='CREATE' or not exists(select 1 from public.workshop_receptions where rc_no=p_command->>'rc_no' and details->>'vin'=p_command->'details'->>'vin') then raise exception 'reception_invalid_vin'; end if;
  end if;
  if op='MOVE' then
   select * into r from public.workshop_receptions where rc_no=p_command->>'rc_no' for update;
   if r.released_date is not null then raise exception 'reception_case_closed'; end if;
   if r.repair_status='CTL' and p_command->>'location'='VWC' then raise exception 'reception_ctl_release_required'; end if;
  end if;
  if op in ('CREATE_JOB','CREATE_EXTERNAL_JOB') then
   select * into r from public.workshop_receptions where rc_no=p_command->>'rc_no' for update;
   if r.repair_status<>'PENDING' or r.released_date is not null then raise exception 'reception_repair_closed'; end if;
  end if;
  result:=public.zukait_reception_management_base_command(p_actor_id,p_command);
  if op='CAPABILITIES' then result:=result||'{"management_v1":true}'::jsonb; end if;
  return result;
 end if;
 if actor_role not in ('Manager','Supervisor','Receptionist') then
  if op in ('CREATE_DIRECT_JOB','CREATE_CHECKLIST_JOB') then raise exception 'reception_job_forbidden'; end if;
  raise exception 'reception_forbidden';
 end if;
 if coalesce(p_command->>'request_id','') !~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' then raise exception 'reception_request_required'; end if;
 request:=(p_command->>'request_id')::uuid;
 perform pg_advisory_xact_lock(hashtextextended(request::text,0));
 select * into cached from public.workshop_reception_commands where request_id=request;
 if found then
  if cached.actor_id<>p_actor_id or cached.command<>p_command then raise exception 'reception_request_conflict'; end if;
  return cached.result||'{"duplicate":true}'::jsonb;
 end if;
 if jsonb_typeof(p_command->'reason') is distinct from 'string' or length(notes) not between 1 and 2000 then raise exception 'reception_reason_required'; end if;
 if op='CREATE_CHECKLIST_JOB' then
  if exists(select 1 from jsonb_object_keys(p_command) k where k not in ('operation','request_id','rc_no','expected_revision','job_card','reason','cash_amount')) then raise exception 'reception_invalid_fields'; end if;
  select * into r from public.workshop_receptions where rc_no=p_command->>'rc_no' for update;
  if not found or coalesce(r.details->>'direct_job_only','false')='true' then raise exception 'reception_not_found'; end if;
  if coalesce(p_command->>'expected_revision','') !~ '^[0-9]+$' or (p_command->>'expected_revision')::numeric<>r.revision then raise exception 'reception_stale_revision'; end if;
  if r.job_card is not null or r.outcome is not null or r.repair_status<>'PENDING' or r.released_date is not null then raise exception 'reception_case_closed'; end if;
  if r.job_type not in ('CASH','CREDIT') then raise exception 'reception_invalid_job_type'; end if;
  select coalesce(jsonb_object_agg(k,v),'{}') into d from jsonb_each(r.details) a(k,v) where k in ('make','model','registration','year','vin','customer','contact','claim','odometer','odometer_unit');
  child_request:=md5(request::text||':checklist-job')::uuid;
  direct_command:=jsonb_build_object('operation','CREATE_DIRECT_JOB','request_id',child_request,'job_card',p_command->>'job_card','job_type',r.job_type,'details',d,'reason',notes,'received_confirmed',true);
  if r.job_type='CREDIT' then direct_command:=direct_command||jsonb_build_object('credit_account',r.credit_account); end if;
  if p_command ? 'cash_amount' then direct_command:=direct_command||jsonb_build_object('cash_amount',p_command->'cash_amount'); end if;
  result:=public.zukait_reception_command(p_actor_id,direct_command);
  no:=result->>'job_card';
  update public.workshop_receptions set job_card=no,revision=revision+1,updated_by=p_actor_id,updated_at=now() where rc_no=r.rc_no returning * into r;
  select * into snapshot from public.workshop_state where id='main' for update;
  select jsonb_agg(case when x->>'no'=no then (x-'directReceptionJob')||jsonb_build_object('receptionNo',r.rc_no,'receptionLocation',r.location) else x end order by n) into j from jsonb_array_elements(snapshot.data->'jobs') with ordinality a(x,n);
  insert into public.workshop_state_history(revision,data,updated_at,updated_by) values(snapshot.revision,snapshot.data,snapshot.updated_at,snapshot.updated_by) on conflict(revision) do nothing;
  update public.workshop_state set data=jsonb_set(snapshot.data,'{jobs}',j),revision=snapshot.revision+1,updated_by=p_actor_id,updated_at=now() where id='main';
  insert into public.workshop_reception_audit(rc_no,operation,actor_id,after_data,reason) values(r.rc_no,op,p_actor_id,jsonb_build_object('job_card',no),notes);
  result:=jsonb_build_object('ok',true,'record',to_jsonb(r),'job_card',no,'server_revision',snapshot.revision+1);
 elsif op='CREATE_DIRECT_JOB' then
  if exists(select 1 from jsonb_object_keys(p_command) k where k not in
   ('operation','request_id','job_card','job_type','details','credit_account','received_confirmed','reason','insurance_id','reference','approval_date','evidence','approval_confirmed','cash_amount')) then raise exception 'reception_invalid_fields'; end if;
  kind:=p_command->>'job_type'; no:=upper(trim(p_command->>'job_card')); d:=p_command->'details';
  if kind is null or kind not in ('CASH','CREDIT','INSURANCE') then raise exception 'reception_invalid_job_type'; end if;
  if no is null or no !~ '^[A-Z0-9][A-Z0-9/-]{0,39}$' or no='ID001' then raise exception 'reception_invalid_job_number'; end if;
  if p_command->'received_confirmed' is distinct from 'true'::jsonb then raise exception 'reception_received_confirmation_required'; end if;
  if jsonb_typeof(d) is distinct from 'object' or exists(select 1 from jsonb_object_keys(d) k where k not in
   ('make','model','registration','year','vin','customer','contact','claim','remarks','odometer','odometer_unit')) then raise exception 'reception_invalid_fields'; end if;
  for details_key in select jsonb_object_keys(d) loop
   if jsonb_typeof(d->details_key) is distinct from 'string' or length(d->>details_key)>2000 then raise exception 'reception_invalid_details'; end if;
  end loop;
  if nullif(trim(d->>'make'),'') is null or nullif(trim(d->>'model'),'') is null
   or coalesce(d->>'year','') !~ '^[0-9]{4}$' then raise exception 'reception_vehicle_required'; end if;
  if coalesce(d->>'odometer','')<>'' and (d->>'odometer') !~ '^[0-9]{1,10}([.][0-9]{1,2})?$' then raise exception 'reception_invalid_odometer'; end if;
  if coalesce(d->>'odometer_unit','KM') not in ('KM','Miles') then raise exception 'reception_invalid_unit'; end if;
  if coalesce(d->>'vin','')<>'' and d->>'vin' !~ '^[A-HJ-NPR-Z0-9]{17}$' then raise exception 'reception_invalid_vin'; end if;
  if kind='CREDIT' and length(trim(coalesce(p_command->>'credit_account',''))) not between 1 and 200 then raise exception 'reception_credit_account_required'; end if;
  if kind<>'CREDIT' and p_command ? 'credit_account' then raise exception 'reception_invalid_fields'; end if;
  if kind='INSURANCE' then
   if p_command->'approval_confirmed' is distinct from 'true'::jsonb then raise exception 'reception_approval_confirmation_required'; end if;
   select name into insurer from public.workshop_insurance_companies where id=(p_command->>'insurance_id')::bigint and active;
   if insurer is null then raise exception 'reception_insurance_required'; end if;
   if length(trim(coalesce(p_command->>'reference',''))) not between 1 and 200 or length(trim(coalesce(p_command->>'evidence',''))) not between 1 and 2000 then raise exception 'reception_external_evidence_required'; end if;
   if coalesce(p_command->>'approval_date','') !~ '^\d{4}-\d{2}-\d{2}$' then raise exception 'reception_invalid_approval_date'; end if;
   day:=(p_command->>'approval_date')::date;
   if day>(now() at time zone 'Asia/Muscat')::date then raise exception 'reception_invalid_approval_date'; end if;
  end if;
  if coalesce(p_command->>'cash_amount','')<>'' then
   if p_command->>'cash_amount' !~ '^[0-9]+([.][0-9]{1,3})?$' or length(p_command->>'cash_amount')>20 then raise exception 'reception_invalid_amount'; end if;
   amount:=(p_command->>'cash_amount')::numeric;
   if amount>1000000 then raise exception 'reception_invalid_amount'; end if;
  end if;
  perform pg_advisory_xact_lock(hashtextextended('rc-job:'||no,0));
  select * into snapshot from public.workshop_state where id='main' for update;
  if not found then raise exception 'reception_workshop_unavailable'; end if;
  if exists(select 1 from jsonb_array_elements(coalesce(snapshot.data->'jobs','[]')) x where upper(x->>'no')=no)
   or exists(select 1 from public.workshop_v2_jobcards where upper(job_card)=no)
   or exists(select 1 from public.workshop_v2_spare_part_state where upper(job_card)=no)
   or exists(select 1 from public.workshop_v2_events where event_type like 'SPARE_PART%' and upper(payload->>'jobCard')=no) then raise exception 'reception_job_number_exists'; end if;
  j:=jsonb_build_object('no',no,'jobType',kind,'status','Open','workflowStage','CREATED','createdBy',p_actor_id,
   'createdAt',floor(extract(epoch from now())*1000),'v2EventId','rc-direct-'||request,'v2Created',true,
   'make',d->>'make','brand',d->>'make','model',d->>'model','year',d->>'year','vehicleYear',d->>'year',
   'vehicle',trim((d->>'make')||' '||(d->>'model')),'reg',d->>'registration','vin',coalesce(d->>'vin',''),
   'customerName',d->>'customer','customer',d->>'customer','mobile',d->>'contact','claimNo',coalesce(d->>'claim',''),
   'intakeOdometer',coalesce(d->>'odometer',''),'intakeOdometerUnit',coalesce(d->>'odometer_unit','KM'),
   'receptionLocation','VIW','amount',amount);
  if kind='INSURANCE' then j:=j||jsonb_build_object('insuranceCompany',insurer,'insurance',insurer); end if;
  if kind='CREDIT' then j:=j||jsonb_build_object('creditAccount',trim(p_command->>'credit_account')); end if;
  insert into public.workshop_direct_job_approvals(job_card,job_type,identity_snapshot,insurance_id,reference,approval_date,evidence,actor_id,reason)
   values(no,kind,j,case when kind='INSURANCE' then (p_command->>'insurance_id')::bigint end,p_command->>'reference',day,p_command->>'evidence',p_actor_id,notes);
  insert into public.workshop_direct_job_identity(job_card,identity) values(no,public.zukait_direct_identity(j));
  insert into public.workshop_direct_job_audit(job_card,actor_id,after_data,reason) values(no,p_actor_id,j,notes);
  insert into public.workshop_state_history(revision,data,updated_at,updated_by) values(snapshot.revision,snapshot.data,snapshot.updated_at,snapshot.updated_by) on conflict(revision) do nothing;
  update public.workshop_state set data=jsonb_set(snapshot.data,'{jobs}',coalesce(snapshot.data->'jobs','[]')||jsonb_build_array(j)),revision=snapshot.revision+1,updated_by=p_actor_id,updated_at=now() where id='main';
  perform public.zukait_v2_commit_event('rc-direct-'||request,no,p_actor_id,'reception-server','JOB_CREATED',null,0,
   jsonb_build_object('jobCard',no,'registration',j->>'reg','vehicleMake',j->>'make','vehicleModel',j->>'model','vehicleYear',j->>'year','workflowStage','CREATED','status','OPEN','jobType',kind,'insuranceCompany',insurer));
  result:=jsonb_build_object('ok',true,'job',j,'job_card',no,'server_revision',snapshot.revision+1);
 else
  if exists(select 1 from jsonb_object_keys(p_command) k where k not in ('operation','rc_no','expected_revision','request_id','reason','date')) then raise exception 'reception_invalid_fields'; end if;
  select * into r from public.workshop_receptions where rc_no=p_command->>'rc_no' for update;
  if not found or coalesce(r.details->>'direct_job_only','false')='true' then raise exception 'reception_not_found'; end if;
  if coalesce(p_command->>'expected_revision','') !~ '^[0-9]+$' or (p_command->>'expected_revision')::numeric<>r.revision then raise exception 'reception_stale_revision'; end if;
  if r.job_card is not null or r.outcome is not null or r.released_date is not null then raise exception 'reception_case_closed'; end if;
  before_row:=to_jsonb(r);
  if op='SET_CTL' then
   if r.location<>'VIW' or r.repair_status<>'PENDING' then raise exception 'reception_ctl_garage_required'; end if;
   update public.workshop_receptions set repair_status='CTL',repair_notes=notes where rc_no=r.rc_no;
  elsif op='SET_NOT_REPAIRED' then
   if r.repair_status<>'PENDING' then raise exception 'reception_repair_closed'; end if;
   update public.workshop_receptions set repair_status='NOT_REPAIRED',repair_notes=notes where rc_no=r.rc_no;
  elsif op='RELEASE_CTL' then
   if r.repair_status<>'CTL' or r.location<>'VIW' then raise exception 'reception_ctl_garage_required'; end if;
   if coalesce(p_command->>'date','') !~ '^\d{4}-\d{2}-\d{2}$' then raise exception 'reception_invalid_release_date'; end if;
   day:=(p_command->>'date')::date;
   if day<(r.received_at at time zone 'Asia/Muscat')::date or day>(now() at time zone 'Asia/Muscat')::date then raise exception 'reception_invalid_release_date'; end if;
   if exists(select 1 from public.workshop_reception_movements where rc_no=r.rc_no and (occurred_at at time zone 'Asia/Muscat')::date>day) then raise exception 'reception_invalid_release_date'; end if;
   insert into public.workshop_reception_movements(rc_no,from_location,to_location,occurred_at,actor_id,reason)
    values(r.rc_no,r.location,'VWC',case when day=(now() at time zone 'Asia/Muscat')::date then now() else (day+1)::timestamp at time zone 'Asia/Muscat' - interval '1 millisecond' end,p_actor_id,notes);
   update public.workshop_receptions set released_date=day,release_remark=notes,location='VWC' where rc_no=r.rc_no;
  elsif op='SET_APPROVED' then
   if r.repair_status<>'PENDING' then raise exception 'reception_repair_closed'; end if;
   if coalesce(p_command->>'date','') !~ '^\d{4}-\d{2}-\d{2}$' then raise exception 'reception_invalid_approval_date'; end if;
   day:=(p_command->>'date')::date;
   if day>(now() at time zone 'Asia/Muscat')::date then raise exception 'reception_invalid_approval_date'; end if;
   -- Approval is business evidence, never a fabricated financial amount.
   if r.job_type='INSURANCE' then
    if coalesce((select items from public.workshop_reception_preliminary_parts where rc_no=r.rc_no),'[]'::jsonb)<>'[]'::jsonb then raise exception 'reception_external_parts_review_required'; end if;
    insert into public.workshop_reception_external_approvals(id,rc_no,reference,approval_date,evidence,identity_snapshot,parts_snapshot,actor_id,reason)
     values(request,r.rc_no,'Reception approval',day,notes,public.zukait_reception_identity(r.details,r.insurance_id),'[]',p_actor_id,notes);
   end if;
   update public.workshop_receptions set approval_status='APPROVED' where rc_no=r.rc_no;
  end if;
  update public.workshop_receptions set revision=revision+1,updated_by=p_actor_id,updated_at=now() where rc_no=r.rc_no returning * into r;
  insert into public.workshop_reception_audit(rc_no,operation,actor_id,before_data,after_data,reason) values(r.rc_no,op,p_actor_id,before_row,to_jsonb(r),notes);
  result:=jsonb_build_object('ok',true,'record',to_jsonb(r));
 end if;
 insert into public.workshop_reception_commands(request_id,actor_id,command,result) values(request,p_actor_id,p_command,result);
 return result;
end $$;
revoke all on function public.zukait_reception_command(text,jsonb),public.zukait_reception_job_approval_valid(text,text,jsonb) from public,anon,authenticated;
grant execute on function public.zukait_reception_command(text,jsonb),public.zukait_reception_job_approval_valid(text,text,jsonb) to service_role;

-- Receptionist estimates reuse the existing estimator, number sequence and
-- authoritative estimates array without granting access to full workshop state.
create function public.zukait_reception_estimate_command(p_actor_id text,p_command jsonb)
returns jsonb language plpgsql security invoker set search_path=public,pg_temp as $$
declare op text:=p_command->>'operation'; r public.workshop_receptions; snapshot public.workshop_state;
 request uuid; cached public.workshop_reception_commands; allocation public.workshop_v2_estimate_numbers;
 result jsonb; estimate jsonb; old_estimate jsonb; seq bigint; no text; item jsonb; row_key text;
begin
 if not exists(select 1 from public.staff_credentials where user_id=p_actor_id and active and role in ('Manager','Supervisor','Receptionist')) then raise exception 'reception_forbidden'; end if;
 if op='GET' then
  if exists(select 1 from jsonb_object_keys(p_command) k where k not in ('operation','rc_no')) then raise exception 'reception_invalid_fields'; end if;
  if not exists(select 1 from public.workshop_receptions where rc_no=p_command->>'rc_no' and coalesce(details->>'direct_job_only','false')<>'true') then raise exception 'reception_not_found'; end if;
  return jsonb_build_object('ok',true,'estimates',(select coalesce(jsonb_agg(e),'[]') from public.workshop_state s,jsonb_array_elements(coalesce(s.data->'estimates','[]')) e where s.id='main' and e->>'receptionNo'=p_command->>'rc_no'));
 end if;
 if op not in ('ALLOCATE','SAVE') or op is null or exists(select 1 from jsonb_object_keys(p_command) k where k not in ('operation','request_id','rc_no','client_key','estimate','expected_revision')) then raise exception 'reception_invalid_fields'; end if;
 if coalesce(p_command->>'request_id','') !~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' then raise exception 'reception_request_required'; end if;
 request:=(p_command->>'request_id')::uuid;
 perform pg_advisory_xact_lock(hashtextextended(request::text,0));
 select * into cached from public.workshop_reception_commands where request_id=request;
 if found then
  if cached.actor_id<>p_actor_id or cached.command<>p_command then raise exception 'reception_request_conflict'; end if;
  return cached.result||'{"duplicate":true}'::jsonb;
 end if;
 select * into r from public.workshop_receptions where rc_no=p_command->>'rc_no' for update;
 if not found or coalesce(r.details->>'direct_job_only','false')='true' then raise exception 'reception_not_found'; end if;
 if r.job_card is not null or r.outcome is not null or r.repair_status<>'PENDING' or r.released_date is not null then raise exception 'reception_case_closed'; end if;
 if coalesce(p_command->>'client_key','') !~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' then raise exception 'reception_request_required'; end if;
 perform pg_advisory_xact_lock(hashtextextended('estimate-no:'||(p_command->>'client_key'),0));
 select * into allocation from public.workshop_v2_estimate_numbers where client_key=p_command->>'client_key';
 if found and allocation.created_by<>p_actor_id then raise exception 'reception_forbidden'; end if;
 if op='ALLOCATE' then
  if allocation.estimate_no is null then
   seq:=nextval('public.workshop_v2_estimate_no_seq');
   no:='Zi-Qt'||case when length(seq::text)>3 then seq::text else lpad(seq::text,3,'0') end;
   insert into public.workshop_v2_estimate_numbers(estimate_no,sequence_no,client_key,created_by) values(no,seq,p_command->>'client_key',p_actor_id) returning * into allocation;
  end if;
  result:=jsonb_build_object('ok',true,'estimate',to_jsonb(allocation));
 else
  if allocation.estimate_no is null then raise exception 'reception_estimate_number_required'; end if;
  estimate:=p_command->'estimate';
  if jsonb_typeof(estimate) is distinct from 'object' or pg_column_size(estimate)>64000 or
   estimate->>'id' is distinct from p_command->>'client_key' or estimate->>'estimateNo' is distinct from allocation.estimate_no or estimate->>'receptionNo' is distinct from r.rc_no
   or coalesce(estimate->>'type','') not in ('LS','PL') or jsonb_typeof(estimate->'vatEnabled') is distinct from 'boolean' then raise exception 'reception_invalid_estimate'; end if;
  if exists(select 1 from jsonb_object_keys(estimate) k where k not in ('id','estimateNo','sequenceNo','date','type','vatEnabled','vatRate','customerName','mobile','makeModel','year','registration','vin','claimNo','jobCard','lsRows','labourRows','partRows','misc','lsSpareParts','notes','customerSuppliedParts','showCustomerSuppliedParts','status','createdAt','createdBy','updatedAt','updatedBy','revision','receptionNo','insuranceCompany','jobType')) then raise exception 'reception_invalid_estimate'; end if;
  for row_key in select unnest(array['lsRows','labourRows','partRows']) loop
   if jsonb_typeof(estimate->row_key) is distinct from 'array' or jsonb_array_length(estimate->row_key)>200 then raise exception 'reception_invalid_estimate'; end if;
   for item in select value from jsonb_array_elements(estimate->row_key) loop
    if jsonb_typeof(item) is distinct from 'object' then raise exception 'reception_invalid_estimate'; end if;
    if row_key='partRows' then
     if coalesce(item->>'qty','') !~ '^[0-9]+([.][0-9]+)?$' or coalesce(item->>'unitPrice','') !~ '^[0-9]+([.][0-9]+)?$' or (item->>'qty')::numeric>1000000 or (item->>'unitPrice')::numeric>1000000 then raise exception 'reception_invalid_estimate'; end if;
    elsif coalesce(item->>'amount','') !~ '^[0-9]+([.][0-9]+)?$' or (item->>'amount')::numeric>1000000 then raise exception 'reception_invalid_estimate'; end if;
   end loop;
  end loop;
  if coalesce(estimate->>'misc','') !~ '^[0-9]+([.][0-9]+)?$' or coalesce(estimate->>'lsSpareParts','') !~ '^[0-9]+([.][0-9]+)?$' then raise exception 'reception_invalid_estimate'; end if;
  select * into snapshot from public.workshop_state where id='main' for update;
  select x into old_estimate from jsonb_array_elements(coalesce(snapshot.data->'estimates','[]')) x where x->>'id'=p_command->>'client_key';
  if old_estimate is not null and (old_estimate->>'createdBy'<>p_actor_id or old_estimate->>'receptionNo'<>r.rc_no) then raise exception 'reception_forbidden'; end if;
  if coalesce(p_command->>'expected_revision','') !~ '^[0-9]+$' or (p_command->>'expected_revision')::numeric<>coalesce((old_estimate->>'revision')::numeric,0) then raise exception 'reception_stale_revision'; end if;
  estimate:=estimate||jsonb_build_object('sequenceNo',allocation.sequence_no,'vatRate',0.05,'jobCard','',
   'customerName',coalesce(r.details->>'customer',''),'mobile',coalesce(r.details->>'contact',''),'makeModel',concat_ws(' ',r.details->>'make',r.details->>'model'),
   'year',coalesce(r.details->>'year',''),'registration',coalesce(r.details->>'registration',''),'vin',coalesce(r.details->>'vin',''),'claimNo',coalesce(r.details->>'claim',''),
   'insuranceCompany',coalesce((select name from public.workshop_insurance_companies where id=r.insurance_id),''),'jobType',r.job_type,
   'createdBy',p_actor_id,'createdAt',coalesce(old_estimate->'createdAt',to_jsonb(floor(extract(epoch from allocation.created_at)*1000))),
   'updatedBy',p_actor_id,'updatedAt',floor(extract(epoch from now())*1000),'revision',coalesce((old_estimate->>'revision')::bigint,0)+1,'status','Saved');
  select coalesce(jsonb_agg(x),'[]') into item from jsonb_array_elements(coalesce(snapshot.data->'estimates','[]')) x where x->>'id'<>p_command->>'client_key';
  insert into public.workshop_state_history(revision,data,updated_at,updated_by) values(snapshot.revision,snapshot.data,snapshot.updated_at,snapshot.updated_by) on conflict(revision) do nothing;
  update public.workshop_state set data=jsonb_set(snapshot.data,'{estimates}',item||jsonb_build_array(estimate)),revision=snapshot.revision+1,updated_at=now(),updated_by=p_actor_id where id='main';
  insert into public.workshop_reception_audit(rc_no,operation,actor_id,before_data,after_data,reason) values(r.rc_no,'ESTIMATE_SAVE',p_actor_id,old_estimate,estimate,'Reception estimate saved');
  result:=jsonb_build_object('ok',true,'estimate',estimate,'server_revision',snapshot.revision+1);
 end if;
 insert into public.workshop_reception_commands(request_id,actor_id,command,result) values(request,p_actor_id,p_command,result);
 return result;
end $$;
revoke all on function public.zukait_reception_estimate_command(text,jsonb) from public,anon,authenticated;
grant execute on function public.zukait_reception_estimate_command(text,jsonb) to service_role;
commit;
