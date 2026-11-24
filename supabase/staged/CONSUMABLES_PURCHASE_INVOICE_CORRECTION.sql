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
