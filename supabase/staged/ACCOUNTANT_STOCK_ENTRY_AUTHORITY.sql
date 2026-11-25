-- STAGED ONLY. Captured current production RPC definitions 25 Nov 2026; recheck exact definitions and ACLs before rollout.
-- Preserve original SQL except narrow session-bound Accountant role gates. No execution against production.
begin;
CREATE OR REPLACE FUNCTION public.zukait_purchase_invoice_audit_list(p_session_hash text, p_invoice_id uuid, p_page integer)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE
 SET search_path TO ''
AS $function$
declare v_role text;
begin
 select sc.role into v_role from public.staff_sessions ss join public.staff_credentials sc on sc.user_id=ss.user_id
 where ss.token_hash=nullif(p_session_hash,'') and ss.revoked_at is null and sc.active and not coalesce(sc.must_change,false);
 if (v_role is null or v_role not in ('Manager','Accountant')) then raise exception 'MANAGER_ONLY' using errcode='42501';end if;
 if p_invoice_id is null or p_page is null or p_page not between 0 and 100 then raise exception 'INVALID_INVOICE_FILTER';end if;
 return (select coalesce(jsonb_agg(to_jsonb(q) order by q.created_at desc,q.event_id desc),'[]'::jsonb)
 from (
 select * from (
 select 'purchase:'||i.request_id as event_id,i.request_id,i.actor_id,'Invoice created'::text as reason,
 'PURCHASE_CREATED'::text as event_type,null::jsonb as before_header,i.fingerprint as after_header,i.created_at
 from public.zukait_purchase_invoices i where i.id=p_invoice_id
 union all
 select 'correction:'||a.request_id,a.request_id,a.actor_id,a.reason,
 case when a.after_header->>'status'='cancelled' then 'INVOICE_CANCELLED' else 'INVOICE_CORRECTED' end,
 a.before_header,a.after_header,a.created_at
 from public.zukait_purchase_invoice_audit a where a.invoice_id=p_invoice_id
 union all
 select 'price:'||a.request_id,a.request_id,a.actor_id,a.fingerprint->>'reason','PRICE_APPLIED',
 a.fingerprint->'review',a.receipt,a.created_at
 from public.zukait_invoice_price_applications a where a.invoice_id=p_invoice_id
 union all
 select 'reconcile:'||r.request_id,r.request_id,r.actor_id,r.fingerprint->'correction'->>'reason','PRICE_RECONCILED',
 r.fingerprint->'review',r.receipt->'reconciliation',r.created_at
 from public.zukait_invoice_price_reconciliations r where r.invoice_id=p_invoice_id
 ) events order by created_at desc,event_id desc limit 51 offset p_page*50
 ) q);
end $function$
;
revoke all on function public.zukait_purchase_invoice_audit_list(p_session_hash text, p_invoice_id uuid, p_page integer) from public,anon,authenticated;
grant execute on function public.zukait_purchase_invoice_audit_list(p_session_hash text, p_invoice_id uuid, p_page integer) to service_role;

CREATE OR REPLACE FUNCTION public.zukait_purchase_invoice_correct_header(p_session_hash text, p_request_id text, p_data jsonb)
 RETURNS jsonb
 LANGUAGE plpgsql
 SET search_path TO ''
AS $function$
declare v_actor text; v_role text; v_row public.zukait_purchase_invoices%rowtype; v_prior public.zukait_purchase_invoice_audit%rowtype;
 v_id uuid; v_revision integer; v_supplier text; v_number text; v_key text; v_date date; v_reason text;
 v_before jsonb; v_after jsonb; v_receipt jsonb;
begin
 select sc.user_id::text,sc.role into v_actor,v_role from public.staff_sessions ss join public.staff_credentials sc on sc.user_id=ss.user_id
 where ss.token_hash=nullif(p_session_hash,'') and ss.revoked_at is null and sc.active and not coalesce(sc.must_change,false);
 if v_actor is null or v_role not in ('Manager','Accountant') then raise exception 'MANAGER_ONLY' using errcode='42501'; end if;
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
 if v_row.status<>'posted' then raise exception 'INVOICE_CANCELLED';end if;
 if v_revision is distinct from v_row.revision then raise exception 'INVOICE_REVISION_CONFLICT'; end if;
 v_before:=jsonb_build_object('supplier',v_row.supplier,'invoiceNumber',v_row.invoice_number,'invoiceDate',v_row.invoice_date,'revision',v_row.revision);
 if (v_supplier,v_number,v_date)=(v_row.supplier,v_row.invoice_number,v_row.invoice_date) then raise exception 'NO_INVOICE_CHANGE'; end if;
 update public.zukait_purchase_invoices set supplier=v_supplier,invoice_number=v_number,invoice_key=v_key,invoice_date=v_date,revision=revision+1 where id=v_id returning * into v_row;
 v_after:=jsonb_build_object('supplier',v_row.supplier,'invoiceNumber',v_row.invoice_number,'invoiceDate',v_row.invoice_date,'revision',v_row.revision);
 v_receipt:=to_jsonb(v_row)-'fingerprint'-'invoice_key';
 insert into public.zukait_purchase_invoice_audit(request_id,invoice_id,actor_id,fingerprint,reason,before_header,after_header,receipt)
 values(p_request_id,v_id,v_actor,p_data,v_reason,v_before,v_after,v_receipt);
 return v_receipt;
