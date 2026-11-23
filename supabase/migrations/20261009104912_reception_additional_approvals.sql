begin;
-- Pending Phase 2 only; apply after all five prior pending migrations.
create table public.workshop_reception_additional_requests (
 id uuid primary key,
 rc_no text not null references public.workshop_receptions(rc_no),
 items jsonb not null check(jsonb_typeof(items)='array'),
 quotation_id uuid unique references public.workshop_reception_estimates(id),
 status text not null default 'DRAFT' check(status in ('DRAFT','APPROVED')),
 updated_by text not null references public.staff_credentials(user_id),
 created_at timestamptz not null default now(),updated_at timestamptz not null default now(),
 unique(id,rc_no)
);
create unique index reception_one_additional_draft on public.workshop_reception_additional_requests(rc_no) where status='DRAFT';
create index reception_additional_requests_rc on public.workshop_reception_additional_requests(rc_no,created_at desc);
create table public.workshop_reception_additional_approvals (
 id uuid primary key default gen_random_uuid(),
 rc_no text not null references public.workshop_receptions(rc_no),
 request_id uuid not null unique,
 quotation_id uuid not null unique references public.workshop_reception_estimates(id),
 reference text not null,approval_date date not null,
 approved_amount numeric(12,3) not null check(approved_amount>=0),
 approved_parts jsonb not null,parts_snapshot jsonb not null,estimate_snapshot jsonb not null,identity_snapshot jsonb not null,
 actor_id text not null references public.staff_credentials(user_id),reason text not null,
 recorded_at timestamptz not null default now(),
 foreign key(request_id,rc_no) references public.workshop_reception_additional_requests(id,rc_no)
);
create index reception_additional_approvals_rc on public.workshop_reception_additional_approvals(rc_no,recorded_at desc);
create table public.workshop_reception_additional_transfers (
 approval_id uuid not null references public.workshop_reception_additional_approvals(id),
 source_item_id uuid not null,part_id text not null unique,
 list_no text not null references public.workshop_v2_spare_part_list_numbers(list_no),
 qty integer not null check(qty>0),actor_id text not null references public.staff_credentials(user_id),
 transferred_at timestamptz not null default now(),primary key(approval_id,source_item_id)
);
alter table public.workshop_reception_additional_requests enable row level security;
alter table public.workshop_reception_additional_approvals enable row level security;
alter table public.workshop_reception_additional_transfers enable row level security;
revoke all on public.workshop_reception_additional_requests,public.workshop_reception_additional_approvals,
 public.workshop_reception_additional_transfers from public,anon,authenticated,service_role;
grant select,insert,update on public.workshop_reception_additional_requests to service_role;
grant select,insert on public.workshop_reception_additional_approvals,public.workshop_reception_additional_transfers to service_role;

create function public.zukait_reception_open_job(j jsonb)
returns boolean language sql immutable security invoker set search_path=public as $$
 select j is not null and upper(coalesce(j->>'jobType',''))='INSURANCE'
 and lower(coalesce(j->>'delivered','')) not in ('true','1')
 and lower(coalesce(j->>'cancelled','')) not in ('true','1')
 and lower(coalesce(j->>'deleted','')) not in ('true','1')
 and upper(coalesce(j->>'status','')) not in ('CLOSED','CANCELLED','CANCELED','ARCHIVED','DELIVERED','DELETED')
 and upper(coalesce(j->>'workflowStage','')) not in ('CLOSED','CANCELLED','CANCELED','ARCHIVED','DELIVERED','DELETED');
