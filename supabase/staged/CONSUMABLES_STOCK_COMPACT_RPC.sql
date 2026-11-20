-- ZUKAIT Consumables Stock atomic transaction RPC.
-- STAGED ONLY. Requires CONSUMABLES_STOCK_COMPACT_FOUNDATION.sql and a trusted
-- one-time catalog-key import. Do not apply to production without isolated PG17 tests.
-- Direct callers: only service_role Workshop API, never browser/client.
-- The staff session is revalidated INSIDE the same DB transaction as the stock write.
create or replace function public.zukait_stock_command(
  p_session_hash text, p_request_id text, p_action text, p_data jsonb
) returns jsonb
language plpgsql security invoker set search_path = ''
as $stock$
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
  if v_actor is null or v_role not in ('Manager','Supervisor')
    then raise exception 'STOCK_FORBIDDEN' using errcode='42501'; end if;
  if v_op in ('OPENING','ADJUST','MINIMUM') and v_role<>'Manager'
    then raise exception 'MANAGER_ONLY' using errcode='42501'; end if;
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
    if v_qty is null or v_qty<0 or v_price is null or v_price<0
      then raise exception 'INVALID_OPENING' using errcode='22023'; end if;
    v_total:=v_qty*v_price;
    insert into public.zukait_stock_balances(material_id,brand_id,unit,physical,reserved,stock_value)
      values(v_material,v_brand,v_unit,v_qty,0,v_total)
      returning * into v_item;
    v_pdelta:=v_qty; v_cdelta:=v_total;
  else
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
$stock$;
revoke all on function public.zukait_stock_command(text,text,text,jsonb)
  from public,anon,authenticated;
grant execute on function public.zukait_stock_command(text,text,text,jsonb) to service_role;
