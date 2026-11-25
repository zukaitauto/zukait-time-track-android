-- STAGED ONLY. Exact production definitions, narrowed Stock-specific Accountant permission; no global role changes.
begin;
CREATE OR REPLACE FUNCTION public.zukait_invoice_price_apply_commit(p_session_hash text, p_invoice_id uuid, p_invoice_revision integer, p_request_id text, p_fingerprint jsonb, p_expected_revision bigint, p_consumables jsonb, p_receipt jsonb, p_live jsonb)
 RETURNS jsonb
 LANGUAGE plpgsql
 SET search_path TO ''
AS $function$
declare
 v_actor text; v_role text; v_invoice public.zukait_purchase_invoices%rowtype;
 v_prior public.zukait_invoice_price_applications%rowtype;
 v_state public.workshop_state%rowtype; v_candidate jsonb; v_commit jsonb; v_receipt jsonb;
begin
 select sc.user_id::text,sc.role into v_actor,v_role from public.staff_sessions ss
 join public.staff_credentials sc on sc.user_id=ss.user_id
 where ss.token_hash=nullif(p_session_hash,'') and ss.revoked_at is null
 and sc.active and not coalesce(sc.must_change,false);
 if v_actor is null or (v_role is null or v_role not in ('Manager','Accountant')) then
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
 -- An active application cannot share an owned price ID with another invoice.
 -- Concurrent applications also serialize through workshop revision CAS.
 if exists(select 1 from public.zukait_invoice_price_applications a
 cross join lateral jsonb_array_elements(a.receipt->'changes') existing
 cross join lateral jsonb_array_elements(p_receipt->'changes') proposed
 where a.reconciled_at is null and a.invoice_id<>p_invoice_id
 and existing->>'priceId'=proposed->>'priceId')
 then raise exception 'INVOICE_PRICE_SOURCE_CONFLICT';end if;
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
end $function$;

CREATE OR REPLACE FUNCTION public.zukait_invoice_price_reconcile_commit(p_session_hash text, p_invoice_id uuid, p_invoice_revision integer, p_application_request_id text, p_request_id text, p_mode text, p_correction jsonb, p_fingerprint jsonb, p_expected_revision bigint, p_consumables jsonb, p_receipt jsonb, p_live jsonb)
 RETURNS jsonb
 LANGUAGE plpgsql
 SET search_path TO ''
AS $function$
declare
 v_actor text;v_role text;v_invoice public.zukait_purchase_invoices%rowtype;
 v_application public.zukait_invoice_price_applications%rowtype;
 v_prior public.zukait_invoice_price_reconciliations%rowtype;
 v_state public.workshop_state%rowtype;v_invoice_receipt jsonb;v_commit jsonb;v_result jsonb;
begin
 select sc.user_id::text,sc.role into v_actor,v_role from public.staff_sessions ss
 join public.staff_credentials sc on sc.user_id=ss.user_id
 where ss.token_hash=nullif(p_session_hash,'') and ss.revoked_at is null and sc.active and not coalesce(sc.must_change,false);
 if v_actor is null or (v_role is null or v_role not in ('Manager','Accountant')) then raise exception 'MANAGER_ONLY' using errcode='42501';end if;
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
end $function$;
revoke all on function public.zukait_invoice_price_apply_commit(text,uuid,integer,text,jsonb,bigint,jsonb,jsonb,jsonb),public.zukait_invoice_price_reconcile_commit(text,uuid,integer,text,text,text,jsonb,jsonb,bigint,jsonb,jsonb,jsonb) from public,anon,authenticated;
grant execute on function public.zukait_invoice_price_apply_commit(text,uuid,integer,text,jsonb,bigint,jsonb,jsonb,jsonb),public.zukait_invoice_price_reconcile_commit(text,uuid,integer,text,text,text,jsonb,jsonb,bigint,jsonb,jsonb,jsonb) to service_role;
commit;
