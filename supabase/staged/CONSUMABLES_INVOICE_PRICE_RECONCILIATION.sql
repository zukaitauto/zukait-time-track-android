-- STAGED ONLY. Apply after purchase invoice correction and price application SQL.
-- Reverse the approved costing link and correct/cancel the invoice in ONE transaction.
-- Existing stock movement guards remain authoritative; any failure rolls back all changes.
begin;
create table public.zukait_invoice_price_reconciliations(
 request_id text primary key,
 application_request_id text not null unique references public.zukait_invoice_price_applications(request_id),
 invoice_id uuid not null references public.zukait_purchase_invoices(id),
 actor_id text not null,
 fingerprint jsonb not null,
 receipt jsonb not null,
 created_at timestamptz not null default now()
);
alter table public.zukait_invoice_price_reconciliations enable row level security;
revoke all on public.zukait_invoice_price_reconciliations from public,anon,authenticated;
grant select,insert on public.zukait_invoice_price_reconciliations to service_role;

create function public.zukait_invoice_price_reconcile_commit(
 p_session_hash text,p_invoice_id uuid,p_invoice_revision integer,p_application_request_id text,
 p_request_id text,p_mode text,p_correction jsonb,p_fingerprint jsonb,p_expected_revision bigint,
 p_consumables jsonb,p_receipt jsonb,p_live jsonb
) returns jsonb language plpgsql security invoker set search_path='' as $fn$
declare
 v_actor text;v_role text;v_invoice public.zukait_purchase_invoices%rowtype;
 v_application public.zukait_invoice_price_applications%rowtype;
 v_prior public.zukait_invoice_price_reconciliations%rowtype;
 v_state public.workshop_state%rowtype;v_invoice_receipt jsonb;v_commit jsonb;v_result jsonb;