end $function$
;
revoke all on function public.zukait_purchase_invoice_correct_header(p_session_hash text, p_request_id text, p_data jsonb) from public,anon,authenticated;
grant execute on function public.zukait_purchase_invoice_correct_header(p_session_hash text, p_request_id text, p_data jsonb) to service_role;

CREATE OR REPLACE FUNCTION public.zukait_purchase_invoice_correct_lines(p_session_hash text, p_request_id text, p_data jsonb)
 RETURNS jsonb
 LANGUAGE plpgsql
 SET search_path TO ''
AS $function$
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
 if v_actor is null or v_role not in ('Manager','Accountant') then raise exception 'MANAGER_ONLY' using errcode='42501'; end if;
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
 if v_row.status<>'posted' then raise exception 'INVOICE_CANCELLED';end if;
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
end $function$
;
revoke all on function public.zukait_purchase_invoice_correct_lines(p_session_hash text, p_request_id text, p_data jsonb) from public,anon,authenticated;
grant execute on function public.zukait_purchase_invoice_correct_lines(p_session_hash text, p_request_id text, p_data jsonb) to service_role;

CREATE OR REPLACE FUNCTION public.zukait_purchase_invoice_list(p_session_hash text, p_page integer, p_query text, p_from date, p_to date)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE
 SET search_path TO ''
AS $function$
declare v_role text;
begin
 select sc.role into v_role from public.staff_sessions ss join public.staff_credentials sc on sc.user_id=ss.user_id
 where ss.token_hash=nullif(p_session_hash,'') and ss.revoked_at is null and sc.active and not coalesce(sc.must_change,false);
 if v_role is null or v_role not in ('Manager','Supervisor','Accountant') then raise exception 'STOCK_FORBIDDEN' using errcode='42501'; end if;
 if p_page is null or p_page not between 0 and 100 or length(coalesce(p_query,''))>160 or (p_from is not null and p_to is not null and p_from>p_to) then raise exception 'INVALID_INVOICE_FILTER'; end if;
 return (select coalesce(jsonb_agg(to_jsonb(q)-'fingerprint'-'invoice_key' order by q.invoice_date desc,q.created_at desc,q.id desc),'[]'::jsonb)
 from (select * from public.zukait_purchase_invoices i where (p_from is null or invoice_date>=p_from) and (p_to is null or invoice_date<=p_to)
 and (coalesce(p_query,'')='' or strpos(lower(i.supplier||' '||i.invoice_number||' '||i.lines::text),lower(trim(p_query)))>0)
 order by invoice_date desc,created_at desc,id desc limit 51 offset p_page*50) q);
end $function$
;
revoke all on function public.zukait_purchase_invoice_list(p_session_hash text, p_page integer, p_query text, p_from date, p_to date) from public,anon,authenticated;
grant execute on function public.zukait_purchase_invoice_list(p_session_hash text, p_page integer, p_query text, p_from date, p_to date) to service_role;

CREATE OR REPLACE FUNCTION public.zukait_purchase_invoice_save(p_session_hash text, p_request_id text, p_data jsonb)
 RETURNS jsonb
 LANGUAGE plpgsql
 SET search_path TO ''
AS $function$
declare
 v_actor text; v_role text; v_supplier text; v_number text; v_key text; v_date date;
 v_invoice public.zukait_purchase_invoices%rowtype; v_line jsonb; v_lines jsonb:='[]';
 v_m text; v_b text; v_unit text; v_material text; v_brand text; v_qty numeric;
 v_price numeric; v_total numeric; v_rate numeric; v_sum numeric:=0; v_method text;
 v_receipt jsonb; v_idx integer:=0; v_child text; v_origin text; v_saved jsonb;
