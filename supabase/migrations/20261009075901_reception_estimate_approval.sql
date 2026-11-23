begin;
create table public.workshop_reception_estimates (
  id uuid primary key default gen_random_uuid(),
  rc_no text not null references public.workshop_receptions(rc_no),
  estimate_id text not null unique,
  estimate_no text not null unique,
  snapshot jsonb not null,
  identity_snapshot jsonb not null,
  linked_by text not null references public.staff_credentials(user_id),
  linked_at timestamptz not null default now()
);
create index workshop_reception_estimates_rc_idx on public.workshop_reception_estimates(rc_no);
create table public.workshop_reception_approvals (
  id bigint generated always as identity primary key,
  rc_no text not null references public.workshop_receptions(rc_no),
  quotation_id uuid not null references public.workshop_reception_estimates(id),
  reference text not null,
  approval_date date not null,
  approved_amount numeric(12,3) not null check(approved_amount>=0),
  approved_parts jsonb not null,
  estimate_snapshot jsonb not null,
  parts_snapshot jsonb not null,
  identity_snapshot jsonb not null,
  actor_id text not null references public.staff_credentials(user_id),
  recorded_at timestamptz not null default now(),
  reason text not null
);
create index workshop_reception_approvals_rc_idx on public.workshop_reception_approvals(rc_no,id desc);
alter table public.workshop_reception_estimates enable row level security;
alter table public.workshop_reception_approvals enable row level security;
revoke all on public.workshop_reception_estimates,public.workshop_reception_approvals from public,anon,authenticated,service_role;
grant select,insert,update on public.workshop_reception_estimates to service_role;
grant select,insert on public.workshop_reception_approvals to service_role;
revoke all on sequence public.workshop_reception_approvals_id_seq from public,anon,authenticated;
grant usage,select on sequence public.workshop_reception_approvals_id_seq to service_role;
create function public.zukait_reception_identity(p_details jsonb,p_insurance_id bigint)
returns jsonb language sql immutable security invoker set search_path=public,pg_temp as $$
 select jsonb_build_object('insurance_id',p_insurance_id,'make',coalesce(p_details->>'make',''),'model',coalesce(p_details->>'model',''),
 'customer',coalesce(p_details->>'customer',''),'contact',coalesce(p_details->>'contact',''),'registration',coalesce(p_details->>'registration',''),
 'year',coalesce(p_details->>'year',''),'vin',coalesce(p_details->>'vin',''),'claim',coalesce(p_details->>'claim',''))
$$;
revoke all on function public.zukait_reception_identity(jsonb,bigint) from public,anon,authenticated;
grant execute on function public.zukait_reception_identity(jsonb,bigint) to service_role;

alter function public.zukait_reception_command(text,jsonb) rename to zukait_reception_preparation_command;
create function public.zukait_reception_command(p_actor_id text,p_command jsonb)
returns jsonb language plpgsql security invoker set search_path=public,pg_temp as $$
declare
 v_op text:=p_command->>'operation'; v_role text; v_rc public.workshop_receptions%rowtype;
 v_cached public.workshop_reception_commands%rowtype; v_link public.workshop_reception_estimates%rowtype;
 v_approval public.workshop_reception_approvals%rowtype;
 v_request uuid; v_result jsonb; v_state jsonb; v_estimates jsonb; v_estimate jsonb; v_draft jsonb;
 v_parts jsonb; v_selected jsonb:='[]'; v_item jsonb; v_source jsonb; v_reason text:=trim(coalesce(p_command->>'reason',''));
 v_before jsonb; v_date date; v_valid boolean:=false; v_can boolean; v_insurer text;
