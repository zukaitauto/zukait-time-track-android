-- The journal advisory transaction lock serializes corrections. Immutable source
-- rows need SELECT only; FOR UPDATE would require prohibited UPDATE grants.
begin;
create or replace function public.zukait_accountant_post(p_actor_id text,p_request_id uuid,p_fingerprint text,p_command jsonb) returns jsonb language plpgsql security invoker set search_path=public as $$
declare staff public.staff_credentials%rowtype;receipt public.workshop_accountant_commands%rowtype;source public.workshop_accounting_entries%rowtype; snap public.workshop_state%rowtype;
 op text:=p_command->>'operation';entry_id uuid:=p_request_id;result jsonb;finance_rev bigint;cmd_job text:=nullif(upper(trim(p_command->>'job_card')),'');amt numeric;old_n numeric;new_n numeric;txdate date;
begin
 perform pg_advisory_xact_lock(hashtext('zukait_accountant_journal'));
 select * into staff from public.staff_credentials where user_id=p_actor_id and active for share;
 if not found or staff.role not in ('Manager','Accountant') or staff.must_change then raise exception 'accountant_forbidden';end if;
 select * into receipt from public.workshop_accountant_commands where request_id=p_request_id;
 if found then if receipt.actor_id<>p_actor_id or receipt.fingerprint<>p_fingerprint then raise exception 'request_conflict';end if;return receipt.result;end if;
 if op not in ('POST','CORRECT','REVERSE','ADJUST_COST','CORRECT_INVOICE') or length(trim(coalesce(p_command->>'reason','')))<3 or length(p_command->>'reason')>2000 then raise exception 'invalid_financial_command';end if;
 select * into snap from public.workshop_state where id='main' for update;
 select coalesce(max(sequence_no),0) into finance_rev from public.workshop_accounting_entries;
 if (p_command->>'expected_finance_revision') is null or (p_command->>'expected_finance_revision')::bigint<>finance_rev or (p_command->>'expected_snapshot_revision') is null or (p_command->>'expected_snapshot_revision')::bigint<>snap.revision then raise exception 'financial_conflict';end if;
 if cmd_job is not null and (cmd_job='ID001' or not exists(select 1 from jsonb_array_elements(coalesce(snap.data->'jobs','[]')) j where upper(j->>'no')=cmd_job and coalesce(j->>'deleted','false')<>'true')) then raise exception 'job_not_found';end if;
 txdate:=(p_command->>'transaction_date')::date;
 if txdate is null or txdate<date '1900-01-01' or txdate>(now() at time zone 'Asia/Muscat')::date then raise exception 'invalid_transaction_date';end if;
 if op in ('CORRECT','REVERSE') then
  select * into source from public.workshop_accounting_entries where id=(p_command->>'entry_id')::uuid;
  if not found or source.kind not in ('CASH_IN','CASH_OUT') or exists(select 1 from public.workshop_accounting_entries where reverses_id=source.id) then raise exception 'entry_not_correctable';end if;
  insert into public.workshop_accounting_entries(id,request_id,actor_id,kind,job_card,transaction_date,reverses_id,old_value,new_value,reason,record_id)
  values(gen_random_uuid(),p_request_id,p_actor_id,'REVERSAL',source.job_card,txdate,source.id,source.amount,0,p_command->>'reason',source.id::text);
 end if;
 if op in ('POST','CORRECT') then
  amt:=(p_command->>'amount')::numeric;
  if amt is null or amt<=0 or amt>1000000 or round(amt,3)<>amt or p_command->>'kind' not in ('CASH_IN','CASH_OUT') or p_command->>'payment_method' not in ('CASH','CARD','BANK','CHEQUE') or length(trim(coalesce(p_command->>'payee','')))=0 or length(coalesce(p_command->>'payee',''))>200 or length(coalesce(p_command->>'reference',''))>200 or length(coalesce(p_command->>'remarks',''))>2000 or length(coalesce(p_command->>'category',''))>100 then raise exception 'invalid_cash_entry';end if;
  if op='CORRECT' and p_command->>'kind'<>source.kind then raise exception 'cash_direction_change_forbidden';end if;
  if p_command->>'kind'='CASH_OUT' and length(trim(coalesce(p_command->>'category','')))=0 then raise exception 'expense_category_required';end if;
  if nullif(trim(p_command->>'reference'),'') is not null and exists(select 1 from public.workshop_accounting_entries e where e.kind=p_command->>'kind' and e.payment_method=p_command->>'payment_method' and lower(e.reference)=lower(trim(p_command->>'reference')) and e.id<>coalesce(source.id,'00000000-0000-0000-0000-000000000000'::uuid) and not exists(select 1 from public.workshop_accounting_entries r where r.reverses_id=e.id)) then raise exception 'duplicate_payment_reference';end if;
  insert into public.workshop_accounting_entries(id,request_id,actor_id,kind,job_card,transaction_date,amount,payment_method,payee,category,reference,remarks,replaces_id,old_value,new_value,reason)
  values(entry_id,p_request_id,p_actor_id,p_command->>'kind',cmd_job,txdate,amt,p_command->>'payment_method',trim(p_command->>'payee'),p_command->>'category',nullif(trim(p_command->>'reference'),''),p_command->>'remarks',source.id,source.amount,amt,p_command->>'reason');
 elsif op='ADJUST_COST' then
  old_n:=(p_command->>'old_value')::numeric;new_n:=(p_command->>'new_value')::numeric;
  if cmd_job is null or p_command->>'category' not in ('consumables','paint','parts','labour') or old_n is null or new_n is null or old_n<0 or new_n<0 or new_n>1000000 or round(old_n,3)<>old_n or round(new_n,3)<>new_n then raise exception 'invalid_cost_adjustment';end if;
  insert into public.workshop_accounting_entries(id,request_id,actor_id,kind,job_card,transaction_date,category,old_value,new_value,record_id,reason) values(entry_id,p_request_id,p_actor_id,'COST_ADJUSTMENT',cmd_job,txdate,p_command->>'category',old_n,new_n,cmd_job||':'||(p_command->>'category'),p_command->>'reason');
 elsif op='CORRECT_INVOICE' then
  if cmd_job is null then raise exception 'job_required';end if;new_n:=(p_command->>'new_value')::numeric;
  if new_n is null or new_n<0 or new_n>1000000 or round(new_n,3)<>new_n then raise exception 'invalid_invoice_amount';end if;
  -- Accountant is allowed only this financial mutation, never QC, delivery or work edits.
  declare j jsonb;idx integer;audit jsonb;begin
   select value,ordinality::integer-1 into j,idx from jsonb_array_elements(snap.data->'jobs') with ordinality where upper(value->>'no')=cmd_job;
   if j->>'finalInvoiceAmount' is null or nullif(j->>'invoiceDate','') is null then raise exception 'verified_invoice_required';end if;
   old_n:=(j->>'finalInvoiceAmount')::numeric;
   if old_n<>(p_command->>'old_value')::numeric then raise exception 'financial_conflict';end if;
   audit:=jsonb_build_object('operation','ACCOUNTANT_INVOICE_CORRECTION','by',p_actor_id,'name',staff.display_name,'at',floor(extract(epoch from now())*1000),'from',old_n,'to',new_n,'reason',p_command->>'reason','request_id',p_request_id);
   j:=j||jsonb_build_object('finalInvoiceAmount',new_n,'amount',new_n,'financialAudit',coalesce(j->'financialAudit','[]')||jsonb_build_array(audit),'qcWorkflow',coalesce(j->'qcWorkflow','{}')||jsonb_build_object('revision',coalesce((j#>>'{qcWorkflow,revision}')::integer,0)+1));
   -- Keep existing invoice-linked insurance LPO amount authoritative; this is not a cash receipt.
   if upper(j->>'jobType')='INSURANCE' and j->'insuranceLpo' is not null and j->'insuranceLpo'<>'null'::jsonb then
    j:=jsonb_set(j,'{insuranceLpo}',(j->'insuranceLpo')||jsonb_build_object('amount',new_n,'revision',coalesce((j#>>'{insuranceLpo,revision}')::integer,0)+1,'history',coalesce(j#>'{insuranceLpo,history}','[]')||jsonb_build_array(audit||jsonb_build_object('source','ACCOUNTANT_INVOICE_CORRECTION','fromAmount',(j#>>'{insuranceLpo,amount}')::numeric,'toAmount',new_n,'fromDate',j#>>'{insuranceLpo,receivedDate}','toDate',j#>>'{insuranceLpo,receivedDate}'))));
   end if;
   update public.workshop_state set data=jsonb_set(snap.data,array['jobs',idx::text],j),revision=revision+1,updated_at=now(),updated_by=p_actor_id where id='main';
  end;
 end if;
 select jsonb_build_object('ok',true,'request_id',p_request_id,'entry_id',case when op in ('POST','CORRECT','ADJUST_COST') then entry_id else null end,'finance_revision',coalesce((select max(sequence_no) from public.workshop_accounting_entries),0),'snapshot_revision',(select revision from public.workshop_state where id='main')) into result;
 insert into public.workshop_accountant_commands values(p_request_id,p_actor_id,p_fingerprint,result,now());return result;
end$$;

commit;
