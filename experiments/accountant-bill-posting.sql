-- Disposable candidate only; not generated/applied production migration.
create schema zukait_bills;
revoke all on schema zukait_bills from public,anon,authenticated;grant usage on schema zukait_bills to service_role;
create table zukait_bills.control(singleton boolean primary key default true check(singleton),enabled boolean not null default false,revision bigint not null default 0 check(revision>=0),period_from date,period_through date,roles jsonb not null default '["Accountant","Manager"]' check(jsonb_typeof(roles)='array'),check(period_from is null or period_through is null or period_from<=period_through));insert into zukait_bills.control default values;
create table zukait_bills.documents(id uuid primary key,supplier_id uuid not null references zukait_suppliers.suppliers(id),reference text not null,invoice_date date not null,invoice_total_mills bigint not null check(invoice_total_mills>0 and invoice_total_mills<=9007199254740991),reviewed_by text not null,reviewed_at timestamptz not null default now(),request_id uuid not null unique references public.workshop_accountant_commands(request_id),unique(supplier_id,reference));
create table zukait_bills.bills(id uuid primary key references zukait_bills.documents(id),supplier_id uuid not null references zukait_suppliers.suppliers(id),transaction_date date not null,due_date date,amount_mills bigint not null check(amount_mills>0 and amount_mills<=9007199254740991),invoice_difference_mills bigint not null check(invoice_difference_mills>=0),supplier_revision bigint not null,workshop_revision bigint not null,revision bigint not null unique,request_id uuid not null unique references public.workshop_accountant_commands(request_id));
create table zukait_bills.sources(source_type text not null check(source_type='PAINT_ORDER'),source_id text not null,bill_id uuid not null references zukait_bills.bills(id),received_cost_mills bigint not null,receipt_digest text not null,primary key(source_type,source_id));
create table zukait_bills.audit(request_id uuid primary key references public.workshop_accountant_commands(request_id),bill_id uuid not null references zukait_bills.bills(id),actor_id text not null,device_id text not null,reason text not null,result jsonb not null,created_at timestamptz not null default now());
create index bills_supplier_page on zukait_bills.bills(supplier_id,id);
alter table zukait_bills.control enable row level security;alter table zukait_bills.documents enable row level security;alter table zukait_bills.bills enable row level security;alter table zukait_bills.sources enable row level security;alter table zukait_bills.audit enable row level security;
revoke all on all tables in schema zukait_bills from public,anon,authenticated,service_role;grant select on all tables in schema zukait_bills to service_role;grant update(revision) on zukait_bills.control to service_role;grant insert on zukait_bills.documents,zukait_bills.bills,zukait_bills.sources,zukait_bills.audit to service_role;
create trigger bill_doc_immutable before update or delete on zukait_bills.documents for each row execute function public.zukait_accountant_immutable();create trigger bill_immutable before update or delete on zukait_bills.bills for each row execute function public.zukait_accountant_immutable();create trigger bill_sources_immutable before update or delete on zukait_bills.sources for each row execute function public.zukait_accountant_immutable();create trigger bill_audit_immutable before update or delete on zukait_bills.audit for each row execute function public.zukait_accountant_immutable();
create trigger bill_doc_no_truncate before truncate on zukait_bills.documents for each statement execute function public.zukait_accountant_immutable();create trigger bill_no_truncate before truncate on zukait_bills.bills for each statement execute function public.zukait_accountant_immutable();create trigger bill_sources_no_truncate before truncate on zukait_bills.sources for each statement execute function public.zukait_accountant_immutable();create trigger bill_audit_no_truncate before truncate on zukait_bills.audit for each statement execute function public.zukait_accountant_immutable();
-- Internal pure helper: writer supplies the locked actual order, never client facts.
create function zukait_bills.paint_receipt(o jsonb) returns jsonb language plpgsql security invoker set search_path=pg_catalog as $$
declare l jsonb;v numeric;cost numeric:=0;received timestamptz;today date:=(now() at time zone 'Asia/Muscat')::date;
begin
 if jsonb_typeof(o) is distinct from 'object' or o->'locked' is distinct from 'true'::jsonb or coalesce(o->>'voided','false')<>'false' or coalesce(o->>'nilPaintPurchase','false')<>'false' or upper(trim(coalesce(o->>'jobCard',''))) in('','ID001') then raise exception 'bill_receipt_review';end if;
 if jsonb_typeof(o->'lines') is distinct from 'array' or jsonb_array_length(o->'lines') not between 1 and 100 then raise exception 'bill_receipt_review';end if;
 if o->'returns' is not null and jsonb_typeof(o->'returns')<>'array' then raise exception 'bill_receipt_review';end if;
 if exists(select 1 from jsonb_array_elements(coalesce(o->'returns','[]')) r where coalesce(r->>'voided','false')<>'true') then raise exception 'bill_return_review';end if;
 if jsonb_typeof(o->'receivedAt')='number' and length(o->>'receivedAt')<=16 and o->>'receivedAt'~'^[0-9]+$' then received:=to_timestamp((o->>'receivedAt')::numeric/1000);
 elsif jsonb_typeof(o->'receivedAt')='string' and length(o->>'receivedAt') between 10 and 40 and o->>'receivedAt'~'^\d{4}-\d{2}-\d{2}T' and o->>'receivedAt'~'(Z|[+-][0-9]{2}:[0-9]{2})$' then received:=(o->>'receivedAt')::timestamptz;
 else raise exception 'bill_receipt_review';end if;
 if received is null or received>now() or (received at time zone 'Asia/Muscat')::date<date '1900-01-01' then raise exception 'bill_receipt_review';end if;
 for l in select value from jsonb_array_elements(o->'lines') loop
  if jsonb_typeof(l)<>'object' then raise exception 'bill_receipt_review';end if;
  if l->>'lineTotal' is not null then
   if length(l->>'lineTotal')>24 or l->>'lineTotal'!~'^(0|[1-9][0-9]*)(\.[0-9]{1,3})?$' then raise exception 'bill_receipt_review';end if;v:=(l->>'lineTotal')::numeric;
  else
   if coalesce(l->>'quantity','')!~'^(0|[1-9][0-9]*)(\.[0-9]{1,6})?$' or length(l->>'quantity')>24 or coalesce(l->>'pricePerLitre','')!~'^(0|[1-9][0-9]*)(\.[0-9]{1,3})?$' or length(l->>'pricePerLitre')>24 or (l->>'quantity')::numeric<=0 then raise exception 'bill_receipt_review';end if;
   v:=round((l->>'quantity')::numeric*(l->>'pricePerLitre')::numeric,3);
  end if;
  if v<0 or v>1000000 then raise exception 'bill_receipt_review';end if;cost:=cost+v*1000;
 end loop;
 if cost<=0 or cost>9007199254740991 then raise exception 'bill_receipt_review';end if;
 return jsonb_build_object('id',o->>'id','receivedCostMills',cost::bigint,'receiptDate',(received at time zone 'Asia/Muscat')::date,'receiptDigest',md5(o::text));