begin
 select sc.user_id::text,sc.role into v_actor,v_role from public.staff_sessions ss
 join public.staff_credentials sc on sc.user_id=ss.user_id
 where ss.token_hash=nullif(p_session_hash,'') and ss.revoked_at is null and sc.active and not coalesce(sc.must_change,false);
 if v_actor is null or v_role not in ('Manager','Supervisor','Accountant') then raise exception 'STOCK_FORBIDDEN' using errcode='42501'; end if;
 if p_request_id is null or p_request_id !~ '^[a-zA-Z0-9_.:-]{1,128}$' then raise exception 'REQUEST_ID_REQUIRED'; end if;
 if jsonb_typeof(p_data) is distinct from 'object' or octet_length(p_data::text)>65536 then raise exception 'INVALID_INVOICE'; end if;
 perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended('zukait-invoice:'||p_request_id,0));
 select * into v_invoice from public.zukait_purchase_invoices where request_id=p_request_id;
 if found then
  if v_invoice.actor_id<>v_actor or v_invoice.fingerprint<>p_data then raise exception 'REQUEST_ID_CONFLICT' using errcode='23505'; end if;
  return to_jsonb(v_invoice)-'fingerprint'-'invoice_key';
 end if;
 v_supplier:=trim(coalesce(p_data->>'supplier','')); v_number:=trim(coalesce(p_data->>'invoiceNumber',''));
 if length(v_supplier) not between 1 and 160 or length(v_number) not between 1 and 100 then raise exception 'INVOICE_REFERENCE_REQUIRED'; end if;
 if coalesce(p_data->>'invoiceDate','') !~ '^\d{4}-\d{2}-\d{2}$' then raise exception 'INVALID_INVOICE_DATE'; end if;
 v_date:=(p_data->>'invoiceDate')::date;
 if v_date>(now() at time zone 'Asia/Muscat')::date then raise exception 'INVALID_INVOICE_DATE'; end if;
 v_key:=jsonb_build_array(lower(regexp_replace(normalize(v_supplier,NFKC),'\s+',' ','g')),lower(regexp_replace(normalize(v_number,NFKC),'\s+',' ','g')))::text;
 if jsonb_typeof(p_data->'lines') is distinct from 'array' then raise exception 'INVALID_INVOICE_LINES'; end if;
 if jsonb_array_length(p_data->'lines') not between 1 and 50 then raise exception 'INVALID_INVOICE_LINES'; end if;
 if exists(select 1 from jsonb_array_elements(p_data->'lines') x group by x->>'materialId',x->>'brandId' having count(*)>1) then raise exception 'DUPLICATE_MATERIAL_BRAND'; end if;
 -- Unique invoice reference and request receipt are transactional. Any failing line rolls everything back.
 insert into public.zukait_purchase_invoices(request_id,actor_id,fingerprint,supplier,invoice_number,invoice_key,invoice_date)
 values(p_request_id,v_actor,p_data,v_supplier,v_number,v_key,v_date) returning * into v_invoice;
 -- Same order for every invoice prevents overlapping multi-line purchases from deadlocking.
 for v_line in select x from jsonb_array_elements(p_data->'lines') x order by x->>'materialId',x->>'brandId' loop
  if jsonb_typeof(v_line) is distinct from 'object' then raise exception 'INVALID_INVOICE_LINE'; end if;
  v_m:=v_line->>'materialId'; v_b:=v_line->>'brandId';
  if coalesce(v_m,'') !~ '^[a-zA-Z0-9_.:-]{1,120}$' or coalesce(v_b,'') !~ '^[a-zA-Z0-9_.:-]{1,120}$' then raise exception 'INVALID_STOCK_IDENTITY'; end if;
  -- Require an exact active linked pair; never infer a new combination from independent keys.
  select b.unit,m.display_name,k.display_name into v_unit,v_material,v_brand
  from public.zukait_stock_balances b join public.zukait_stock_material_keys m using(material_id)
  join public.zukait_stock_brand_keys k using(brand_id)
  where b.material_id=v_m and b.brand_id=v_b and m.active and k.active and m.unit=b.unit
  for update of b;
  if not found then
   -- Only Managers may project a missing pair. The existing RPC revalidates
   -- the saved material, brand, price, unit and scope inside this transaction.
   if v_role<>'Manager' then raise exception 'STOCK_PAIR_NOT_LINKED';end if;
   select x into v_saved from public.workshop_state ws
   cross join lateral jsonb_array_elements(ws.data->'consumables'->'materials') x
   where ws.id='main' and x->>'id'=v_m and x->>'active' is distinct from 'false' limit 1;
   v_origin:=nullif(v_saved->>'department','');
   if v_origin is null or v_origin='Unassigned' then
    select department into v_origin from public.zukait_stock_material_keys where material_id=v_m and active;
   end if;
   if v_origin is null or v_origin not in ('Painting','Mechanical','Both') then raise exception 'STOCK_PAIR_NOT_LINKED';end if;
   perform public.zukait_stock_link_master(p_session_hash,v_m,v_b,v_origin);
   select b.unit,m.display_name,k.display_name into v_unit,v_material,v_brand
   from public.zukait_stock_balances b join public.zukait_stock_material_keys m using(material_id)
   join public.zukait_stock_brand_keys k using(brand_id)
   where b.material_id=v_m and b.brand_id=v_b and m.active and k.active and m.unit=b.unit for update of b;
   if not found then raise exception 'STOCK_PAIR_NOT_LINKED';end if;
  end if;
  if v_line->>'unit' is distinct from v_unit then raise exception 'STOCK_UNIT_CONFLICT'; end if;
  if coalesce(v_line->>'quantity','') !~ '^\d{1,7}(\.\d{1,4})?$' or coalesce(v_line->>'price','') !~ '^\d{1,9}(\.\d{1,3})?$' then raise exception 'INVALID_INVOICE_LINE'; end if;
  v_qty:=(v_line->>'quantity')::numeric; v_price:=(v_line->>'price')::numeric; v_method:=v_line->>'priceMethod';
  if v_qty<=0 or v_price<=0 or v_method is null or v_method not in ('unit','total') then raise exception 'INVALID_INVOICE_LINE'; end if;
  if v_unit='Piece' and trunc(v_qty)<>v_qty then raise exception 'PIECE_WHOLE_REQUIRED'; end if;
  v_total:=case when v_method='unit' then round(v_qty*v_price,3) else v_price end;
  v_rate:=case when v_method='unit' then v_price else round(v_total/v_qty,3) end;
  if v_total<=0 or v_rate<=0 or v_total>999999999.999 or v_rate>999999999.999 then raise exception 'INVALID_LINE_TOTAL'; end if;
  v_sum:=v_sum+v_total;
  if v_sum>999999999.999 then raise exception 'INVALID_INVOICE_TOTAL'; end if;
  v_idx:=v_idx+1; v_child:='invoice:'||v_invoice.id::text||':'||v_idx::text;
  -- Reuse the existing ledger command, receipt, stock locks and staff authorization.
  v_receipt:=public.zukait_stock_command(p_session_hash,v_child,'PURCHASE',jsonb_build_object(
    'materialId',v_m,'brandId',v_b,'quantity',v_qty,'priceMethod','total','price',v_total,'reason','Purchase invoice '||v_invoice.id::text));
  v_lines:=v_lines||jsonb_build_array(jsonb_build_object('materialId',v_m,'brandId',v_b,'materialName',v_material,'brandName',v_brand,'unit',v_unit,'quantity',v_qty,'priceMethod',v_method,'price',v_price,'unitPrice',v_rate,'totalAmount',v_total,'stockReceiptId',v_child));
 end loop;
 update public.zukait_purchase_invoices set lines=v_lines,total_amount=v_sum where id=v_invoice.id returning * into v_invoice;
 return to_jsonb(v_invoice)-'fingerprint'-'invoice_key';