begin
 if v_op is null then raise exception 'reception_invalid_operation'; end if;
 if v_op not in ('LINK_ESTIMATE','RECORD_APPROVAL','REVOKE_APPROVAL') then
  v_result:=public.zukait_reception_preparation_command(p_actor_id,p_command);
  if v_op='GET' then
   select * into v_rc from public.workshop_receptions where rc_no=p_command->>'rc_no';
   select role into v_role from public.staff_credentials where user_id=p_actor_id and active;
   v_can:=v_role in ('Manager','Supervisor') and v_rc.outcome is null and v_rc.job_card is null;
   select * into v_approval from public.workshop_reception_approvals where rc_no=v_rc.rc_no order by id desc limit 1;
   if found and v_rc.approval_status='APPROVED' and v_rc.outcome is null then
    select data into v_state from public.workshop_state where id='main';
    v_estimates:=case when jsonb_typeof(v_state->'estimates')='array' then v_state->'estimates' else '[]'::jsonb end;
    select snapshot into v_estimate from public.workshop_reception_estimates where id=v_approval.quotation_id;
    select coalesce(items,'[]') into v_draft from public.workshop_reception_preliminary_parts where rc_no=v_rc.rc_no;
    v_valid:=v_approval.identity_snapshot=public.zukait_reception_identity(v_rc.details,v_rc.insurance_id)
     and v_approval.parts_snapshot=coalesce(v_draft,'[]') and v_approval.estimate_snapshot=v_estimate
     and exists(select 1 from jsonb_array_elements(v_estimates) e where e=v_approval.estimate_snapshot);
   end if;
   return v_result||jsonb_build_object('insurance',jsonb_build_object('can_prepare',v_can,'can_revoke',v_can and v_role='Manager',
    'approval_valid',v_valid,'estimates',(select coalesce(jsonb_agg(jsonb_build_object('id',id,'estimate_no',estimate_no,'linked_at',linked_at) order by linked_at desc),'[]') from public.workshop_reception_estimates where rc_no=v_rc.rc_no),
    'approvals',(select coalesce(jsonb_agg(to_jsonb(a)-'estimate_snapshot'-'parts_snapshot'-'identity_snapshot' order by id desc),'[]') from (select * from public.workshop_reception_approvals where rc_no=v_rc.rc_no order by id desc limit 100) a)));
  end if;
  return v_result;
 end if;
 select role into v_role from public.staff_credentials where user_id=p_actor_id and active;
 if v_role is null or v_role not in ('Manager','Supervisor') then raise exception 'reception_approval_forbidden'; end if;
 if v_op='REVOKE_APPROVAL' and v_role<>'Manager' then raise exception 'reception_manager_required'; end if;
 if exists(select 1 from jsonb_object_keys(p_command) k where k not in ('operation','rc_no','expected_revision','request_id','reason','estimate_no','quotation_id','reference','approval_date','approved_amount','approved_parts')) then raise exception 'reception_invalid_fields'; end if;
 if coalesce(p_command->>'request_id','') !~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' then raise exception 'reception_request_required'; end if;
 v_request:=(p_command->>'request_id')::uuid;
 perform pg_advisory_xact_lock(hashtextextended(v_request::text,0));
 select * into v_cached from public.workshop_reception_commands where request_id=v_request;
 if found then
  if v_cached.actor_id<>p_actor_id or v_cached.command<>p_command then raise exception 'reception_request_conflict'; end if;
  return v_cached.result||'{"duplicate":true}'::jsonb;
 end if;
 -- Lock order for future JC linkage: RC first, then shared workshop state.
 select * into v_rc from public.workshop_receptions where rc_no=p_command->>'rc_no' for update;
 if not found then raise exception 'reception_not_found'; end if;
 if coalesce(p_command->>'expected_revision','') !~ '^[0-9]+$' then raise exception 'reception_stale_revision'; end if;
 if (p_command->>'expected_revision')::numeric<>v_rc.revision then raise exception 'reception_stale_revision'; end if;
 if v_rc.outcome is not null then raise exception 'reception_case_closed'; end if;
 if v_rc.job_card is not null then raise exception 'reception_approval_linked_requires_next_phase'; end if;
 if jsonb_typeof(p_command->'reason') is distinct from 'string' or length(v_reason) not between 1 and 2000 then raise exception 'reception_reason_required'; end if;
 if v_op='REVOKE_APPROVAL' then
  if v_rc.approval_status<>'APPROVED' then raise exception 'reception_not_approved'; end if;
  v_before:=jsonb_build_object('approval_status',v_rc.approval_status);
  update public.workshop_receptions set approval_status='WAITING' where rc_no=v_rc.rc_no;
 else
  select data into v_state from public.workshop_state where id='main' for share;
  v_estimates:=case when jsonb_typeof(v_state->'estimates')='array' then v_state->'estimates' else '[]'::jsonb end;
  select items into v_draft from public.workshop_reception_preliminary_parts where rc_no=v_rc.rc_no;
  v_draft:=coalesce(v_draft,'[]');
  if v_op='LINK_ESTIMATE' then
   if (select count(*) from jsonb_array_elements(v_estimates) e where lower(e->>'estimateNo')=lower(trim(p_command->>'estimate_no')))<>1 then raise exception 'reception_estimate_not_synced'; end if;
   select e into v_estimate from jsonb_array_elements(v_estimates) e where lower(e->>'estimateNo')=lower(trim(p_command->>'estimate_no'));
   if not exists(select 1 from public.workshop_v2_estimate_numbers where client_key=v_estimate->>'id' and estimate_no=v_estimate->>'estimateNo') then raise exception 'reception_estimate_not_official'; end if;
   select name into v_insurer from public.workshop_insurance_companies where id=v_rc.insurance_id;
   if coalesce(v_estimate->>'jobCard','')<>'' or coalesce(v_estimate->>'receptionNo',v_rc.rc_no)<>v_rc.rc_no
    or (v_estimate ? 'insuranceCompany' and v_estimate->>'insuranceCompany'<>v_insurer)
    or lower(trim(regexp_replace(coalesce(v_estimate->>'makeModel',''),'\s+',' ','g')))<>lower(concat_ws(' ',v_rc.details->>'make',v_rc.details->>'model'))
    or upper(trim(coalesce(v_estimate->>'registration','')))<>coalesce(v_rc.details->>'registration','')
    or upper(trim(coalesce(v_estimate->>'vin','')))<>coalesce(v_rc.details->>'vin','')
    or trim(coalesce(v_estimate->>'year',''))<>coalesce(v_rc.details->>'year','')
    or trim(coalesce(v_estimate->>'customerName',''))<>coalesce(v_rc.details->>'customer','')
    or trim(coalesce(v_estimate->>'mobile',''))<>coalesce(v_rc.details->>'contact','')
    or trim(coalesce(v_estimate->>'claimNo',''))<>coalesce(v_rc.details->>'claim','') then raise exception 'reception_estimate_vehicle_mismatch'; end if;
   select * into v_link from public.workshop_reception_estimates where estimate_id=v_estimate->>'id' for update;
   if found and v_link.rc_no<>v_rc.rc_no then raise exception 'reception_estimate_already_linked'; end if;
   v_before:=case when v_link.id is null then null else to_jsonb(v_link) end;
   insert into public.workshop_reception_estimates(rc_no,estimate_id,estimate_no,snapshot,identity_snapshot,linked_by)
    values(v_rc.rc_no,v_estimate->>'id',v_estimate->>'estimateNo',v_estimate,public.zukait_reception_identity(v_rc.details,v_rc.insurance_id),p_actor_id)
    on conflict(estimate_id) do update set snapshot=excluded.snapshot,identity_snapshot=excluded.identity_snapshot,linked_by=excluded.linked_by,linked_at=now()
    where workshop_reception_estimates.rc_no=excluded.rc_no returning * into v_link;
   if not found then raise exception 'reception_estimate_already_linked'; end if;
   v_result:=jsonb_build_object('quotation',to_jsonb(v_link)-'snapshot');
  else
   if coalesce(p_command->>'quotation_id','') !~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' then raise exception 'reception_invalid_approval'; end if;
   select * into v_link from public.workshop_reception_estimates where id=(p_command->>'quotation_id')::uuid and rc_no=v_rc.rc_no;
   if not found then raise exception 'reception_estimate_not_linked'; end if;
   if v_link.identity_snapshot<>public.zukait_reception_identity(v_rc.details,v_rc.insurance_id) then raise exception 'reception_estimate_vehicle_mismatch'; end if;
   if not exists(select 1 from jsonb_array_elements(v_estimates) e where e=v_link.snapshot) then raise exception 'reception_estimate_changed'; end if;
   if jsonb_typeof(p_command->'reference') is distinct from 'string' or length(trim(coalesce(p_command->>'reference',''))) not between 1 and 200
    or coalesce(p_command->>'approved_amount','') !~ '^[0-9]{1,9}([.][0-9]{1,3})?$'
    or coalesce(p_command->>'approval_date','') !~ '^[0-9]{4}-[0-9]{2}-[0-9]{2}$' then raise exception 'reception_invalid_approval'; end if;
   begin v_date:=(p_command->>'approval_date')::date; exception when datetime_field_overflow or invalid_datetime_format then raise exception 'reception_invalid_approval'; end;
   if v_date>(now() at time zone 'Asia/Muscat')::date then raise exception 'reception_invalid_approval'; end if;
   v_parts:=p_command->'approved_parts';
   if jsonb_typeof(v_parts) is distinct from 'array' then raise exception 'reception_invalid_approved_parts'; end if;
   if jsonb_array_length(v_parts)>200 then raise exception 'reception_invalid_approved_parts'; end if;
   for v_item in select value from jsonb_array_elements(v_parts) loop
    if jsonb_typeof(v_item)<>'object' then raise exception 'reception_invalid_approved_parts'; end if;
    if exists(select 1 from jsonb_object_keys(v_item) k where k not in ('id','qty')) or jsonb_typeof(v_item->'id') is distinct from 'string'
     or jsonb_typeof(v_item->'qty') is distinct from 'number' or coalesce(v_item->>'qty','') !~ '^[0-9]+$' then raise exception 'reception_invalid_approved_parts'; end if;
    select i into v_source from jsonb_array_elements(v_draft) i where i->>'id'=lower(v_item->>'id');
    if not found or (v_item->>'qty')::numeric<1 or (v_item->>'qty')::numeric>(v_source->>'qty')::numeric then raise exception 'reception_invalid_approved_parts'; end if;
    v_selected:=v_selected||jsonb_build_array(v_source||jsonb_build_object('qty',(v_item->>'qty')::integer));
   end loop;
   if exists(select 1 from jsonb_array_elements(v_selected) i group by i->>'id' having count(*)>1) then raise exception 'reception_invalid_approved_parts'; end if;
   insert into public.workshop_reception_approvals(rc_no,quotation_id,reference,approval_date,approved_amount,approved_parts,estimate_snapshot,parts_snapshot,identity_snapshot,actor_id,reason)
    values(v_rc.rc_no,v_link.id,trim(p_command->>'reference'),v_date,(p_command->>'approved_amount')::numeric,v_selected,v_link.snapshot,v_draft,public.zukait_reception_identity(v_rc.details,v_rc.insurance_id),p_actor_id,v_reason) returning * into v_approval;
   update public.workshop_receptions set approval_status='APPROVED' where rc_no=v_rc.rc_no;
   v_before:=jsonb_build_object('approval_status',v_rc.approval_status);
   v_result:=jsonb_build_object('approval',to_jsonb(v_approval)-'estimate_snapshot'-'parts_snapshot'-'identity_snapshot');
  end if;
 end if;
 update public.workshop_receptions set revision=revision+1,updated_by=p_actor_id,updated_at=now() where rc_no=v_rc.rc_no returning * into v_rc;
 insert into public.workshop_reception_audit(rc_no,operation,actor_id,before_data,after_data,reason)
  values(v_rc.rc_no,v_op,p_actor_id,v_before,case when v_op='LINK_ESTIMATE' then to_jsonb(v_link) when v_op='RECORD_APPROVAL' then to_jsonb(v_approval) else jsonb_build_object('approval_status','WAITING') end,v_reason);
 v_result:=coalesce(v_result,'{}')||jsonb_build_object('ok',true,'record',to_jsonb(v_rc));
 insert into public.workshop_reception_commands(request_id,actor_id,command,result) values(v_request,p_actor_id,p_command,v_result);
 return v_result;
end; $$;
revoke all on function public.zukait_reception_command(text,jsonb) from public,anon,authenticated;
grant execute on function public.zukait_reception_command(text,jsonb) to service_role;
commit;