end $$;
revoke all on function zukait_bills.paint_receipt(jsonb) from public,anon,authenticated;grant execute on function zukait_bills.paint_receipt(jsonb) to service_role;
create function public.zukait_bill_pipeline(p_actor text,p_hash text,p_kind text,p_request uuid,p_fingerprint text,p_input jsonb) returns jsonb language plpgsql security invoker set search_path=pg_catalog as $$
declare sc zukait_suppliers.control;bc zukait_bills.control;role_value text;receipt public.workshop_accountant_commands;ws jsonb;wv bigint;orders jsonb;source_ids jsonb;entry jsonb;wanted_source text;o jsonb;proof jsonb;proofs jsonb:='[]';source_cost bigint;amount numeric:=0;matches integer;sup uuid;eid uuid;doc_date date;tx_date date;due_date date;today date:=(now() at time zone 'Asia/Muscat')::date;ref text;invoice numeric;rev bigint;result jsonb;rows jsonb;after_id uuid;
begin
 if p_kind='post' then perform pg_advisory_xact_lock(hashtext('zukait_accountant_journal'));end if;
 if p_kind='post' then select * into sc from zukait_suppliers.control where singleton for update;select * into bc from zukait_bills.control where singleton for update;
 else select * into sc from zukait_suppliers.control where singleton for share;select * into bc from zukait_bills.control where singleton for share;end if;
 if not coalesce(sc.enabled and bc.enabled,false) then raise exception 'bill_disabled';end if;
 select role into role_value from public.staff_credentials where user_id=p_actor and active and not must_change for share;
 if role_value is null or role_value not in('Accountant','Manager') or not(sc.roles ? role_value) or not(bc.roles ? role_value) then raise exception 'bill_forbidden';end if;
 if p_hash is null or p_hash!~'^[0-9a-f]{64}$' then raise exception 'invalid_session';end if;
 perform 1 from public.staff_sessions where user_id=p_actor and token_hash=p_hash and revoked_at is null for share;if not found then raise exception 'invalid_session';end if;
 if jsonb_typeof(p_input) is distinct from 'object' or octet_length(p_input::text)>16000 then raise exception 'bill_invalid';end if;
 if p_kind='post' then
  if p_request is null or p_fingerprint is null or p_fingerprint!~'^[0-9a-f]{64}$' then raise exception 'bill_invalid';end if;
  select * into receipt from public.workshop_accountant_commands where request_id=p_request;
  if found then if receipt.actor_id<>p_actor or receipt.fingerprint<>p_fingerprint or receipt.result->>'operation' is distinct from 'BILL_POST' or receipt.result->>'entityId' is distinct from p_input->>'entityId' then raise exception 'request_conflict';end if;return receipt.result||'{"duplicate":true}'::jsonb;end if;
  if exists(select 1 from jsonb_object_keys(p_input) k where k not in('entityId','supplierId','deviceId','reason','expectedSupplierRevision','expectedPayableRevision','expectedWorkshopRevision','invoiceReference','invoiceDate','transactionDate','dueDate','invoiceTotalMills','expectedMaterialMills','sources','invoiceReviewed')) then raise exception 'bill_invalid';end if;
  if p_input->'invoiceReviewed' is distinct from 'true'::jsonb or jsonb_typeof(p_input->'deviceId') is distinct from 'string' or length(p_input->>'deviceId') not between 1 and 128 or p_input->>'deviceId'<>trim(p_input->>'deviceId') or p_input->>'deviceId'~'[[:cntrl:]]' or jsonb_typeof(p_input->'reason') is distinct from 'string' or length(p_input->>'reason') not between 3 and 1000 or p_input->>'reason'<>trim(p_input->>'reason') or p_input->>'reason'~'[[:cntrl:]]' then raise exception 'bill_invalid';end if;
  if coalesce(p_input->>'expectedSupplierRevision','')!~'^[0-9]{1,16}$' or coalesce(p_input->>'expectedPayableRevision','')!~'^[0-9]{1,16}$' or (p_input->>'expectedSupplierRevision')::bigint<>sc.revision or (p_input->>'expectedPayableRevision')::bigint<>bc.revision then raise exception 'bill_revision_conflict';end if;
  eid:=(p_input->>'entityId')::uuid;ref:=upper(trim(p_input->>'invoiceReference'));
  if jsonb_typeof(p_input->'invoiceReference') is distinct from 'string' or length(ref) not between 1 and 200 or ref~'[[:cntrl:]]' or jsonb_typeof(p_input->'invoiceTotalMills') is distinct from 'number' or p_input->>'invoiceTotalMills'!~'^[1-9][0-9]{0,15}$' then raise exception 'bill_invalid';end if;invoice:=(p_input->>'invoiceTotalMills')::numeric;if invoice>9007199254740991 then raise exception 'bill_invalid';end if;
  if coalesce(p_input->>'invoiceDate','')!~'^\d{4}-\d{2}-\d{2}$' or coalesce(p_input->>'transactionDate','')!~'^\d{4}-\d{2}-\d{2}$' then raise exception 'bill_invalid';end if;
  doc_date:=(p_input->>'invoiceDate')::date;tx_date:=(p_input->>'transactionDate')::date;if tx_date>today or doc_date>tx_date or doc_date<date '1900-01-01' then raise exception 'bill_invalid';end if;
  if bc.period_from is null or bc.period_through is null or tx_date not between bc.period_from and bc.period_through then raise exception 'bill_period_review';end if;
  if p_input->>'dueDate' is not null then if p_input->>'dueDate'!~'^\d{4}-\d{2}-\d{2}$' then raise exception 'bill_invalid';end if;due_date:=(p_input->>'dueDate')::date;end if;
  source_ids:=p_input->'sources';
 elsif p_kind='preview' then
  if p_request is not null or p_fingerprint is not null or exists(select 1 from jsonb_object_keys(p_input) k where k not in('supplierId','sources')) then raise exception 'bill_invalid';end if;source_ids:=p_input->'sources';
 elsif p_kind='list' then
  if p_request is not null or p_fingerprint is not null or exists(select 1 from jsonb_object_keys(p_input) k where k not in('supplierId','afterId')) then raise exception 'bill_invalid';end if;sup:=(p_input->>'supplierId')::uuid;after_id:=(p_input->>'afterId')::uuid;
  select coalesce(jsonb_agg(r order by r->>'id'),'[]') into rows from(select jsonb_build_object('id',b.id,'invoiceReference',d.reference,'invoiceDate',d.invoice_date,'transactionDate',b.transaction_date,'dueDate',b.due_date,'amountMills',b.amount_mills,'invoiceDifferenceMills',b.invoice_difference_mills,'scope','CONFIRMED_RECEIVED_MATERIALS_ONLY','paymentStatus','NOT_RECONCILED') r from zukait_bills.bills b join zukait_bills.documents d on d.id=b.id where b.supplier_id=sup and (after_id is null or b.id>after_id) order by b.id limit 51)x;
  return jsonb_build_object('ok',true,'supplierId',sup,'revision',bc.revision,'rows',case when jsonb_array_length(rows)>50 then rows-50 else rows end,'nextAfter',case when jsonb_array_length(rows)>50 then rows->49->>'id' else null end,'totalSupplierOutstandingMills',null);
 else raise exception 'bill_invalid';end if;
 sup:=(p_input->>'supplierId')::uuid;if sup is null or not exists(select 1 from zukait_suppliers.current_suppliers where id=sup and active) then raise exception 'bill_supplier_review';end if;
 if jsonb_typeof(source_ids) is distinct from 'array' or jsonb_array_length(source_ids) not between 1 and 20 then raise exception 'bill_invalid';end if;
 if p_kind='post' then select revision,data into wv,ws from public.workshop_state where id='main' for update;else select revision,data into wv,ws from public.workshop_state where id='main' for share;end if;
 if p_kind='post' and (coalesce(p_input->>'expectedWorkshopRevision','')!~'^[0-9]{1,16}$' or (p_input->>'expectedWorkshopRevision')::bigint<>wv) then raise exception 'bill_revision_conflict';end if;
 orders:=ws->'paintPurchasing'->'orders';if jsonb_typeof(orders) is distinct from 'array' then raise exception 'bill_receipt_review';end if;if jsonb_array_length(orders)>10000 then raise exception 'bill_scope_limit';end if;
 for entry in select value from jsonb_array_elements(source_ids) loop
  if jsonb_typeof(entry)<>'object' or exists(select 1 from jsonb_object_keys(entry) k where k not in('type','id','expectedReceiptDigest')) or entry->>'type' is distinct from 'PAINT_ORDER' or jsonb_typeof(entry->'id') is distinct from 'string' or length(entry->>'id') not between 1 and 128 then raise exception 'bill_source_unsupported';end if;wanted_source:=entry->>'id';
  if exists(select 1 from jsonb_array_elements(proofs) r where r->>'id'=wanted_source) then raise exception 'bill_duplicate_source';end if;
  if not exists(select 1 from zukait_suppliers.source_links where source_type='PAINT_ORDER' and source_id=wanted_source and supplier_id=sup) then raise exception 'bill_supplier_review';end if;
  select count(*),jsonb_agg(value)->0 into matches,o from(select value from jsonb_array_elements(orders) where value->>'id'=wanted_source limit 2)x;if matches<>1 then raise exception 'bill_receipt_review';end if;proof:=zukait_bills.paint_receipt(o);
  if p_kind='post' and (proof->>'receiptDate')::date>tx_date then raise exception 'bill_receipt_review';end if;
  if p_kind='post' and (jsonb_typeof(entry->'expectedReceiptDigest') is distinct from 'string' or entry->>'expectedReceiptDigest' is distinct from proof->>'receiptDigest') then raise exception 'bill_receipt_changed';end if;
  if exists(select 1 from zukait_bills.sources where source_type='PAINT_ORDER' and source_id=wanted_source) then raise exception 'bill_source_already_billed';end if;
  amount:=amount+(proof->>'receivedCostMills')::bigint;proofs:=proofs||jsonb_build_array(proof);
 end loop;
 if amount>9007199254740991 then raise exception 'bill_amount_review';end if;
 if p_kind='preview' then return jsonb_build_object('ok',true,'supplierId',sup,'supplierRevision',sc.revision,'payableRevision',bc.revision,'workshopRevision',wv,'sources',proofs,'receivedMaterialMills',amount::bigint,'scope','CONFIRMED_RECEIVED_MATERIALS_ONLY');end if;
 if coalesce(p_input->>'expectedMaterialMills','')!~'^[1-9][0-9]{0,15}$' or (p_input->>'expectedMaterialMills')::numeric<>amount or amount>invoice then raise exception 'bill_amount_review';end if;
 if exists(select 1 from zukait_bills.documents where supplier_id=sup and reference=ref) then raise exception 'bill_duplicate_invoice';end if;
 rev:=bc.revision+1;result:=jsonb_build_object('ok',true,'operation','BILL_POST','requestId',p_request,'entityId',eid,'revision',rev,'amountMills',amount::bigint,'invoiceDifferenceMills',(invoice-amount)::bigint,'differenceStatus',case when invoice>amount then 'PENDING_NOT_POSTED' else 'NONE' end,'scope','CONFIRMED_RECEIVED_MATERIALS_ONLY');
 insert into public.workshop_accountant_commands values(p_request,p_actor,p_fingerprint,result,now());
 insert into zukait_bills.documents values(eid,sup,ref,doc_date,invoice::bigint,p_actor,now(),p_request);
 insert into zukait_bills.bills values(eid,sup,tx_date,due_date,amount::bigint,(invoice-amount)::bigint,sc.revision,wv,rev,p_request);
 for proof in select value from jsonb_array_elements(proofs) loop insert into zukait_bills.sources values('PAINT_ORDER',proof->>'id',eid,(proof->>'receivedCostMills')::bigint,proof->>'receiptDigest');end loop;
 insert into zukait_bills.audit values(p_request,eid,p_actor,p_input->>'deviceId',p_input->>'reason',result,now());update zukait_bills.control set revision=rev where singleton;return result;
end $$;
revoke all on function public.zukait_bill_pipeline(text,text,text,uuid,text,jsonb) from public,anon,authenticated;grant execute on function public.zukait_bill_pipeline(text,text,text,uuid,text,jsonb) to service_role;