end $function$
;
revoke all on function public.zukait_purchase_invoice_save(p_session_hash text, p_request_id text, p_data jsonb) from public,anon,authenticated;
grant execute on function public.zukait_purchase_invoice_save(p_session_hash text, p_request_id text, p_data jsonb) to service_role;

CREATE OR REPLACE FUNCTION public.zukait_stock_command(p_session_hash text, p_request_id text, p_action text, p_data jsonb)
 RETURNS jsonb
 LANGUAGE plpgsql
 SET search_path TO ''
AS $function$
declare
  v_actor text;
  v_role text;
  v_op text := upper(trim(coalesce(p_action,'')));
  v_hash text;
  v_receipt public.zukait_stock_request_receipts%rowtype;
  v_item public.zukait_stock_balances%rowtype;
  v_res public.zukait_stock_reservations%rowtype;
  v_lot record;
  v_material text := nullif(trim(coalesce(p_data->>'materialId','')),'');
  v_brand text := nullif(trim(coalesce(p_data->>'brandId','')),'');
  v_unit text;
  v_jc text := upper(trim(coalesce(p_data->>'jobCard','')));
  v_resid uuid;
  v_qty numeric;
  v_price numeric;
  v_total numeric := 0;
  v_delta numeric := 0;
  v_current numeric := 0;
  v_cost numeric := 0;
  v_left numeric := 0;
  v_part numeric := 0;
  v_pdelta numeric := 0;
  v_rdelta numeric := 0;
  v_cdelta numeric := 0;
  v_note text := trim(coalesce(p_data->>'reason',''));
  v_result jsonb;
