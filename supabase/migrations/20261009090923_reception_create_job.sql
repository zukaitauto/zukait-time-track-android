begin;
create table public.workshop_reception_part_transfers (
 rc_no text not null references public.workshop_receptions(rc_no),
 source_item_id uuid not null,
 approval_id bigint not null references public.workshop_reception_approvals(id),
 part_id text not null unique,
 list_no text not null references public.workshop_v2_spare_part_list_numbers(list_no),
 transferred_at timestamptz not null default now(),
 actor_id text not null references public.staff_credentials(user_id),
 primary key(rc_no,source_item_id)
);
alter table public.workshop_reception_part_transfers enable row level security;
revoke all on public.workshop_reception_part_transfers from public,anon,authenticated,service_role;
grant select,insert on public.workshop_reception_part_transfers to service_role;

alter function public.zukait_reception_command(text,jsonb) rename to zukait_reception_approval_command;
create function public.zukait_reception_command(p_actor_id text,p_command jsonb)
returns jsonb language plpgsql security invoker set search_path=public,pg_temp as $$
declare
 op text:=p_command->>'operation'; role_name text; request uuid;
 cached public.workshop_reception_commands%rowtype;
 rc public.workshop_receptions%rowtype; approval public.workshop_reception_approvals%rowtype;
 snapshot public.workshop_state%rowtype;
 result jsonb; job_no text:=upper(trim(coalesce(p_command->>'job_card','')));
 reason text:=trim(coalesce(p_command->>'reason','')); j jsonb; item jsonb;
 event_id text; list_no text; part_id text; company text; parts jsonb:='[]';
