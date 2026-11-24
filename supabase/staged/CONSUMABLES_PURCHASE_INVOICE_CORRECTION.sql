-- STAGED ONLY. Manager-only reference corrections, not stock quantity reversal.
alter table public.zukait_purchase_invoices add column revision integer not null default 1 check(revision>0);
create table public.zukait_purchase_invoice_audit(
 request_id text primary key, invoice_id uuid not null references public.zukait_purchase_invoices(id),
 actor_id text not null, fingerprint jsonb not null, reason text not null,
 before_header jsonb not null, after_header jsonb not null, receipt jsonb not null,
 created_at timestamptz not null default now()
);
alter table public.zukait_purchase_invoice_audit enable row level security;
revoke all on public.zukait_purchase_invoice_audit from public,anon,authenticated;
grant select,insert on public.zukait_purchase_invoice_audit to service_role;
create function public.zukait_purchase_invoice_correct_header(p_session_hash text,p_request_id text,p_data jsonb)
returns jsonb language plpgsql security invoker set search_path='' as $fn$
declare v_actor text; v_role text; v_row public.zukait_purchase_invoices%rowtype; v_prior public.zukait_purchase_invoice_audit%rowtype;
 v_id uuid; v_revision integer; v_supplier text; v_number text; v_key text; v_date date; v_reason text;
 v_before jsonb; v_after jsonb; v_receipt jsonb;
begin
 select sc.user_id::text,sc.role into v_actor,v_role from public.staff_sessions ss join public.staff_credentials sc on sc.user_id=ss.user_id
 where ss.token_hash=nullif(p_session_hash,'') and ss.revoked_at is null and sc.active and not coalesce(sc.must_change,false);
 if v_actor is null or v_role<>'Manager' then raise exception 'MANAGER_ONLY' using errcode='42501'; end if;
 if p_request_id is null or p_request_id !~ '^[a-zA-Z0-9_.:-]{1,128}$' then raise exception 'REQUEST_ID_REQUIRED'; end if;
 if jsonb_typeof(p_data) is distinct from 'object' or octet_length(p_data::text)>4096 then raise exception 'INVALID_INVOICE_CORRECTION'; end if;
 if exists(select 1 from jsonb_object_keys(p_data) k where k not in ('invoiceId','expectedRevision','supplier','invoiceNumber','invoiceDate','reason')) then raise exception 'INVOICE_LINE_CORRECTION_REQUIRES_REVIEW'; end if;
 perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended('zukait-invoice-correction:'||p_request_id,0));
 select * into v_prior from public.zukait_purchase_invoice_audit where request_id=p_request_id;
 if found then
  if v_prior.actor_id<>v_actor or v_prior.fingerprint<>p_data then raise exception 'REQUEST_ID_CONFLICT' using errcode='23505'; end if;
  return v_prior.receipt;
 end if;
 v_id:=(p_data->>'invoiceId')::uuid; v_revision:=(p_data->>'expectedRevision')::integer;
 v_supplier:=trim(coalesce(p_data->>'supplier',''));v_number:=trim(coalesce(p_data->>'invoiceNumber',''));v_reason:=trim(coalesce(p_data->>'reason',''));
 if length(v_supplier) not between 1 and 160 or length(v_number) not between 1 and 100 or length(v_reason) not between 5 and 500 then raise exception 'INVALID_INVOICE_CORRECTION'; end if;
 if coalesce(p_data->>'invoiceDate','') !~ '^\d{4}-\d{2}-\d{2}$' then raise exception 'INVALID_INVOICE_DATE'; end if;
 v_date:=(p_data->>'invoiceDate')::date;
 if v_date>(now() at time zone 'Asia/Muscat')::date then raise exception 'INVALID_INVOICE_DATE'; end if;
 v_key:=jsonb_build_array(lower(regexp_replace(normalize(v_supplier,NFKC),'\s+',' ','g')),lower(regexp_replace(normalize(v_number,NFKC),'\s+',' ','g')))::text;
 select * into v_row from public.zukait_purchase_invoices where id=v_id for update;
 if not found then raise exception 'INVOICE_NOT_FOUND'; end if;
 if v_revision is distinct from v_row.revision then raise exception 'INVOICE_REVISION_CONFLICT'; end if;
 v_before:=jsonb_build_object('supplier',v_row.supplier,'invoiceNumber',v_row.invoice_number,'invoiceDate',v_row.invoice_date,'revision',v_row.revision);
 if (v_supplier,v_number,v_date)=(v_row.supplier,v_row.invoice_number,v_row.invoice_date) then raise exception 'NO_INVOICE_CHANGE'; end if;
 update public.zukait_purchase_invoices set supplier=v_supplier,invoice_number=v_number,invoice_key=v_key,invoice_date=v_date,revision=revision+1 where id=v_id returning * into v_row;
 v_after:=jsonb_build_object('supplier',v_row.supplier,'invoiceNumber',v_row.invoice_number,'invoiceDate',v_row.invoice_date,'revision',v_row.revision);
 v_receipt:=to_jsonb(v_row)-'fingerprint'-'invoice_key';
 insert into public.zukait_purchase_invoice_audit(request_id,invoice_id,actor_id,fingerprint,reason,before_header,after_header,receipt)
 values(p_request_id,v_id,v_actor,p_data,v_reason,v_before,v_after,v_receipt);
 return v_receipt;