begin
  if nullif(trim(coalesce(p_request_id,'')),'') is null or length(p_request_id)>128
    then raise exception 'REQUEST_ID_REQUIRED' using errcode='22023'; end if;
  if p_data is null or jsonb_typeof(p_data)<>'object' or octet_length(p_data::text)>2048
    then raise exception 'INVALID_STOCK_PAYLOAD' using errcode='22023'; end if;
  if v_op not in ('OPENING','PURCHASE','RESERVE','CHANGE','CANCEL','FINALISE','RETURN','ADJUST','MINIMUM')
    then raise exception 'UNKNOWN_STOCK_ACTION' using errcode='22023'; end if;
  -- Existing custom ZUKAIT staff auth, not Supabase auth.uid() / user metadata.
  select sc.user_id::text, sc.role
    into v_actor, v_role
    from public.staff_sessions ss
    join public.staff_credentials sc on sc.user_id=ss.user_id
   where ss.token_hash=p_session_hash
     and ss.revoked_at is null and sc.active=true and coalesce(sc.must_change,false)=false;
  if v_actor is null or (v_role not in ('Manager','Supervisor','Accountant') or (v_role='Accountant' and v_op not in ('OPENING','PURCHASE')))
    then raise exception 'STOCK_FORBIDDEN' using errcode='42501'; end if;
  if v_op in ('OPENING','ADJUST','MINIMUM') and v_role<>'Manager' and not (v_role='Accountant' and v_op='OPENING')
    then raise exception 'MANAGER_ONLY' using errcode='42501'; end if;
  -- Accountant PURCHASE is permitted only inside an in-progress atomic invoice.
  -- A completed invoice cannot authorize another stock movement.
  if v_role='Accountant' and v_op='PURCHASE' and not exists (
    select 1 from public.zukait_purchase_invoices i
    cross join lateral (
      select x, row_number() over(order by x->>'materialId',x->>'brandId') as idx
      from jsonb_array_elements(i.fingerprint->'lines') x
    ) l
    where i.actor_id=v_actor and i.status='posted' and i.lines='[]'::jsonb
      and i.total_amount=0
      and p_request_id='invoice:'||i.id::text||':'||l.idx::text
      and p_data=jsonb_build_object('materialId',l.x->>'materialId','brandId',l.x->>'brandId',
          'quantity',(l.x->>'quantity')::numeric,'priceMethod','total','price',
          case when l.x->>'priceMethod'='unit' then round((l.x->>'quantity')::numeric*(l.x->>'price')::numeric,3)
          else (l.x->>'price')::numeric end,'reason','Purchase invoice '||i.id::text)
  ) then raise exception 'STOCK_FORBIDDEN' using errcode='42501'; end if;
  if length(v_note)>240 then raise exception 'STOCK_REASON_TOO_LONG' using errcode='22023'; end if;
  -- Prevent simultaneous identical request IDs from both inserting.
  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended('zukait-stock:'||p_request_id,0));
  v_hash := md5(v_op || ':' || p_data::text);
  select * into v_receipt from public.zukait_stock_request_receipts
    where request_id=p_request_id;
  if found then
    if v_receipt.actor_id<>v_actor or v_receipt.action<>v_op or v_receipt.fingerprint<>v_hash
      then raise exception 'REQUEST_ID_CONFLICT' using errcode='23505'; end if;
    return v_receipt.result;
  end if;
  if v_op in ('CHANGE','CANCEL','FINALISE','RETURN') then
    if coalesce(p_data->>'reservationId','')=''
      then raise exception 'RESERVATION_ID_REQUIRED' using errcode='22023'; end if;
    v_resid := (p_data->>'reservationId')::uuid;
    select * into v_res from public.zukait_stock_reservations
      where id=v_resid for update;
    if not found then raise exception 'RESERVATION_NOT_FOUND' using errcode='22023'; end if;
    if v_op<>'RETURN' and v_res.status<>'reserved'
      then raise exception 'RESERVATION_CLOSED' using errcode='22023'; end if;
    if v_op='RETURN' and v_res.status<>'finalised'
      then raise exception 'FINALISATION_REQUIRED' using errcode='22023'; end if;
    v_material:=v_res.material_id;
    v_brand:=v_res.brand_id;
    v_jc:=v_res.job_card;
  end if;
  if v_material is null or v_brand is null then
    raise exception 'MATERIAL_AND_BRAND_REQUIRED' using errcode='22023';
  end if;
  if v_op='OPENING' then
    -- Validate only against tiny, server-seeded keys; no reads of workshop_state.
    select mk.unit into v_unit from public.zukait_stock_material_keys mk
     where mk.material_id=v_material and mk.active=true;
    if v_unit is null or not exists (
      select 1 from public.zukait_stock_brand_keys bk where bk.brand_id=v_brand and bk.active=true
    ) then raise exception 'STOCK_MASTER_KEY_NOT_FOUND' using errcode='22023'; end if;
    v_qty := nullif(p_data->>'quantity','')::numeric;
    v_price := nullif(p_data->>'unitCost','')::numeric;
    -- Manager must explicitly attest a physically counted quantity and its
    -- source/reference. Never accept UI examples or an implied old balance.
    if p_data->>'countConfirmed' is distinct from 'true' or
       length(v_note) not between 5 and 180 then
      raise exception 'PHYSICAL_COUNT_CONFIRMATION_REQUIRED' using errcode='22023';end if;
    if v_qty is null or v_qty<=0 or v_price is null or v_price<=0 or
       pg_catalog.round(v_qty,4)<>v_qty then
      raise exception 'INVALID_OPENING' using errcode='22023';end if;
    if v_unit='Piece' and pg_catalog.trunc(v_qty)<>v_qty then
      raise exception 'PIECE_WHOLE_REQUIRED' using errcode='22023';end if;
    v_total:=v_qty*v_price;
    -- The Master-link creates a ZERO placeholder; an untouched placeholder
    -- may be opened exactly once, without losing any recorded stock value.
    insert into public.zukait_stock_balances(material_id,brand_id,unit,physical,reserved,stock_value)
      values(v_material,v_brand,v_unit,0,0,0)
      on conflict(material_id,brand_id) do nothing;
    select * into v_item from public.zukait_stock_balances
      where material_id=v_material and brand_id=v_brand for update;
    if v_item.unit<>v_unit or v_item.physical<>0 or v_item.reserved<>0
       or v_item.stock_value<>0 or exists (
         select 1 from public.zukait_stock_movements mov
          where mov.material_id=v_material and mov.brand_id=v_brand
            and mov.action in ('OPENING','PURCHASE','RESERVE','FINALISE','MECHANICAL_ISSUE','ADJUST')
       ) then raise exception 'OPENING_ALREADY_RECORDED' using errcode='23505';end if;
    update public.zukait_stock_balances set physical=v_qty,stock_value=v_total,
      updated_at=now()
      where material_id=v_material and brand_id=v_brand returning * into v_item;
    v_pdelta:=v_qty; v_cdelta:=v_total;
  else
    -- Brand-new materials can be purchased directly after their existing Master
    -- IDs are synced into the tiny catalog. No separate zero-balance setup click.
    if v_op='PURCHASE' then
      insert into public.zukait_stock_balances(material_id,brand_id,unit,physical,reserved,stock_value)
      select mk.material_id,bk.brand_id,mk.unit,0,0,0
        from public.zukait_stock_material_keys mk
        cross join public.zukait_stock_brand_keys bk
       where mk.material_id=v_material and mk.active=true
         and bk.brand_id=v_brand and bk.active=true
      on conflict (material_id,brand_id) do nothing;
    end if;
    select * into v_item from public.zukait_stock_balances
      where material_id=v_material and brand_id=v_brand for update;
    if not found then raise exception 'OPENING_STOCK_REQUIRED' using errcode='22023'; end if;
    if v_op in ('PURCHASE','RESERVE') then
      v_qty:=nullif(p_data->>'quantity','')::numeric;
      if v_qty is null or v_qty<=0
        then raise exception 'INVALID_QUANTITY' using errcode='22023'; end if;
    end if;
    if v_op='PURCHASE' then
      v_price:=nullif(p_data->>'price','')::numeric;
      if v_price is null or v_price<=0
        then raise exception 'INVALID_PRICE' using errcode='22023'; end if;
      if p_data->>'priceMethod'='total' then v_total:=v_price;
      elsif p_data->>'priceMethod'='unit' then v_total:=v_price*v_qty;
      else raise exception 'PRICE_METHOD_REQUIRED' using errcode='22023'; end if;
      update public.zukait_stock_balances
        set physical=physical+v_qty, stock_value=stock_value+v_total, updated_at=now()
        where material_id=v_material and brand_id=v_brand returning * into v_item;
      v_pdelta:=v_qty; v_cdelta:=v_total;
    elsif v_op='RESERVE' then
      if v_jc='' or length(v_jc)>36 then raise exception 'JOB_CARD_REQUIRED' using errcode='22023'; end if;
      if v_qty>v_item.physical-v_item.reserved then
        raise exception 'INSUFFICIENT_STOCK' using errcode='23514'; end if;
      v_price:=case when v_item.physical=0 then 0 else v_item.stock_value/v_item.physical end;
      insert into public.zukait_stock_reservations(material_id,brand_id,job_card,reserved_qty,created_by)
        values(v_material,v_brand,v_jc,v_qty,v_actor) returning * into v_res;
      v_resid:=v_res.id;
      insert into public.zukait_stock_reservation_lots(reservation_id,quantity,unit_cost)
        values(v_resid,v_qty,v_price);
      update public.zukait_stock_balances set reserved=reserved+v_qty,updated_at=now()
        where material_id=v_material and brand_id=v_brand returning * into v_item;
      v_rdelta:=v_qty; v_note:='Cost locked on suggestion';
    elsif v_op='CHANGE' then
      v_qty:=nullif(p_data->>'quantity','')::numeric;
      if v_qty is null or v_qty<0 then raise exception 'INVALID_QUANTITY' using errcode='22023'; end if;
      v_delta:=v_qty-v_res.reserved_qty;
      if v_delta>v_item.physical-v_item.reserved then
        raise exception 'INSUFFICIENT_STOCK' using errcode='23514'; end if;
      if v_delta>0 then
        v_price:=case when v_item.physical=0 then 0 else v_item.stock_value/v_item.physical end;
        insert into public.zukait_stock_reservation_lots(reservation_id,quantity,unit_cost)
          values(v_resid,v_delta,v_price);
      elsif v_delta<0 then
        v_left:=-v_delta;
        for v_lot in
          select id,quantity from public.zukait_stock_reservation_lots
          where reservation_id=v_resid order by id desc for update
        loop
          v_part:=least(v_left,v_lot.quantity);
          if v_part=v_lot.quantity then
            delete from public.zukait_stock_reservation_lots where id=v_lot.id;
          else
            update public.zukait_stock_reservation_lots
              set quantity=quantity-v_part where id=v_lot.id;
          end if;
          v_left:=v_left-v_part;
          exit when v_left=0;
        end loop;
        if v_left>0 then raise exception 'LOT_BALANCE_MISMATCH' using errcode='23514'; end if;
      end if;
      update public.zukait_stock_reservations set reserved_qty=v_qty,
        status=case when v_qty=0 then 'cancelled' else 'reserved' end
        where id=v_resid returning * into v_res;
      update public.zukait_stock_balances set reserved=reserved+v_delta,updated_at=now()
        where material_id=v_material and brand_id=v_brand returning * into v_item;
      v_rdelta:=v_delta;
    elsif v_op='CANCEL' then
      v_rdelta:=-v_res.reserved_qty;
      delete from public.zukait_stock_reservation_lots where reservation_id=v_resid;
      update public.zukait_stock_reservations set status='cancelled',reserved_qty=0
        where id=v_resid returning * into v_res;
      update public.zukait_stock_balances set reserved=reserved+v_rdelta,updated_at=now()
        where material_id=v_material and brand_id=v_brand returning * into v_item;
    elsif v_op='FINALISE' then
      v_qty:=nullif(p_data->>'actualQuantity','')::numeric;
      if v_qty is null or v_qty<0 or v_qty>v_res.reserved_qty
        then raise exception 'INVALID_ACTUAL_QUANTITY' using errcode='22023'; end if;
      v_left:=v_qty;
      for v_lot in select id,quantity,unit_cost from public.zukait_stock_reservation_lots
          where reservation_id=v_resid order by id asc for update
      loop
        v_part:=least(v_left,v_lot.quantity);
        update public.zukait_stock_reservation_lots
          set used_qty=v_part where id=v_lot.id;
        v_cost:=v_cost+v_part*v_lot.unit_cost;
        v_left:=v_left-v_part;
        exit when v_left=0;
      end loop;
      if v_left>0 then raise exception 'LOT_BALANCE_MISMATCH' using errcode='23514'; end if;
      if v_item.physical>v_qty and v_item.stock_value<v_cost
        then raise exception 'STOCK_VALUATION_CONFLICT' using errcode='23514'; end if;
      v_rdelta:=-v_res.reserved_qty;
      update public.zukait_stock_reservations
        set status='finalised',reserved_qty=0,actual_qty=v_qty,final_cost=v_cost,finalised_at=now()
        where id=v_resid returning * into v_res;
      update public.zukait_stock_balances set
        physical=physical-v_qty, reserved=reserved+v_rdelta,
        stock_value=case when physical=v_qty then 0 else stock_value-v_cost end,
        updated_at=now() where material_id=v_material and brand_id=v_brand
        returning * into v_item;
      v_pdelta:=-v_qty; v_cdelta:=-v_cost;
      v_note:='Actual finalisation; unused reservation released';
    elsif v_op='RETURN' then
      v_qty:=nullif(p_data->>'quantity','')::numeric;
      if v_qty is null or v_qty<=0 or v_qty>v_res.actual_qty-v_res.returned_qty
        then raise exception 'RETURN_EXCEEDS_ACTUAL' using errcode='22023'; end if;
      v_left:=v_qty;
      for v_lot in select id,used_qty,returned_qty,unit_cost
        from public.zukait_stock_reservation_lots
        where reservation_id=v_resid order by id desc for update
      loop
        v_part:=least(v_left,v_lot.used_qty-v_lot.returned_qty);
        if v_part>0 then
          update public.zukait_stock_reservation_lots set returned_qty=returned_qty+v_part
            where id=v_lot.id;
          v_cost:=v_cost+v_part*v_lot.unit_cost;
          v_left:=v_left-v_part;
        end if;
        exit when v_left=0;
      end loop;
      if v_left>0 then raise exception 'RETURN_LOT_MISMATCH' using errcode='23514'; end if;
      update public.zukait_stock_reservations
        set returned_qty=returned_qty+v_qty,return_credit=return_credit+v_cost
        where id=v_resid returning * into v_res;
      update public.zukait_stock_balances
        set physical=physical+v_qty,stock_value=stock_value+v_cost,updated_at=now()
        where material_id=v_material and brand_id=v_brand returning * into v_item;
      v_pdelta:=v_qty; v_cdelta:=v_cost;
    elsif v_op='ADJUST' then
      if v_note='' then raise exception 'REASON_REQUIRED' using errcode='22023'; end if;
      v_qty:=nullif(p_data->>'countedQuantity','')::numeric;
      if v_qty is null or v_qty<v_item.reserved
        then raise exception 'COUNT_BELOW_RESERVED' using errcode='22023'; end if;
      v_delta:=v_qty-v_item.physical;
      v_price:=case when v_item.physical=0 then 0 else v_item.stock_value/v_item.physical end;
      v_total:=v_delta*v_price;
      update public.zukait_stock_balances
        set physical=v_qty, stock_value=case when v_qty=0 then 0 else stock_value+v_total end,
            updated_at=now()
        where material_id=v_material and brand_id=v_brand returning * into v_item;
      v_pdelta:=v_delta; v_cdelta:=v_total;
    elsif v_op='MINIMUM' then
      v_qty:=nullif(p_data->>'minimum','')::numeric;
      if v_qty is null or v_qty<0 then raise exception 'INVALID_MINIMUM' using errcode='22023'; end if;
      update public.zukait_stock_balances set minimum=v_qty,updated_at=now()
        where material_id=v_material and brand_id=v_brand returning * into v_item;
    end if;
  end if;
  -- One small movement per transaction; no workshop snapshot, no large payload.
  insert into public.zukait_stock_movements
    (material_id,brand_id,action,physical_delta,reserved_delta,cost_delta,job_card,
     reservation_id,actor_id,request_id,note)
    values (v_material,v_brand,v_op,v_pdelta,v_rdelta,v_cdelta,
      nullif(v_jc,''),v_resid,v_actor,p_request_id,v_note);
  v_result:=pg_catalog.jsonb_build_object(
    'materialId',v_item.material_id,'brandId',v_item.brand_id,
    'physical',v_item.physical,'reserved',v_item.reserved,
    'available',v_item.physical-v_item.reserved,'unit',v_item.unit,
    'stockValue',v_item.stock_value,'averageCost',
       case when v_item.physical=0 then 0 else v_item.stock_value/v_item.physical end,
    'minimum',v_item.minimum,'reservationId',v_resid,
    'costDelta',v_cdelta,'physicalDelta',v_pdelta,'reservedDelta',v_rdelta
  );
  insert into public.zukait_stock_request_receipts(request_id,actor_id,action,fingerprint,result)
    values(p_request_id,v_actor,v_op,v_hash,v_result);
  return v_result;
end
$function$
;
revoke all on function public.zukait_stock_command(p_session_hash text, p_request_id text, p_action text, p_data jsonb) from public,anon,authenticated;
grant execute on function public.zukait_stock_command(p_session_hash text, p_request_id text, p_action text, p_data jsonb) to service_role;
commit;