begin
 select sc.user_id::text,sc.role into v_actor,v_role from public.staff_sessions ss
 join public.staff_credentials sc on sc.user_id=ss.user_id
 where ss.token_hash=nullif(p_session_hash,'') and ss.revoked_at is null and sc.active and not coalesce(sc.must_change,false);
 if v_actor is null or v_role is distinct from 'Manager' then raise exception 'MANAGER_ONLY' using errcode='42501';end if;
 if p_request_id is null or p_request_id !~ '^[a-zA-Z0-9_.:-]{1,128}$'
 or p_mode is null or p_mode not in ('header','lines','cancel')
 or jsonb_typeof(p_correction) is distinct from 'object'
 or p_correction->>'invoiceId' is distinct from p_invoice_id::text
 or p_correction->>'expectedRevision' is distinct from p_invoice_revision::text
 or length(trim(coalesce(p_correction->>'reason',''))) not between 5 and 500
 or jsonb_typeof(p_fingerprint) is distinct from 'object'
 or octet_length(p_fingerprint::text)>262144
 or p_fingerprint->>'mode' is distinct from p_mode
 or p_fingerprint->'correction' is distinct from p_correction
 then raise exception 'INVALID_PRICE_RECONCILIATION';end if;
 -- Same advisory lock and invoice lock order as the existing correction RPC.
 perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended('zukait-invoice-correction:'||p_request_id,0));
 select * into v_invoice from public.zukait_purchase_invoices where id=p_invoice_id for update;
 if not found then raise exception 'INVOICE_NOT_FOUND';end if;
 select * into v_prior from public.zukait_invoice_price_reconciliations where request_id=p_request_id;
 if found then
  if v_prior.invoice_id<>p_invoice_id or v_prior.application_request_id<>p_application_request_id
   or v_prior.actor_id<>v_actor or v_prior.fingerprint<>p_fingerprint
  then raise exception 'REQUEST_ID_CONFLICT' using errcode='23505';end if;
  return v_prior.receipt||jsonb_build_object('replayed',true);
 end if;
 if v_invoice.status<>'posted' then raise exception 'INVOICE_CANCELLED';end if;
 if v_invoice.revision is distinct from p_invoice_revision then raise exception 'INVOICE_REVISION_CONFLICT';end if;
 select * into v_application from public.zukait_invoice_price_applications
 where invoice_id=p_invoice_id and request_id=p_application_request_id and reconciled_at is null;
 if not found then raise exception 'INVOICE_PRICE_APPLICATION_NOT_FOUND';end if;
 select * into v_state from public.workshop_state where id='main';
 if not found or v_state.revision is distinct from p_expected_revision then return jsonb_build_object('ok',false,'code','conflict');end if;
 if jsonb_typeof(p_consumables) is distinct from 'object'
 or jsonb_typeof(p_receipt) is distinct from 'object'
 or p_receipt->>'invoiceId' is distinct from p_invoice_id::text
 or p_receipt->>'invoiceRevision' is distinct from v_application.invoice_revision::text
 or p_receipt->>'applicationRequestId' is distinct from p_application_request_id
 or p_receipt->>'requestId' is distinct from p_request_id
 or (p_receipt-'requestId'::text) is distinct from p_fingerprint->'review'
 then raise exception 'INVALID_PRICE_RECONCILIATION';end if;
 if (p_consumables - ARRAY['prices','actuals','audit']::text[]) is distinct from
 ((v_state.data->'consumables') - ARRAY['prices','actuals','audit']::text[])
 then raise exception 'UNRELATED_CONSUMABLES_CHANGE';end if;
 if not exists(select 1 from jsonb_array_elements(p_consumables->'audit') a
 where a->>'type'='INVOICE_PRICE_RECONCILED' and a->>'invoiceId'=p_invoice_id::text
 and a->>'applicationRequestId'=p_application_request_id and a->>'requestId'=p_request_id
 and a->>'by'=v_actor and a->'receipt'=p_receipt)
 then raise exception 'PRICE_RECONCILIATION_AUDIT_REQUIRED';end if;
 -- Temporarily clear the active guard inside this transaction only.
 update public.zukait_invoice_price_applications set reconciled_at=now() where request_id=p_application_request_id;
 if p_mode='header' then
  v_invoice_receipt:=public.zukait_purchase_invoice_correct_header(p_session_hash,p_request_id,p_correction);
 elsif p_mode='lines' then
  v_invoice_receipt:=public.zukait_purchase_invoice_correct_lines(p_session_hash,p_request_id,p_correction);
 else
  v_invoice_receipt:=public.zukait_purchase_invoice_cancel(p_session_hash,p_request_id,p_correction);
 end if;
 if v_invoice_receipt->>'id' is distinct from p_invoice_id::text
 or v_invoice_receipt->>'revision' is distinct from (p_invoice_revision+1)::text
 then raise exception 'INVOICE_RECONCILIATION_CORRECTION_UNCONFIRMED';end if;
 v_commit:=public.zukait_commit_workshop_state_v2(v_state.revision,jsonb_set(v_state.data,'{consumables}',p_consumables,false),v_actor,p_live);
 -- Do NOT return a conflict normally here: stock and invoice writes must roll back too.
 if v_commit->>'ok' is distinct from 'true' then raise exception 'WORKSHOP_PRICE_RECONCILIATION_COMMIT_FAILED';end if;
 v_result:=jsonb_build_object('ok',true,'invoice',v_invoice_receipt,'reconciliation',p_receipt,'server_revision',(v_commit->>'revision')::bigint,'replayed',false);
 insert into public.zukait_invoice_price_reconciliations(request_id,application_request_id,invoice_id,actor_id,fingerprint,receipt)
 values(p_request_id,p_application_request_id,p_invoice_id,v_actor,p_fingerprint,v_result);
 return v_result;
end $fn$;
revoke all on function public.zukait_invoice_price_reconcile_commit(text,uuid,integer,text,text,text,jsonb,jsonb,bigint,jsonb,jsonb,jsonb) from public,anon,authenticated;
grant execute on function public.zukait_invoice_price_reconcile_commit(text,uuid,integer,text,text,text,jsonb,jsonb,bigint,jsonb,jsonb,jsonb) to service_role;
-- Unified immutable invoice timeline; original purchase input comes from the
-- original invoice fingerprint, not its current edited header.
create index zukait_invoice_price_application_history_idx on public.zukait_invoice_price_applications(invoice_id,created_at desc);
create index zukait_invoice_price_reconciliation_history_idx on public.zukait_invoice_price_reconciliations(invoice_id,created_at desc);
create or replace function public.zukait_purchase_invoice_audit_list(p_session_hash text,p_invoice_id uuid,p_page integer)
returns jsonb language plpgsql stable security invoker set search_path='' as $fn$
declare v_role text;
begin
 select sc.role into v_role from public.staff_sessions ss join public.staff_credentials sc on sc.user_id=ss.user_id
 where ss.token_hash=nullif(p_session_hash,'') and ss.revoked_at is null and sc.active and not coalesce(sc.must_change,false);
 if v_role is distinct from 'Manager' then raise exception 'MANAGER_ONLY' using errcode='42501';end if;
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
end $fn$;
revoke all on function public.zukait_purchase_invoice_audit_list(text,uuid,integer) from public,anon,authenticated;
grant execute on function public.zukait_purchase_invoice_audit_list(text,uuid,integer) to service_role;
commit;
