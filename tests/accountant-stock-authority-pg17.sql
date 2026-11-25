\set ON_ERROR_STOP on
create role anon;
create role authenticated;
create role service_role;
create table public.staff_credentials(user_id text primary key,role text not null,active boolean not null default true,must_change boolean not null default false);
create table public.staff_sessions(token_hash text primary key,user_id text references public.staff_credentials(user_id),revoked_at timestamptz);
insert into public.staff_credentials(user_id,role) values ('A1','Accountant'),('M1','Manager'),('S1','Supervisor'),('P1','Purchaser'),('E1','Employee');
insert into public.staff_sessions(token_hash,user_id) select 'token-'||user_id,user_id from public.staff_credentials;
\ir ../supabase/staged/CONSUMABLES_STOCK_COMPACT_FOUNDATION.sql
\ir ../supabase/staged/CONSUMABLES_PURCHASE_INVOICE_ATOMIC.sql
\ir ../supabase/staged/CONSUMABLES_PURCHASE_INVOICE_CORRECTION.sql
-- Minimal schema fixtures for the price-audit reader; no price application changes tested here.
create table public.zukait_invoice_price_applications(request_id text primary key,invoice_id uuid,actor_id text,fingerprint jsonb,receipt jsonb,created_at timestamptz default now(),reconciled_at timestamptz);
create table public.zukait_invoice_price_reconciliations(request_id text primary key,invoice_id uuid,actor_id text,fingerprint jsonb,receipt jsonb,created_at timestamptz default now());
\ir ../supabase/staged/ACCOUNTANT_STOCK_ENTRY_AUTHORITY.sql
insert into public.zukait_stock_material_keys(material_id,display_name,department,unit) values('m','Primer','Both','Liter');
insert into public.zukait_stock_brand_keys(brand_id,display_name) values('b','QA brand');
insert into public.zukait_stock_balances(material_id,brand_id,unit) values('m','b','Liter');
do $$
declare
 opening jsonb:='{"materialId":"m","brandId":"b","quantity":2,"unitCost":3,"countConfirmed":true,"reason":"Physical QA count"}';
 purchase jsonb:=jsonb_build_object('supplier','QA supplier','invoiceNumber','QA-001','invoiceDate',(now() at time zone 'Asia/Muscat')::date::text,'lines','[{"materialId":"m","brandId":"b","unit":"Liter","quantity":3,"priceMethod":"unit","price":4}]'::jsonb);
 saved jsonb; change jsonb; corrected jsonb; id uuid; result jsonb;
begin
 result:=public.zukait_stock_command('token-A1','opening-1','OPENING',opening);
 if public.zukait_stock_command('token-A1','opening-1','OPENING',opening) is distinct from result then raise exception 'opening replay mismatch';end if;
 begin perform public.zukait_stock_command('token-A1','opening-2','OPENING',opening);raise exception 'duplicate opening accepted';exception when unique_violation then if sqlerrm<>'OPENING_ALREADY_RECORDED' then raise;end if;end;
 begin perform public.zukait_stock_command('token-A1','direct-purchase','PURCHASE','{"materialId":"m","brandId":"b","quantity":3,"priceMethod":"unit","price":4}');raise exception 'direct purchase accepted';exception when insufficient_privilege then null;end;
 saved:=public.zukait_purchase_invoice_save('token-A1','invoice-1',purchase);id:=(saved->>'id')::uuid;
 if saved->>'actor_id'<>'A1' or public.zukait_purchase_invoice_save('token-A1','invoice-1',purchase) is distinct from saved then raise exception 'invoice identity or replay mismatch';end if;
 if (select physical from public.zukait_stock_balances where material_id='m' and brand_id='b')<>5 then raise exception 'stock duplicated or missing';end if;
 begin perform public.zukait_purchase_invoice_save('token-A1','invoice-duplicate',purchase);raise exception 'duplicate reference accepted';exception when unique_violation then null;end;
 change:=jsonb_build_object('invoiceId',id,'expectedRevision',1,'supplier','QA corrected supplier','invoiceNumber','QA-002','invoiceDate',purchase->>'invoiceDate','reason','QA reference correction');
 corrected:=public.zukait_purchase_invoice_correct_header('token-A1','correction-1',change);
 if corrected->>'revision'<>'2' or public.zukait_purchase_invoice_correct_header('token-A1','correction-1',change) is distinct from corrected then raise exception 'correction replay mismatch';end if;
 change:=jsonb_build_object('invoiceId',id,'expectedRevision',2,'reason','QA quantity correction','lines','[{"materialId":"m","brandId":"b","unit":"Liter","quantity":4,"priceMethod":"unit","price":4}]'::jsonb);
 corrected:=public.zukait_purchase_invoice_correct_lines('token-A1','correction-2',change);
 if corrected->>'revision'<>'3' or public.zukait_purchase_invoice_correct_lines('token-A1','correction-2',change) is distinct from corrected then raise exception 'line correction replay mismatch';end if;
 if (select physical from public.zukait_stock_balances where material_id='m' and brand_id='b')<>6 then raise exception 'line delta mismatch';end if;
 if (select stock_value from public.zukait_stock_balances where material_id='m' and brand_id='b')<>22 then raise exception 'valuation mismatch';end if;
 if jsonb_array_length(public.zukait_purchase_invoice_audit_list('token-A1',id,0))<>3 then raise exception 'missing audit';end if;
 if exists(select 1 from public.zukait_stock_movements where actor_id<>'A1') or exists(select 1 from public.zukait_purchase_invoice_audit where actor_id<>'A1') then raise exception 'actor mismatch';end if;
 begin perform public.zukait_purchase_invoice_save('token-P1','p1',purchase);raise exception 'Purchaser invoice accepted';exception when insufficient_privilege then null;end;
 begin perform public.zukait_stock_command('token-A1','adjust-1','ADJUST',opening);raise exception 'Accountant adjustment accepted';exception when insufficient_privilege then null;end;
 begin perform public.zukait_purchase_invoice_cancel('token-A1','cancel-1',jsonb_build_object('invoiceId',id,'expectedRevision',3,'reason','QA cancellation'));raise exception 'Accountant cancel accepted';exception when insufficient_privilege then null;end;
 begin perform public.zukait_purchase_invoice_audit_list('token-S1',id,0);raise exception 'Supervisor audit accepted';exception when insufficient_privilege then null;end;
 if has_function_privilege('authenticated','public.zukait_purchase_invoice_save(text,text,jsonb)','execute') or has_function_privilege('anon','public.zukait_stock_command(text,text,text,jsonb)','execute') then raise exception 'public RPC exposure';end if;
end $$;
select 'PASS: actual PostgreSQL opening, atomic invoice, exact retries, duplicate prevention, corrections, actor audit and permission denial' as result;