$$;
create function public.zukait_reception_normalize_parts(p_items jsonb)
returns jsonb language plpgsql immutable security invoker set search_path=public,pg_temp as $$
declare v_items jsonb;v_item jsonb;v_normalized jsonb:='[]';
begin
  v_items:=p_items;
  if jsonb_typeof(v_items) is distinct from 'array' then raise exception 'reception_invalid_parts'; end if;
  if jsonb_array_length(v_items)>200 or length(v_items::text)>18000 then raise exception 'reception_invalid_parts'; end if;
  for v_item in select value from jsonb_array_elements(v_items) loop
    if jsonb_typeof(v_item)<>'object' then raise exception 'reception_invalid_parts'; end if;
    if exists(select 1 from jsonb_object_keys(v_item) k where k not in ('id','name','part_no','qty')) then raise exception 'reception_invalid_parts'; end if;
    if jsonb_typeof(v_item->'id') is distinct from 'string' or coalesce(v_item->>'id','') !~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
       or jsonb_typeof(v_item->'name') is distinct from 'string' or length(trim(regexp_replace(coalesce(v_item->>'name',''),'\s+',' ','g'))) not between 1 and 200
       or (v_item ? 'part_no' and (jsonb_typeof(v_item->'part_no')<>'string' or length(v_item->>'part_no')>100))
       or jsonb_typeof(v_item->'qty') is distinct from 'number' or coalesce(v_item->>'qty','') !~ '^[0-9]+$' then raise exception 'reception_invalid_parts'; end if;
    if (v_item->>'qty')::numeric not between 1 and 100000 then raise exception 'reception_invalid_parts'; end if;
    v_normalized:=v_normalized||jsonb_build_array(jsonb_build_object('id',lower(v_item->>'id'),'name',trim(regexp_replace(v_item->>'name','\s+',' ','g')),'part_no',trim(regexp_replace(coalesce(v_item->>'part_no',''),'\s+',' ','g')),'qty',(v_item->>'qty')::integer));
  end loop;
  if exists(select 1 from jsonb_array_elements(v_normalized) i group by i->>'id' having count(*)>1)
    or exists(select 1 from jsonb_array_elements(v_normalized) i group by lower(regexp_replace(i->>'name','\s+',' ','g')),lower(regexp_replace(i->>'part_no','\s+',' ','g')) having count(*)>1) then raise exception 'reception_duplicate_parts'; end if;
  return v_normalized;
end; $$;

alter function public.zukait_reception_command(text,jsonb) rename to zukait_reception_vehicle_command;
create function public.zukait_reception_command(p_actor_id text,p_command jsonb)
returns jsonb language plpgsql security invoker set search_path=public,pg_temp as $$
declare
 op text:=p_command->>'operation';role_name text;rc public.workshop_receptions;round public.workshop_reception_additional_requests;
 cached public.workshop_reception_commands;approval public.workshop_reception_additional_approvals;
 request uuid;round_id uuid;result jsonb;data jsonb;j jsonb;items jsonb;selected jsonb:='[]';item jsonb;source jsonb;
 quote jsonb;link public.workshop_reception_estimates;company text;day date;reason text:=trim(coalesce(p_command->>'reason',''));
 list_no text;part_id text;allocated boolean;transfers jsonb:='[]';can_prepare boolean;initial_amount numeric;