begin
 if op is distinct from 'CREATE_JOB' then
  result:=public.zukait_reception_approval_command(p_actor_id,p_command);
  if op='GET' then
   select role into role_name from public.staff_credentials where user_id=p_actor_id and active;
   return result||jsonb_build_object('job_creation',jsonb_build_object(
    'can_create',role_name in ('Manager','Supervisor') and result->'record'->>'job_card' is null
       and result->'record'->>'outcome' is null and coalesce((result->'insurance'->>'approval_valid')::boolean,false),
    'transfers',(select coalesce(jsonb_agg(to_jsonb(t) order by source_item_id),'[]') from public.workshop_reception_part_transfers t where t.rc_no=p_command->>'rc_no')));
  end if;
  return result;
 end if;
 select role into role_name from public.staff_credentials where user_id=p_actor_id and active;
 if role_name is null or role_name not in ('Manager','Supervisor') then raise exception 'reception_job_forbidden'; end if;
 if exists(select 1 from jsonb_object_keys(p_command) k where k not in ('operation','rc_no','expected_revision','request_id','job_card','reason')) then raise exception 'reception_invalid_fields'; end if;
 if coalesce(p_command->>'request_id','') !~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' then raise exception 'reception_request_required'; end if;
 request:=(p_command->>'request_id')::uuid;
 perform pg_advisory_xact_lock(hashtextextended(request::text,0));
 select * into cached from public.workshop_reception_commands where request_id=request;
 if found then
  if cached.actor_id<>p_actor_id or cached.command<>p_command then raise exception 'reception_request_conflict'; end if;
  return cached.result||'{"duplicate":true}'::jsonb;
 end if;
 if jsonb_typeof(p_command->'job_card') is distinct from 'string' or job_no !~ '^[A-Z0-9][A-Z0-9/-]{0,39}$' or job_no='ID001' then raise exception 'reception_invalid_job_number'; end if;
 if jsonb_typeof(p_command->'reason') is distinct from 'string' or length(reason) not between 1 and 2000 then raise exception 'reception_reason_required'; end if;
 select * into rc from public.workshop_receptions where rc_no=p_command->>'rc_no' for update;
 if not found then raise exception 'reception_not_found'; end if;
 if coalesce(p_command->>'expected_revision','') !~ '^[0-9]+$' or (p_command->>'expected_revision')::numeric<>rc.revision then raise exception 'reception_stale_revision'; end if;
 if rc.outcome is not null then raise exception 'reception_case_closed'; end if;
 if rc.job_card is not null then raise exception 'reception_job_already_created'; end if;
 if rc.approval_status<>'APPROVED' then raise exception 'reception_not_approved'; end if;
 -- RC -> shared state -> projections. This serializes creation with approval,
 -- vehicle/preliminary changes and workshop snapshot commits.
 perform pg_advisory_xact_lock(hashtextextended('rc-job:'||job_no,0));
 select * into snapshot from public.workshop_state where id='main' for update;
 if not found then raise exception 'reception_workshop_unavailable'; end if;
 if exists(select 1 from jsonb_array_elements(coalesce(snapshot.data->'jobs','[]')) x where upper(x->>'no')=job_no)
 or exists(select 1 from public.workshop_v2_jobcards where upper(job_card)=job_no)
 or exists(select 1 from public.workshop_v2_spare_part_state where upper(job_card)=job_no)
 or exists(select 1 from public.workshop_v2_events where event_type like 'SPARE_PART%' and upper(payload->>'jobCard')=job_no) then raise exception 'reception_job_number_exists'; end if;
 -- Temporarily link inside this transaction so the shared creation guard can
 -- validate the approval. Any failure below rolls back the link and all writes.
 update public.workshop_receptions set job_card=job_no where rc_no=rc.rc_no;
 if not public.zukait_reception_job_approval_valid(job_no,rc.rc_no,snapshot.data) then raise exception 'reception_approval_changed'; end if;
 select * into approval from public.workshop_reception_approvals where rc_no=rc.rc_no order by id desc limit 1;
 select name into company from public.workshop_insurance_companies where id=rc.insurance_id;
 event_id:='rc-job-'||request::text;
 j:=jsonb_build_object('no',job_no,'vehicle',trim((rc.details->>'make')||' '||(rc.details->>'model')),
  'make',rc.details->>'make','model',rc.details->>'model','brand',rc.details->>'make',
  'year',coalesce(rc.details->>'year',''),'reg',coalesce(rc.details->>'registration',''),'vin',coalesce(rc.details->>'vin',''),
  'customerName',coalesce(rc.details->>'customer',''),'mobile',coalesce(rc.details->>'contact',''),'claimNo',coalesce(rc.details->>'claim',''),
  'jobType','INSURANCE','insuranceCompany',company,'status','Open','workflowStage','CREATED',
  'receptionNo',rc.rc_no,'insuranceApprovalId',approval.id,'createdBy',p_actor_id,
  'createdAt',floor(extract(epoch from now())*1000),'v2EventId',event_id,'v2Created',true);
 insert into public.workshop_state_history(revision,data,updated_at,updated_by)
 values(snapshot.revision,snapshot.data,snapshot.updated_at,snapshot.updated_by) on conflict(revision) do nothing;
 update public.workshop_state set data=jsonb_set(snapshot.data,'{jobs}',coalesce(snapshot.data->'jobs','[]')||jsonb_build_array(j)),
  revision=snapshot.revision+1,updated_at=now(),updated_by=p_actor_id where id='main';
 -- The established state trigger refreshes live employees from unchanged work
 -- sessions; never call the snapshot commit RPC with an empty live array.
 perform public.zukait_v2_commit_event(event_id,job_no,p_actor_id,'reception-server','JOB_CREATED',null,0,
  jsonb_build_object('jobCard',job_no,'registration',j->>'reg','vehicleMake',j->>'make','vehicleModel',j->>'model','vehicleYear',j->>'year',
   'workflowStage','CREATED','status','OPEN','jobType','INSURANCE','insuranceCompany',company,'receptionNo',rc.rc_no));
 if jsonb_array_length(approval.approved_parts)>0 then
  select a.list_no into list_no from public.zukait_v2_allocate_spare_part_list(job_no,p_actor_id,'rc-parts-'||rc.rc_no) a;
  if list_no is null then raise exception 'reception_parts_allocation_failed'; end if;
  perform public.zukait_v2_commit_event('rc-list-'||request::text,list_no,p_actor_id,'reception-server','SPARE_PART_LIST_CREATED',null,1,
   jsonb_build_object('jobCard',job_no,'partId',list_no,'listNo',list_no,'vehicle',j->>'vehicle','registration',j->>'reg',
    'model',j->>'model','year',j->>'year','customer',j->>'customerName','targetRole','Purchaser'));
  for item in select value from jsonb_array_elements(approval.approved_parts) loop
   part_id:='rc-part-'||rc.rc_no||'-'||(item->>'id');
   perform public.zukait_v2_commit_event('rc-item-'||request::text||'-'||(item->>'id'),part_id,p_actor_id,'reception-server','SPARE_PART_LISTED',null,0,
    jsonb_build_object('jobCard',job_no,'partId',part_id,'listNo',list_no,'name',item->>'name','partNo',coalesce(item->>'part_no',''),
     'qty',(item->>'qty')::integer,'targetRole','Purchaser'));
   insert into public.workshop_reception_part_transfers(rc_no,source_item_id,approval_id,part_id,list_no,actor_id)
    values(rc.rc_no,(item->>'id')::uuid,approval.id,part_id,list_no,p_actor_id);
   parts:=parts||jsonb_build_array(jsonb_build_object('source_item_id',item->>'id','part_id',part_id,'qty',item->'qty','list_no',list_no));
  end loop;
 end if;
 update public.workshop_receptions set revision=revision+1,updated_by=p_actor_id,updated_at=now() where rc_no=rc.rc_no returning * into rc;
 insert into public.workshop_reception_audit(rc_no,operation,actor_id,before_data,after_data,reason)
 values(rc.rc_no,op,p_actor_id,jsonb_build_object('job_card',null),jsonb_build_object('job_card',job_no,'approval_id',approval.id,'parts',parts),reason);
 result:=jsonb_build_object('ok',true,'record',to_jsonb(rc),'job',j,'parts',parts,'server_revision',snapshot.revision+1);
 insert into public.workshop_reception_commands(request_id,actor_id,command,result) values(request,p_actor_id,p_command,result);
 return result;
end; $$;
revoke all on function public.zukait_reception_command(text,jsonb) from public,anon,authenticated;
grant execute on function public.zukait_reception_command(text,jsonb) to service_role;
commit;
