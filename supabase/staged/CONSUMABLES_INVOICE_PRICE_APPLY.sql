-- STAGED ONLY. Requires invoice correction schema and existing workshop commit RPC.
-- No automatic deployment. Test on isolated PostgreSQL before enabling the route.
begin;
create table public.zukait_invoice_price_applications(
 invoice_id uuid not null references public.zukait_purchase_invoices(id),
 invoice_revision integer not null check(invoice_revision>0),
 request_id text primary key,
 actor_id text not null,
 fingerprint jsonb not null,
 receipt jsonb not null,
 workshop_revision bigint not null,
 created_at timestamptz not null default now(),
 reconciled_at timestamptz
);
create unique index zukait_invoice_price_active_idx on public.zukait_invoice_price_applications(invoice_id) where reconciled_at is null;
alter table public.zukait_invoice_price_applications enable row level security;
revoke all on public.zukait_invoice_price_applications from public,anon,authenticated;
grant select,insert,update on public.zukait_invoice_price_applications to service_role;

-- Both the application RPC and existing correction/cancel RPCs serialize on
-- the invoice row. Once applied, require explicit reconciliation rather than
-- silently reversing or changing historical costing.
create function public.zukait_invoice_price_reconciliation_guard()
returns trigger language plpgsql security invoker set search_path='' as $fn$
begin
 if (new.revision,new.status,new.invoice_date,new.lines) is distinct from
    (old.revision,old.status,old.invoice_date,old.lines)
 and exists(select 1 from public.zukait_invoice_price_applications where invoice_id=old.id and reconciled_at is null)
 then raise exception 'INVOICE_PRICE_RECONCILIATION_REQUIRED' using errcode='23514'; end if;
 return new;
end $fn$;
revoke all on function public.zukait_invoice_price_reconciliation_guard() from public,anon,authenticated;
grant execute on function public.zukait_invoice_price_reconciliation_guard() to service_role;
create trigger zukait_invoice_price_reconciliation_guard
before update on public.zukait_purchase_invoices for each row
execute function public.zukait_invoice_price_reconciliation_guard();

-- Only a trusted Edge handler may supply the server-computed candidate and live
-- projection. A browser never sends workshop state or an authoritative receipt.
create function public.zukait_invoice_price_apply_commit(
 p_session_hash text,p_invoice_id uuid,p_invoice_revision integer,p_request_id text,
 p_fingerprint jsonb,p_expected_revision bigint,p_consumables jsonb,p_receipt jsonb,p_live jsonb
) returns jsonb language plpgsql security invoker set search_path='' as $fn$
declare
 v_actor text; v_role text; v_invoice public.zukait_purchase_invoices%rowtype;
 v_prior public.zukait_invoice_price_applications%rowtype;
 v_state public.workshop_state%rowtype; v_candidate jsonb; v_commit jsonb; v_receipt jsonb;