begin
 if op not in ('SAVE_ADDITIONAL_REQUEST','LINK_ADDITIONAL_ESTIMATE','APPROVE_ADDITIONAL') or op is null then
  result:=public.zukait_reception_vehicle_command(p_actor_id,p_command);
  if op='GET' then
   select * into rc from public.workshop_receptions where rc_no=p_command->>'rc_no';
   select role into role_name from public.staff_credentials where user_id=p_actor_id and active;
   select e into j from public.workshop_state s,jsonb_array_elements(coalesce(s.data->'jobs','[]')) e where s.id='main' and e->>'no'=rc.job_card;
   can_prepare:=role_name in ('Manager','Supervisor') and rc.outcome is null and rc.job_card is not null and public.zukait_reception_open_job(j);
   select a.approved_amount into initial_amount from public.workshop_reception_audit h join public.workshop_reception_approvals a
    on a.id::text=h.after_data->>'approval_id' and a.rc_no=h.rc_no where h.rc_no=rc.rc_no and h.operation='CREATE_JOB' order by h.id desc limit 1;
   return result||jsonb_build_object('additional',jsonb_build_object('can_prepare',coalesce(can_prepare,false),
    'requests',(select coalesce(jsonb_agg(to_jsonb(d) order by created_at desc),'[]') from (select * from public.workshop_reception_additional_requests where rc_no=rc.rc_no order by created_at desc limit 100) d),
    'approvals',(select coalesce(jsonb_agg(to_jsonb(a)-'estimate_snapshot'-'parts_snapshot'-'identity_snapshot' order by recorded_at desc),'[]') from (select * from public.workshop_reception_additional_approvals where rc_no=rc.rc_no order by recorded_at desc limit 100) a),
    'initial_amount',coalesce(initial_amount,0),'additional_amount',(select coalesce(sum(approved_amount),0) from public.workshop_reception_additional_approvals where rc_no=rc.rc_no),
    'transfers',(select coalesce(jsonb_agg(to_jsonb(t) order by transferred_at),'[]') from public.workshop_reception_additional_transfers t join public.workshop_reception_additional_approvals a on a.id=t.approval_id where a.rc_no=rc.rc_no)));
  end if;
  return result;
 end if;
 select role into role_name from public.staff_credentials where user_id=p_actor_id and active;
 if role_name is null or role_name not in ('Manager','Supervisor') then raise exception 'reception_additional_forbidden';end if;
 if length(p_command::text)>24000 or exists(select 1 from jsonb_object_keys(p_command) k where k not in
  ('operation','rc_no','expected_revision','request_id','round_id','items','reason','estimate_no','quotation_id','reference','approval_date','approved_amount','approved_parts')) then raise exception 'reception_invalid_fields';end if;
 if coalesce(p_command->>'request_id','') !~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' then raise exception 'reception_request_required';end if;
 request:=(p_command->>'request_id')::uuid;
 perform pg_advisory_xact_lock(hashtextextended(request::text,0));
 select * into cached from public.workshop_reception_commands where request_id=request;
 if found then
  if cached.actor_id<>p_actor_id or cached.command<>p_command then raise exception 'reception_request_conflict';end if;
  return cached.result||'{"duplicate":true}'::jsonb;
 end if;
 if coalesce(p_command->>'round_id','') !~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' then raise exception 'reception_invalid_additional_request';end if;
 round_id:=(p_command->>'round_id')::uuid;
 if jsonb_typeof(p_command->'reason') is distinct from 'string' or length(reason) not between 1 and 2000 then raise exception 'reception_reason_required';end if;
 select * into rc from public.workshop_receptions where rc_no=p_command->>'rc_no' for update;
 if not found then raise exception 'reception_not_found';end if;
 if coalesce(p_command->>'expected_revision','') !~ '^[0-9]+$' or (p_command->>'expected_revision')::numeric<>rc.revision then raise exception 'reception_stale_revision';end if;
 if rc.outcome is not null then raise exception 'reception_case_closed';end if;
 if rc.job_card is null then raise exception 'reception_additional_job_required';end if;
 -- RC -> shared state -> request -> quotation -> normal PL/events/projections.
 select s.data into data from public.workshop_state s where id='main' for update;
 if not found then raise exception 'reception_workshop_unavailable';end if;
 if (select count(*) from jsonb_array_elements(coalesce(data->'jobs','[]')) e where e->>'no'=rc.job_card)<>1 then raise exception 'reception_linked_job_required';end if;
 select e into j from jsonb_array_elements(data->'jobs') e where e->>'no'=rc.job_card;
 if not public.zukait_reception_open_job(j) or j->>'receptionNo' is distinct from rc.rc_no then raise exception 'reception_additional_job_closed';end if;
 select * into round from public.workshop_reception_additional_requests where id=round_id for update;
 if found and round.rc_no<>rc.rc_no then raise exception 'reception_invalid_additional_request';end if;
 if found and round.status<>'DRAFT' then raise exception 'reception_additional_already_approved';end if;
 if op='SAVE_ADDITIONAL_REQUEST' then
  items:=public.zukait_reception_normalize_parts(p_command->'items');
  if exists(select 1 from public.workshop_reception_additional_requests where rc_no=rc.rc_no and status='DRAFT' and id<>round_id) then raise exception 'reception_additional_draft_exists';end if;
  if exists(select 1 from jsonb_array_elements(items) e join public.workshop_reception_additional_requests d on d.rc_no=rc.rc_no and d.id<>round_id,
   jsonb_array_elements(d.items) x where x->>'id'=e->>'id') then raise exception 'reception_additional_source_reused';end if;
  insert into public.workshop_reception_additional_requests(id,rc_no,items,updated_by) values(round_id,rc.rc_no,items,p_actor_id)
   on conflict(id) do update set quotation_id=case when workshop_reception_additional_requests.items is distinct from excluded.items then null else workshop_reception_additional_requests.quotation_id end,items=excluded.items,updated_by=excluded.updated_by,updated_at=now()
   where workshop_reception_additional_requests.rc_no=excluded.rc_no and workshop_reception_additional_requests.status='DRAFT';
  if not found then raise exception 'reception_invalid_additional_request';end if;
  result:=jsonb_build_object('round_id',round_id);
 else
  if round.id is null then raise exception 'reception_additional_request_not_found';end if;
  if op='LINK_ADDITIONAL_ESTIMATE' then
  if (select count(*) from jsonb_array_elements(coalesce(data->'estimates','[]')) e where lower(e->>'estimateNo')=lower(trim(p_command->>'estimate_no')))<>1 then raise exception 'reception_estimate_not_synced';end if;
  select e into quote from jsonb_array_elements(data->'estimates') e where lower(e->>'estimateNo')=lower(trim(p_command->>'estimate_no'));
  if not exists(select 1 from public.workshop_v2_estimate_numbers where client_key=quote->>'id' and estimate_no=quote->>'estimateNo') then raise exception 'reception_estimate_not_official';end if;
  select name into company from public.workshop_insurance_companies where id=rc.insurance_id;
  if coalesce(quote->>'jobCard','') not in ('',rc.job_card) or coalesce(quote->>'receptionNo',rc.rc_no)<>rc.rc_no
   or (quote ? 'receptionAdditionalRequestId' and quote->>'receptionAdditionalRequestId'<>round_id::text)
   or (quote ? 'insuranceCompany' and quote->>'insuranceCompany'<>company)
   or lower(trim(regexp_replace(coalesce(quote->>'makeModel',''),'\s+',' ','g')))<>lower(concat_ws(' ',rc.details->>'make',rc.details->>'model'))
   or upper(trim(coalesce(quote->>'registration','')))<>coalesce(rc.details->>'registration','')
   or upper(trim(coalesce(quote->>'vin','')))<>coalesce(rc.details->>'vin','')
   or trim(coalesce(quote->>'year',''))<>coalesce(rc.details->>'year','')
   or trim(coalesce(quote->>'customerName',''))<>coalesce(rc.details->>'customer','')
   or trim(coalesce(quote->>'mobile',''))<>coalesce(rc.details->>'contact','')
   or trim(coalesce(quote->>'claimNo',''))<>coalesce(rc.details->>'claim','') then raise exception 'reception_estimate_vehicle_mismatch';end if;
  select * into link from public.workshop_reception_estimates where estimate_id=quote->>'id' for update;
  if found and link.rc_no<>rc.rc_no then raise exception 'reception_estimate_already_linked';end if;
  if exists(select 1 from public.workshop_reception_approvals where quotation_id=link.id)
   or exists(select 1 from public.workshop_reception_additional_approvals where quotation_id=link.id) then raise exception 'reception_additional_quote_used';end if;
  insert into public.workshop_reception_estimates(rc_no,estimate_id,estimate_no,snapshot,identity_snapshot,linked_by)
   values(rc.rc_no,quote->>'id',quote->>'estimateNo',quote,public.zukait_reception_identity(rc.details,rc.insurance_id),p_actor_id)
   on conflict(estimate_id) do update set snapshot=excluded.snapshot,identity_snapshot=excluded.identity_snapshot,linked_by=excluded.linked_by,linked_at=now()
   where workshop_reception_estimates.rc_no=excluded.rc_no returning * into link;
  if not found then raise exception 'reception_estimate_already_linked';end if;
  update public.workshop_reception_additional_requests set quotation_id=link.id,updated_by=p_actor_id,updated_at=now() where id=round_id;
  result:=jsonb_build_object('quotation',to_jsonb(link)-'snapshot');
  else
   if coalesce(p_command->>'quotation_id','') !~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' or round.quotation_id is null or round.quotation_id::text<>lower(p_command->>'quotation_id') then raise exception 'reception_estimate_not_linked';end if;
   select * into link from public.workshop_reception_estimates where id=round.quotation_id and rc_no=rc.rc_no for update;
   if not found then raise exception 'reception_estimate_not_linked';end if;
   if link.identity_snapshot<>public.zukait_reception_identity(rc.details,rc.insurance_id) then raise exception 'reception_estimate_vehicle_mismatch';end if;
   if (select count(*) from jsonb_array_elements(coalesce(data->'estimates','[]')) e where e->>'id'=link.estimate_id)<>1
    or not exists(select 1 from jsonb_array_elements(coalesce(data->'estimates','[]')) e where e=link.snapshot) then raise exception 'reception_estimate_changed';end if;
   quote:=link.snapshot;
   select name into company from public.workshop_insurance_companies where id=rc.insurance_id;
  if jsonb_typeof(p_command->'reference') is distinct from 'string' or length(trim(coalesce(p_command->>'reference',''))) not between 1 and 200
   or coalesce(p_command->>'approved_amount','') !~ '^[0-9]{1,9}([.][0-9]{1,3})?$'
   or coalesce(p_command->>'approval_date','') !~ '^[0-9]{4}-[0-9]{2}-[0-9]{2}$' then raise exception 'reception_invalid_approval';end if;
  begin day:=(p_command->>'approval_date')::date;exception when datetime_field_overflow or invalid_datetime_format then raise exception 'reception_invalid_approval';end;
  if day>(now() at time zone 'Asia/Muscat')::date then raise exception 'reception_invalid_approval';end if;
  if jsonb_typeof(p_command->'approved_parts') is distinct from 'array' or jsonb_array_length(p_command->'approved_parts')>200 then raise exception 'reception_invalid_approved_parts';end if;
  for item in select value from jsonb_array_elements(p_command->'approved_parts') loop
   if jsonb_typeof(item)<>'object' or exists(select 1 from jsonb_object_keys(item) k where k not in ('id','qty'))
    or jsonb_typeof(item->'id') is distinct from 'string' or jsonb_typeof(item->'qty') is distinct from 'number'
    or coalesce(item->>'qty','') !~ '^[0-9]+$' then raise exception 'reception_invalid_approved_parts';end if;
   select e into source from jsonb_array_elements(round.items) e where e->>'id'=lower(item->>'id');
   if not found or (item->>'qty')::numeric<1 or (item->>'qty')::numeric>(source->>'qty')::numeric then raise exception 'reception_invalid_approved_parts';end if;
   selected:=selected||jsonb_build_array(source||jsonb_build_object('qty',(item->>'qty')::integer));
  end loop;
  if exists(select 1 from jsonb_array_elements(selected) e group by e->>'id' having count(*)>1) then raise exception 'reception_invalid_approved_parts';end if;
  insert into public.workshop_reception_additional_approvals(rc_no,request_id,quotation_id,reference,approval_date,approved_amount,approved_parts,parts_snapshot,estimate_snapshot,identity_snapshot,actor_id,reason)
   values(rc.rc_no,round_id,link.id,trim(p_command->>'reference'),day,(p_command->>'approved_amount')::numeric,selected,round.items,quote,public.zukait_reception_identity(rc.details,rc.insurance_id),p_actor_id,reason) returning * into approval;
  if jsonb_array_length(selected)>0 then
   select exists(select 1 from public.workshop_v2_events where event_type='SPARE_PART_LIST_CREATED' and payload->>'jobCard'=rc.job_card) into allocated;
   select a.list_no into list_no from public.zukait_v2_allocate_spare_part_list(rc.job_card,p_actor_id,'rc-additional-'||rc.rc_no) a;
   if list_no is null then raise exception 'reception_parts_allocation_failed';end if;
   if not allocated then
    perform public.zukait_v2_commit_event('rc-add-list-'||request::text,list_no,p_actor_id,'reception-server','SPARE_PART_LIST_CREATED',null,1,
     jsonb_build_object('jobCard',rc.job_card,'partId',list_no,'listNo',list_no,'vehicle',j->>'vehicle','registration',j->>'reg','model',j->>'model','year',j->>'year','customer',company,'targetRole','Purchaser'));
   end if;
   for item in select value from jsonb_array_elements(selected) loop
    part_id:='rc-add-part-'||round_id::text||'-'||(item->>'id');
    begin
     perform public.zukait_v2_commit_event('rc-add-item-'||request::text||'-'||(item->>'id'),part_id,p_actor_id,'reception-server','SPARE_PART_LISTED',null,0,
      jsonb_build_object('jobCard',rc.job_card,'partId',part_id,'listNo',list_no,'name',item->>'name','partNo',coalesce(item->>'part_no',''),'qty',(item->>'qty')::integer,'targetRole','Purchaser'));
    exception when others then
     if sqlerrm='duplicate_active_spare_part' then raise exception 'reception_additional_duplicate_active_part';end if;
     raise;
    end;
    insert into public.workshop_reception_additional_transfers(approval_id,source_item_id,part_id,list_no,qty,actor_id)
     values(approval.id,(item->>'id')::uuid,part_id,list_no,(item->>'qty')::integer,p_actor_id);
    transfers:=transfers||jsonb_build_array(jsonb_build_object('source_item_id',item->>'id','part_id',part_id,'qty',item->'qty','list_no',list_no));
   end loop;
  end if;
  update public.workshop_reception_additional_requests set status='APPROVED',updated_by=p_actor_id,updated_at=now() where id=round_id;
  result:=jsonb_build_object('approval',to_jsonb(approval)-'estimate_snapshot'-'parts_snapshot'-'identity_snapshot','parts',transfers);
  end if;
 end if;
 update public.workshop_receptions set revision=revision+1,updated_by=p_actor_id,updated_at=now() where rc_no=rc.rc_no returning * into rc;
 insert into public.workshop_reception_audit(rc_no,operation,actor_id,before_data,after_data,reason)
  values(rc.rc_no,op,p_actor_id,case when round.id is null then null else to_jsonb(round) end,
   case when op='SAVE_ADDITIONAL_REQUEST' then jsonb_build_object('round_id',round_id,'items',items) when op='LINK_ADDITIONAL_ESTIMATE' then to_jsonb(link) else to_jsonb(approval)||jsonb_build_object('transfers',transfers) end,reason);
 result:=result||jsonb_build_object('ok',true,'record',to_jsonb(rc));
 insert into public.workshop_reception_commands(request_id,actor_id,command,result) values(request,p_actor_id,p_command,result);
 return result;
end; $$;
revoke all on function public.zukait_reception_command(text,jsonb),public.zukait_reception_open_job(jsonb),public.zukait_reception_normalize_parts(jsonb) from public,anon,authenticated;
grant execute on function public.zukait_reception_command(text,jsonb),public.zukait_reception_open_job(jsonb),public.zukait_reception_normalize_parts(jsonb) to service_role;
commit;