end $fn$;
revoke all on function public.zukait_purchase_invoice_correct_header(text,text,jsonb) from public,anon,authenticated;
grant execute on function public.zukait_purchase_invoice_correct_header(text,text,jsonb) to service_role;

-- Correct the quantity/amount of existing lines only if no subsequent movement
-- has used or changed that pair. Never silently reverse issued stock or reprice
-- previously finalized job costs. Preserve original PURCHASE and append an audit
-- adjustment for the exact delta; no synthetic opening count is created.
create function public.zukait_purchase_invoice_correct_lines(p_session_hash text,p_request_id text,p_data jsonb)
returns jsonb language plpgsql security invoker set search_path='' as $fn$
declare
 v_actor text; v_role text; v_row public.zukait_purchase_invoices%rowtype;
 v_prior public.zukait_purchase_invoice_audit%rowtype; v_item public.zukait_stock_balances%rowtype;
 v_id uuid; v_revision integer; v_reason text; v_before jsonb; v_after jsonb; v_receipt jsonb;
 v_old jsonb; v_new jsonb; v_lines jsonb:='[]'; v_m text; v_b text; v_method text;
 v_qty numeric; v_price numeric; v_total numeric; v_rate numeric; v_sum numeric:=0;
 v_delta numeric; v_cost_delta numeric; v_last text; v_request text; v_idx integer:=0; v_changed boolean:=false;