begin
 select sc.user_id::text,sc.role into v_actor,v_role from public.staff_sessions ss
 join public.staff_credentials sc on sc.user_id=ss.user_id
 where ss.token_hash=nullif(p_session_hash,'') and ss.revoked_at is null
 and sc.active and not coalesce(sc.must_change,false);
 if v_actor is null or v_role is distinct from 'Manager' then
  raise exception 'MANAGER_ONLY' using errcode='42501';end if;
 if p_request_id is null or p_request_id !~ '^[a-zA-Z0-9_.:-]{1,128}$'
 or jsonb_typeof(p_fingerprint) is distinct from 'object'
 or octet_length(p_fingerprint::text)>262144
 then raise exception 'INVALID_PRICE_APPLICATION';end if;
 perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended('zukait-invoice-price:'||p_request_id,0));
 select * into v_invoice from public.zukait_purchase_invoices where id=p_invoice_id for update;
 if not found then raise exception 'INVOICE_NOT_FOUND';end if;
 select * into v_prior from public.zukait_invoice_price_applications where request_id=p_request_id;
 if found then
  if v_prior.invoice_id<>p_invoice_id or v_prior.invoice_revision is distinct from p_invoice_revision
   or v_prior.actor_id<>v_actor or v_prior.fingerprint<>p_fingerprint
  then raise exception 'REQUEST_ID_CONFLICT' using errcode='23505';end if;
  return v_prior.receipt||jsonb_build_object('replayed',true);
 end if;
 if v_invoice.status<>'posted' then raise exception 'INVOICE_CANCELLED';end if;
 if v_invoice.revision is distinct from p_invoice_revision then raise exception 'INVOICE_REVISION_CONFLICT';end if;
 if exists(select 1 from public.zukait_invoice_price_applications where invoice_id=p_invoice_id and reconciled_at is null)
 then raise exception 'INVOICE_PRICE_RECONCILIATION_REQUIRED';end if;
 -- The existing workshop commit RPC owns the state lock and CAS; do not
 -- invert its lock order by taking a separate workshop row lock first.
 select * into v_state from public.workshop_state where id='main';
 if not found or v_state.revision is distinct from p_expected_revision then
  return jsonb_build_object('ok',false,'code','conflict');end if;
 if jsonb_typeof(p_consumables) is distinct from 'object'
 or jsonb_typeof(p_receipt) is distinct from 'object'
 or p_receipt->>'invoiceId' is distinct from p_invoice_id::text
 or p_receipt->>'invoiceRevision' is distinct from p_invoice_revision::text
 or p_receipt->>'requestId' is distinct from p_request_id
 or jsonb_typeof(p_receipt->'changes') is distinct from 'array'
 then raise exception 'INVALID_PRICE_APPLICATION';end if;
 if jsonb_array_length(p_receipt->'changes')=0 then raise exception 'INVALID_PRICE_APPLICATION';end if;
 if (p_consumables - ARRAY['prices','actuals','audit']::text[]) is distinct from
    ((v_state.data->'consumables') - ARRAY['prices','actuals','audit']::text[])
 then raise exception 'UNRELATED_CONSUMABLES_CHANGE';end if;
 if not exists(select 1 from jsonb_array_elements(p_consumables->'audit') a
 where a->>'type'='INVOICE_PRICE_APPLIED' and a->>'invoiceId'=p_invoice_id::text
 and a->>'invoiceRevision'=p_invoice_revision::text and a->>'requestId'=p_request_id
 and a->>'by'=v_actor and a->'receipt'=p_receipt)
 then raise exception 'PRICE_APPLICATION_AUDIT_REQUIRED';end if;
 v_candidate:=jsonb_set(v_state.data,'{consumables}',p_consumables,false);
 v_commit:=public.zukait_commit_workshop_state_v2(v_state.revision,v_candidate,v_actor,p_live);
 if v_commit->>'code'='conflict' and v_commit->>'ok' is distinct from 'true' then
  return jsonb_build_object('ok',false,'code','conflict');end if;
 if v_commit->>'ok' is distinct from 'true' then
  raise exception 'WORKSHOP_PRICE_COMMIT_FAILED';end if;
 v_receipt:=p_receipt||jsonb_build_object('ok',true,'server_revision',(v_commit->>'revision')::bigint,'replayed',false);
 insert into public.zukait_invoice_price_applications(invoice_id,invoice_revision,request_id,actor_id,fingerprint,receipt,workshop_revision)
 values(p_invoice_id,p_invoice_revision,p_request_id,v_actor,p_fingerprint,v_receipt,(v_commit->>'revision')::bigint);
 return v_receipt;
end $fn$;
revoke all on function public.zukait_invoice_price_apply_commit(text,uuid,integer,text,jsonb,bigint,jsonb,jsonb,jsonb) from public,anon,authenticated;
grant execute on function public.zukait_invoice_price_apply_commit(text,uuid,integer,text,jsonb,bigint,jsonb,jsonb,jsonb) to service_role;
commit;
