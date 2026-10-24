-- Disposable candidate only. Install after accountant-bill-posting.sql.
-- Exact-entity index supports a bounded replay, never workshop history.
create index if not exists accountant_parts_receipt_events on public.workshop_v2_events(entity_id,server_time,event_id);
create function zukait_bills.parts_receipt(pid text) returns jsonb
language plpgsql security invoker set search_path=pg_catalog as $$
declare
 s public.workshop_v2_spare_part_state; events jsonb; e jsonb; p jsonb; a jsonb;
 item jsonb:='{}'; price jsonb; price_rev bigint:=0; commercial_rev bigint:=0; edit_rev bigint:=0;
 rev bigint; received_at timestamptz; priced_at timestamptz; event_at timestamptz; previous_at timestamptz;
 cost numeric; qty numeric; listed boolean:=false;
begin
 -- The existing event projection takes this exact row lock, including price-only events.
 select * into s from public.workshop_v2_spare_part_state where part_id=pid for update;
 if not found or s.status not in ('RECEIVED','SUPERVISOR_VERIFIED','DENTER_CHECKED','SUPERVISOR_CONFIRMED','FITTED') or s.job_card in ('','ID001') then raise exception 'bill_receipt_review';end if;
 select jsonb_agg(to_jsonb(x) order by server_time,event_id) into events from
 (select event_id,event_type,server_time,revision,payload from public.workshop_v2_events where entity_id=pid order by server_time,event_id limit 201) x;
 if events is null then raise exception 'bill_receipt_review';end if;
 if jsonb_array_length(events)>200 or octet_length(events::text)>1000000 then raise exception 'bill_scope_limit';end if;
 for e in select value from jsonb_array_elements(events) loop
  p:=e->'payload';a:=p->'after';rev:=coalesce((e->>'revision')::bigint,0);event_at:=(e->>'server_time')::timestamptz;
  -- Existing JS replay has no event-id tie breaker: ambiguous ordering needs review.
  if event_at>now() or event_at<date '1900-01-01' or event_at=previous_at or jsonb_typeof(p)<>'object'
   or (p->>'partId' is not null and p->>'partId'<>pid)
   or (p->>'listNo' is not null and p->>'listNo'<>s.list_no)
   or (p->>'jobCard' is not null and p->>'jobCard'<>s.job_card) then raise exception 'bill_receipt_review';end if;
  previous_at:=event_at;
  if e->>'event_type'='SPARE_PART_LISTED' then
   if listed then raise exception 'bill_receipt_review';end if;listed:=true;item:=p;continue;
  end if;
  if not listed then raise exception 'bill_receipt_review';end if;
  -- Return/reorder cycles need the separate credit/allocation policy, never silent netting.
  if e->>'event_type'='SPARE_PART_RETURN_CANCELLED' or (e->>'event_type'='SPARE_PART_STATUS_CHANGED' and (p->>'to'='RETURNED' or p->>'from'='RETURNED')) or a->>'status'='RETURNED' then raise exception 'bill_return_review';end if;
  if e->>'event_type'='SPARE_PART_STATUS_CHANGED' then
   if p->>'from'='RECEIVED' and p->>'to'='ORDERED' then raise exception 'bill_receipt_review';end if;
   if p->>'to'='RECEIVED' then
    if coalesce(p->>'receivedQty','')!~'^[0-9]+(\.[0-9]{1,6})?$' then raise exception 'bill_receipt_review';end if;
    item:=item||jsonb_build_object('receivedQty',p->'receivedQty');received_at:=event_at;
   end if;
  elsif e->>'event_type'='SPARE_PART_COMMERCIAL_UPDATED' then
   if rev>=commercial_rev then
    if p ? 'purchaseAmount' then price:=p->'purchaseAmount';priced_at:=event_at;end if;commercial_rev:=rev;
   end if;
  elsif e->>'event_type'='SPARE_PART_FINAL_PRICE_RECORDED' then
   if rev>=price_rev then price:=p->'finalPrice';priced_at:=event_at;price_rev:=rev;end if;
  elsif e->>'event_type' in ('SPARE_PART_ITEM_EDITED','SPARE_PART_MANAGER_CORRECTED','SPARE_PART_SUPERVISOR_CORRECTED') then
   if jsonb_typeof(a) is distinct from 'object' or a->>'deletedAt' is not null then raise exception 'bill_receipt_review';end if;
   if rev>=edit_rev then
    item:=item||a;edit_rev:=rev;
    if a ? 'purchaseAmount' then price:=a->'purchaseAmount';priced_at:=event_at;end if;
   end if;
  elsif e->>'event_type'<>'SPARE_PART_ARRIVAL_ACCEPTED' then raise exception 'bill_receipt_review';end if;
 end loop;
 if not listed or received_at is null or priced_at is null or s.received_qty<=0 or s.received_qty>s.ordered_qty
  or coalesce(item->>'qty','')!~'^[0-9]+(\.[0-9]{1,6})?$' or coalesce(item->>'receivedQty','')!~'^[0-9]+(\.[0-9]{1,6})?$'
  or (item->>'qty')::numeric<>s.ordered_qty or (item->>'receivedQty')::numeric<>s.received_qty
  or jsonb_typeof(price) not in ('number','string') or coalesce(price#>>'{}','')!~'^(0|[1-9][0-9]*)(\.[0-9]{1,3})?$'
  or length(price#>>'{}')>24 then raise exception 'bill_receipt_review';end if;
 qty:=s.received_qty;cost:=round((price#>>'{}')::numeric*qty*1000);
 if (price#>>'{}')::numeric>1000000 or cost<=0 or cost>9007199254740991 then raise exception 'bill_receipt_review';end if;
 return jsonb_build_object('id',pid,'receivedCostMills',cost::bigint,'receivedQuantity',qty,
  'receiptDate',(received_at at time zone 'Asia/Muscat')::date,
  'costDate',(priced_at at time zone 'Asia/Muscat')::date,
  'receiptDigest',md5(jsonb_build_object('state',to_jsonb(s),'events',events)::text));
end $$;
revoke all on function zukait_bills.parts_receipt(text) from public,anon,authenticated;
grant execute on function zukait_bills.parts_receipt(text) to service_role;