begin
 select sc.user_id::text,sc.role into v_actor,v_role from public.staff_sessions ss join public.staff_credentials sc on sc.user_id=ss.user_id
 where ss.token_hash=nullif(p_session_hash,'') and ss.revoked_at is null and sc.active and not coalesce(sc.must_change,false);
 if v_actor is null or v_role<>'Manager' then raise exception 'MANAGER_ONLY' using errcode='42501'; end if;
 if p_request_id is null or p_request_id !~ '^[a-zA-Z0-9_.:-]{1,128}$' then raise exception 'REQUEST_ID_REQUIRED'; end if;
 if jsonb_typeof(p_data) is distinct from 'object' or octet_length(p_data::text)>65536 then raise exception 'INVALID_INVOICE_CORRECTION'; end if;
 if exists(select 1 from jsonb_object_keys(p_data) k where k not in ('invoiceId','expectedRevision','lines','reason')) then raise exception 'INVALID_INVOICE_CORRECTION';end if;
 v_id:=(p_data->>'invoiceId')::uuid; v_revision:=(p_data->>'expectedRevision')::integer; v_reason:=trim(coalesce(p_data->>'reason',''));
 if length(v_reason) not between 5 and 500 or jsonb_typeof(p_data->'lines') is distinct from 'array' then raise exception 'INVALID_INVOICE_CORRECTION'; end if;
 perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended('zukait-invoice-correction:'||p_request_id,0));
 select * into v_prior from public.zukait_purchase_invoice_audit where request_id=p_request_id;
 if found then
  if v_prior.actor_id<>v_actor or v_prior.fingerprint<>p_data then raise exception 'REQUEST_ID_CONFLICT' using errcode='23505'; end if;
  return v_prior.receipt;
 end if;
 select * into v_row from public.zukait_purchase_invoices where id=v_id for update;
 if not found then raise exception 'INVOICE_NOT_FOUND'; end if;
 if v_revision is distinct from v_row.revision then raise exception 'INVOICE_REVISION_CONFLICT'; end if;
 if jsonb_array_length(p_data->'lines')<>jsonb_array_length(v_row.lines) then raise exception 'INVOICE_PAIR_SET_CHANGE_REQUIRES_REVIEW'; end if;
 if exists(select 1 from jsonb_array_elements(p_data->'lines') x group by x->>'materialId',x->>'brandId' having count(*)>1) then raise exception 'DUPLICATE_MATERIAL_BRAND'; end if;
 v_before:=jsonb_build_object('revision',v_row.revision,'lines',v_row.lines,'totalAmount',v_row.total_amount);
 for v_old in select x from jsonb_array_elements(v_row.lines) x order by x->>'materialId',x->>'brandId' loop
  v_idx:=v_idx+1;v_m:=v_old->>'materialId';v_b:=v_old->>'brandId';
  select x into v_new from jsonb_array_elements(p_data->'lines') x where x->>'materialId'=v_m and x->>'brandId'=v_b;
  if not found or v_new->>'unit' is distinct from v_old->>'unit' then raise exception 'INVOICE_PAIR_SET_CHANGE_REQUIRES_REVIEW'; end if;
  if coalesce(v_new->>'quantity','') !~ '^\d{1,7}(\.\d{1,4})?$' or coalesce(v_new->>'price','') !~ '^\d{1,9}(\.\d{1,3})?$' then raise exception 'INVALID_INVOICE_LINE'; end if;
  v_qty:=(v_new->>'quantity')::numeric;v_price:=(v_new->>'price')::numeric;v_method:=v_new->>'priceMethod';
  if v_qty<=0 or v_price<=0 or v_method is null or v_method not in ('unit','total') then raise exception 'INVALID_INVOICE_LINE'; end if;
  if v_old->>'unit'='Piece' and trunc(v_qty)<>v_qty then raise exception 'PIECE_WHOLE_REQUIRED'; end if;
  v_total:=case when v_method='unit' then round(v_qty*v_price,3) else v_price end;
  v_rate:=case when v_method='unit' then v_price else round(v_total/v_qty,3) end;
  if v_total<=0 or v_rate<=0 or v_total>999999999.999 or v_rate>999999999.999 then raise exception 'INVALID_LINE_TOTAL'; end if;
  v_sum:=v_sum+v_total;if v_sum>999999999.999 then raise exception 'INVALID_INVOICE_TOTAL';end if;
  if (v_qty,v_price,v_method) is distinct from ((v_old->>'quantity')::numeric,(v_old->>'price')::numeric,v_old->>'priceMethod') then
   select * into v_item from public.zukait_stock_balances where material_id=v_m and brand_id=v_b for update;
   if not found or v_item.unit is distinct from v_old->>'unit' then raise exception 'STOCK_UNIT_CONFLICT';end if;
   select request_id into v_last from public.zukait_stock_movements where material_id=v_m and brand_id=v_b order by id desc limit 1;
   if v_last is distinct from coalesce(v_old->>'lastStockMovementRequestId',v_old->>'stockReceiptId') then raise exception 'INVOICE_STOCK_USED_OR_CHANGED'; end if;
   v_delta:=v_qty-(v_old->>'quantity')::numeric;v_cost_delta:=v_total-(v_old->>'totalAmount')::numeric;
   if v_item.physical+v_delta<v_item.reserved or v_item.stock_value+v_cost_delta<0 or (v_item.physical+v_delta=0 and v_item.stock_value+v_cost_delta<>0) then raise exception 'INVOICE_STOCK_CORRECTION_UNSAFE';end if;
   v_request:='invoice-correction:'||v_id::text||':'||(v_row.revision+1)::text||':'||v_idx::text;
   update public.zukait_stock_balances set physical=physical+v_delta,stock_value=stock_value+v_cost_delta,updated_at=now() where material_id=v_m and brand_id=v_b;
   insert into public.zukait_stock_movements(material_id,brand_id,action,physical_delta,reserved_delta,cost_delta,actor_id,request_id,note)
   values(v_m,v_b,'ADJUST',v_delta,0,v_cost_delta,v_actor,v_request,'Invoice correction '||v_id::text||': '||left(v_reason,160));
   v_old:=v_old||jsonb_build_object('quantity',v_qty,'price',v_price,'priceMethod',v_method,'unitPrice',v_rate,'totalAmount',v_total,'lastStockMovementRequestId',v_request);
   v_changed:=true;
  end if;
  v_lines:=v_lines||jsonb_build_array(v_old);
 end loop;
 if not v_changed then raise exception 'NO_INVOICE_CHANGE';end if;
 update public.zukait_purchase_invoices set lines=v_lines,total_amount=v_sum,revision=revision+1 where id=v_id returning * into v_row;
 v_after:=jsonb_build_object('revision',v_row.revision,'lines',v_row.lines,'totalAmount',v_row.total_amount);
 v_receipt:=to_jsonb(v_row)-'fingerprint'-'invoice_key';
 insert into public.zukait_purchase_invoice_audit(request_id,invoice_id,actor_id,fingerprint,reason,before_header,after_header,receipt)
 values(p_request_id,v_id,v_actor,p_data,v_reason,v_before,v_after,v_receipt);
 return v_receipt;
end $fn$;
revoke all on function public.zukait_purchase_invoice_correct_lines(text,text,jsonb) from public,anon,authenticated;
grant execute on function public.zukait_purchase_invoice_correct_lines(text,text,jsonb) to service_role;
