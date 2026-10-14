CREATE OR REPLACE FUNCTION public.zukait_reception_estimate_command(p_actor_id text, p_command jsonb)
 RETURNS jsonb
 LANGUAGE plpgsql
 SET search_path TO 'public', 'pg_temp'
AS $function$
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
  if exists(select 1 from jsonb_array_elements(coalesce(snapshot.data->'estimateDraftDeletes','[]'::jsonb)) d where d->>'estimateId'=p_command->>'client_key') then raise exception 'reception_estimate_draft_deleted'; end if;
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
end $function$
