-- STAGED ONLY: isolated QA before any production activation.
-- No writes to workshop_state or historical Actual Materials.
create table public.zukait_purchase_invoices (
 id uuid primary key default gen_random_uuid(),
 request_id text not null unique,
 actor_id text not null,
 fingerprint jsonb not null,
 supplier text not null,
 invoice_number text not null,
 invoice_key text not null unique,
 invoice_date date not null,
 lines jsonb not null default '[]'::jsonb,
 total_amount numeric(12,3) not null default 0,
 created_at timestamptz not null default now(),
 check (total_amount>=0)
);
create index zukait_purchase_invoice_date_idx on public.zukait_purchase_invoices(invoice_date desc,created_at desc,id desc);
alter table public.zukait_purchase_invoices enable row level security;
revoke all on public.zukait_purchase_invoices from public,anon,authenticated;
grant select,insert,update on public.zukait_purchase_invoices to service_role;

create function public.zukait_purchase_invoice_save(p_session_hash text,p_request_id text,p_data jsonb)
returns jsonb language plpgsql security invoker set search_path='' as $fn$
declare
 v_actor text; v_role text; v_supplier text; v_number text; v_key text; v_date date;
 v_invoice public.zukait_purchase_invoices%rowtype; v_line jsonb; v_lines jsonb:='[]';
 v_m text; v_b text; v_unit text; v_material text; v_brand text; v_qty numeric;
 v_price numeric; v_total numeric; v_rate numeric; v_sum numeric:=0; v_method text;
 v_receipt jsonb; v_idx integer:=0; v_child text;
begin
 select sc.user_id::text,sc.role into v_actor,v_role from public.staff_sessions ss
 join public.staff_credentials sc on sc.user_id=ss.user_id
 where ss.token_hash=nullif(p_session_hash,'') and ss.revoked_at is null and sc.active and not coalesce(sc.must_change,false);
 if v_actor is null or v_role not in ('Manager','Supervisor') then raise exception 'STOCK_FORBIDDEN' using errcode='42501'; end if;
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
  if not found then raise exception 'STOCK_PAIR_NOT_LINKED'; end if;
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
end $fn$;
revoke all on function public.zukait_purchase_invoice_save(text,text,jsonb) from public,anon,authenticated;
grant execute on function public.zukait_purchase_invoice_save(text,text,jsonb) to service_role;

create function public.zukait_purchase_invoice_list(p_session_hash text,p_page integer,p_query text,p_from date,p_to date)
returns jsonb language plpgsql stable security invoker set search_path='' as $fn$
declare v_role text;
begin
 select sc.role into v_role from public.staff_sessions ss join public.staff_credentials sc on sc.user_id=ss.user_id
 where ss.token_hash=nullif(p_session_hash,'') and ss.revoked_at is null and sc.active and not coalesce(sc.must_change,false);
 if v_role is null or v_role not in ('Manager','Supervisor') then raise exception 'STOCK_FORBIDDEN' using errcode='42501'; end if;
 if p_page is null or p_page not between 0 and 100 or length(coalesce(p_query,''))>160 or (p_from is not null and p_to is not null and p_from>p_to) then raise exception 'INVALID_INVOICE_FILTER'; end if;
 return (select coalesce(jsonb_agg(to_jsonb(q)-'fingerprint'-'invoice_key' order by q.invoice_date desc,q.created_at desc,q.id desc),'[]'::jsonb)
 from (select * from public.zukait_purchase_invoices i where (p_from is null or invoice_date>=p_from) and (p_to is null or invoice_date<=p_to)
 and (coalesce(p_query,'')='' or strpos(lower(i.supplier||' '||i.invoice_number||' '||i.lines::text),lower(trim(p_query)))>0)
 order by invoice_date desc,created_at desc,id desc limit 51 offset p_page*50) q);
end $fn$;
revoke all on function public.zukait_purchase_invoice_list(text,integer,text,date,date) from public,anon,authenticated;
grant execute on function public.zukait_purchase_invoice_list(text,integer,text,date,date) to service_role;
