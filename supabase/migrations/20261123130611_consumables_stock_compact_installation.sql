SET LOCAL lock_timeout='2s';
SET LOCAL statement_timeout='15s';
-- ZUKAIT Consumables Stock: compact, isolated schema (STAGED; DO NOT APPLY TO PRODUCTION).
-- Generated source draft; run through Supabase migration CLI and isolated PG17 QA before deployment.
-- Material names and brands remain authoritative in the EXISTING Consumables Master.
-- Catalog keys below are small authorization references, not duplicate material names.
-- No full JSON workshop_state snapshots and no triggers on workshop_state.

create table if not exists public.zukait_stock_material_keys (
  material_id text primary key,
  display_name text not null default '' check (length(display_name)<=180),
  department text not null default 'Unassigned' check (department in ('Unassigned','Mechanical','Painting','Both')),
  unit text not null check (unit in ('Liter','kg','Piece')),
  active boolean not null default true
);
create table if not exists public.zukait_stock_brand_keys (
  brand_id text primary key,
  display_name text not null default '' check (length(display_name)<=180),
  active boolean not null default true
);
create table if not exists public.zukait_stock_balances (
  material_id text not null references public.zukait_stock_material_keys(material_id),
  brand_id text not null references public.zukait_stock_brand_keys(brand_id),
  unit text not null check (unit in ('Liter','kg','Piece')),
  physical numeric(18,4) not null default 0 check (physical >= 0),
  reserved numeric(18,4) not null default 0 check (reserved >= 0 and reserved <= physical),
  stock_value numeric(20,8) not null default 0 check (stock_value >= 0),
  minimum numeric(18,4) not null default 0 check (minimum >= 0),
  opened_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key (material_id,brand_id)
);
create table if not exists public.zukait_stock_reservations (
  id uuid primary key default gen_random_uuid(),
  material_id text not null,
  brand_id text not null,
  job_card text not null check (length(job_card) between 1 and 36),
  status text not null default 'reserved' check (status in ('reserved','finalised','cancelled')),
  reserved_qty numeric(18,4) not null default 0 check (reserved_qty >= 0),
  actual_qty numeric(18,4) not null default 0 check (actual_qty >= 0),
  final_cost numeric(20,8) not null default 0 check (final_cost >= 0),
  returned_qty numeric(18,4) not null default 0 check (returned_qty >= 0),
  return_credit numeric(20,8) not null default 0 check (return_credit >= 0),
  created_by text not null,
  created_at timestamptz not null default now(),
  finalised_at timestamptz,
  foreign key (material_id,brand_id) references public.zukait_stock_balances(material_id,brand_id)
);
create index if not exists zukait_stock_res_job_idx
  on public.zukait_stock_reservations(job_card,status);
create table if not exists public.zukait_stock_reservation_lots (
  id bigint generated always as identity primary key,
  reservation_id uuid not null references public.zukait_stock_reservations(id),
  quantity numeric(18,4) not null check (quantity > 0),
  unit_cost numeric(20,8) not null check (unit_cost >= 0),
  used_qty numeric(18,4) not null default 0 check (used_qty >= 0 and used_qty <= quantity),
  returned_qty numeric(18,4) not null default 0 check (returned_qty >= 0 and returned_qty <= used_qty)
);
create index if not exists zukait_stock_lots_res_idx
  on public.zukait_stock_reservation_lots(reservation_id,id);
-- Small, append-only records. Never store full before/after workshop_state.
create table if not exists public.zukait_stock_movements (
  id bigint generated always as identity primary key,
  material_id text not null,
  brand_id text not null,
  action text not null check (action in (
    'OPENING','PURCHASE','RESERVE','CHANGE','CANCEL','FINALISE','RETURN','ADJUST','MINIMUM','MECHANICAL_ISSUE','MECHANICAL_RETURN')),
  physical_delta numeric(18,4) not null default 0,
  reserved_delta numeric(18,4) not null default 0,
  cost_delta numeric(20,8) not null default 0,
  job_card text,
  reservation_id uuid,
  actor_id text not null,
  request_id text not null unique,
  note text not null default '' check (length(note) <= 240),
  recorded_at timestamptz not null default now()
);
create index if not exists zukait_stock_move_item_idx
  on public.zukait_stock_movements(material_id,brand_id,id desc);
create index if not exists zukait_stock_move_month_idx
  on public.zukait_stock_movements(recorded_at desc);
-- Response receipt only; bounded command payload (<= 2KB), never bulk state.
create table if not exists public.zukait_stock_request_receipts (
  request_id text primary key,
  actor_id text not null,
  action text not null,
  fingerprint text not null,
  result jsonb not null,
  created_at timestamptz not null default now()
);
-- Keep every stock table private to the service-role Workshop API.
-- The actual identity is validated against staff_sessions again inside the write RPC.
do $$
declare rel text;
begin
  foreach rel in array array[
    'zukait_stock_material_keys','zukait_stock_brand_keys','zukait_stock_balances',
    'zukait_stock_reservations','zukait_stock_reservation_lots',
    'zukait_stock_movements','zukait_stock_request_receipts'
  ] loop
    execute format('alter table public.%I enable row level security',rel);
    execute format('revoke all on table public.%I from public, anon, authenticated',rel);
    execute format('grant select,insert,update,delete on table public.%I to service_role',rel);
  end loop;
end $$;
-- Identity sequence access is handled by owner/service_role; never grant all public sequences.
-- No policies for anon/authenticated: even an authenticated user cannot directly read or mutate stock.
-- One-time catalog-key import must come from trusted server-verified existing material/brand master.
-- No automatic deletion of financial history; archive old movements ONLY after verified offline export.

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
$stock$;
revoke all on function public.zukait_stock_command(text,text,text,jsonb)
  from public,anon,authenticated;
grant execute on function public.zukait_stock_command(text,text,text,jsonb) to service_role;

-- Staged only. Link one Manager-approved material+brand pair to the tiny Stock
-- catalog AFTER the existing workshop-state save has succeeded. Do NOT deploy
-- without the compact-stock schema, role acceptance and rollback rehearsal.
-- This is a canonical-key projection, NOT another Materials/Brand Master.
--
-- Reads ONLY the existing main consumables subdocument, once per Manager
-- material edit. No full-history queries, new workshop snapshots or triggers.
create or replace function public.zukait_stock_link_master(
 p_session_hash text,p_material_id text,p_brand_id text,p_origin text
) returns jsonb
language plpgsql security invoker set search_path=''
as $link$
declare
 v_actor text;
 v_role text;
 v_master jsonb;
 v_material jsonb;
 v_brand jsonb;
 v_unit text;
 v_name text;
 v_brand_name text;
 v_category text;
 v_saved_scope text;
 v_scope text;
 v_final_scope text;
begin
 if nullif(p_session_hash,'') is null then
   raise exception 'STOCK_FORBIDDEN' using errcode='42501';end if;
 if p_origin not in ('Mechanical','Painting','Both') then
   raise exception 'INVALID_MASTER_ORIGIN' using errcode='22023';end if;
 if p_material_id is null or p_material_id='' or length(p_material_id)>120 or
    p_material_id !~ '^[a-zA-Z0-9_.:-]+$' or
    p_brand_id is null or p_brand_id='' or length(p_brand_id)>120 or
    p_brand_id !~ '^[a-zA-Z0-9_.:-]+$' then
   raise exception 'INVALID_MASTER_KEY' using errcode='22023';end if;

 -- Revalidate the session inside the DB RPC. A client-provided role is never trusted.
 select sc.user_id::text,sc.role into v_actor,v_role
 from public.staff_sessions ss
 join public.staff_credentials sc on sc.user_id=ss.user_id
 where ss.token_hash=p_session_hash and ss.revoked_at is null
   and sc.active=true and coalesce(sc.must_change,false)=false;
 if v_actor is null or v_role<>'Manager' then
   raise exception 'MANAGER_ONLY' using errcode='42501';end if;

 -- Authoritative source: the ALREADY-SAVED existing Consumables Master.
 -- Never accept names, units, price, department or active flags from a phone.
 select ws.data->'consumables' into v_master
 from public.workshop_state ws where ws.id='main';
 if v_master is null then raise exception 'MASTER_NOT_SAVED' using errcode='22023';end if;
 select item into v_material
 from pg_catalog.jsonb_array_elements(
   case when pg_catalog.jsonb_typeof(v_master->'materials')='array'
     then v_master->'materials' else '[]'::jsonb end) as row(item)
 where row.item->>'id'=p_material_id
   and row.item->>'active' is distinct from 'false' limit 1;
 select item into v_brand
 from pg_catalog.jsonb_array_elements(
   case when pg_catalog.jsonb_typeof(v_master->'brands')='array'
     then v_master->'brands' else '[]'::jsonb end) as row(item)
 where row.item->>'id'=p_brand_id
   and row.item->>'active' is distinct from 'false' limit 1;
 if v_material is null or v_brand is null or not exists (
   select 1 from pg_catalog.jsonb_array_elements(
     case when pg_catalog.jsonb_typeof(v_master->'prices')='array'
       then v_master->'prices' else '[]'::jsonb end) as row(item)
   where row.item->>'materialId'=p_material_id and row.item->>'brandId'=p_brand_id
     and row.item->>'voided' is distinct from 'true'
 ) then raise exception 'MASTER_NOT_SAVED' using errcode='22023';end if;

 v_unit:=trim(coalesce(v_material->>'unit',''));
 v_name:=trim(coalesce(v_material->>'name',''));
 v_brand_name:=trim(coalesce(v_brand->>'name',''));
 v_category:=coalesce(v_material->>'category','Consumable');
 v_saved_scope:=coalesce(nullif(trim(v_material->>'department'),''),'Unassigned');
 if v_saved_scope not in ('Unassigned','Mechanical','Painting','Both') then
   raise exception 'INVALID_MASTER' using errcode='22023';end if;
 -- New materials are classified in the saved Master. Clients cannot change
 -- their scope during Stock linking; only legacy Unassigned rows can be mapped.
 if v_saved_scope<>'Unassigned' and p_origin<>v_saved_scope then
   raise exception 'MASTER_SCOPE_MISMATCH' using errcode='22023';end if;
 if v_unit not in ('Liter','kg','Piece') or length(v_name) not between 1 and 180
    or length(v_brand_name) not between 1 and 180 then
   raise exception 'INVALID_MASTER' using errcode='22023';end if;
 if (p_origin in ('Mechanical','Both') or v_saved_scope in ('Mechanical','Both')) and v_category='Paint' then
   raise exception 'PAINT_ONLY_MASTER' using errcode='22023';end if;
 v_scope:=p_origin;

 -- Replays are safe. Moving a material from Painting to Mechanical usage
 -- makes it Both; repeated origin never downgrades its existing scope.
 insert into public.zukait_stock_material_keys
   (material_id,display_name,unit,department,active)
 values(p_material_id,v_name,v_unit,v_scope,true)
 on conflict(material_id) do update set
   display_name=excluded.display_name,active=true,
   department=case
     when public.zukait_stock_material_keys.department in ('Unassigned',excluded.department)
       then excluded.department
     when public.zukait_stock_material_keys.department='Both' then 'Both'
     else 'Both' end
 where public.zukait_stock_material_keys.unit=excluded.unit
 returning department into v_final_scope;
 if v_final_scope is null then
   raise exception 'STOCK_UNIT_CONFLICT' using errcode='23514';end if;
 insert into public.zukait_stock_brand_keys(brand_id,display_name,active)
 values(p_brand_id,v_brand_name,true)
 on conflict(brand_id) do update set
   display_name=excluded.display_name,active=true;

 -- 0 balance makes the new item visible but never invents purchased stock/cost.
 -- Existing balances (including reserved, physical and valuation) stay intact.
 insert into public.zukait_stock_balances
   (material_id,brand_id,unit,physical,reserved,stock_value)
 values(p_material_id,p_brand_id,v_unit,0,0,0)
 on conflict(material_id,brand_id) do nothing;

 return pg_catalog.jsonb_build_object(
   'linked',true,'materialId',p_material_id,'brandId',p_brand_id,
   'unit',v_unit,'department',v_final_scope,'openingStock',0);
end
$link$;
revoke all on function public.zukait_stock_link_master(text,text,text,text)
 from public,anon,authenticated;
grant execute on function public.zukait_stock_link_master(text,text,text,text)
 to service_role;

-- STAGED ONLY: Manager-only, one-time read of existing saved consumables master.
-- Returns <=20 priced material/brand pairs; does NOT link, write, reprice or
-- create a balance. No workshop history tables or whole-state response.
create or replace function public.zukait_stock_legacy_preview(
 p_session_hash text,p_page integer default 0
) returns jsonb language plpgsql security invoker set search_path=''
as $legacy$
declare
 v_actor text;
 v_role text;
 v_master jsonb;
 v_rows jsonb;
 v_has_more boolean;
begin
 if p_page is null or p_page<0 or p_page>49
 then raise exception 'INVALID_PREVIEW_PAGE' using errcode='22023';end if;
 select sc.user_id::text,sc.role into v_actor,v_role
 from public.staff_sessions ss
 join public.staff_credentials sc on sc.user_id=ss.user_id
 where ss.token_hash=p_session_hash and ss.revoked_at is null
   and sc.active=true and coalesce(sc.must_change,false)=false;
 if v_actor is null or v_role<>'Manager'
 then raise exception 'MANAGER_ONLY' using errcode='42501';end if;
 select ws.data->'consumables' into v_master
 from public.workshop_state ws where ws.id='main';
 if v_master is null
 then raise exception 'MASTER_NOT_SAVED' using errcode='22023';end if;
 with
 materials as (
   select m.item from pg_catalog.jsonb_array_elements(
     case when pg_catalog.jsonb_typeof(v_master->'materials')='array'
     then v_master->'materials' else '[]'::jsonb end) as m(item)
   where m.item->>'active' is distinct from 'false'
 ),
 brands as (
   select b.item from pg_catalog.jsonb_array_elements(
     case when pg_catalog.jsonb_typeof(v_master->'brands')='array'
     then v_master->'brands' else '[]'::jsonb end) as b(item)
   where b.item->>'active' is distinct from 'false'
 ),
 active_pairs as (
   select distinct p.item->>'materialId' as mid,p.item->>'brandId' as bid
   from pg_catalog.jsonb_array_elements(
     case when pg_catalog.jsonb_typeof(v_master->'prices')='array'
     then v_master->'prices' else '[]'::jsonb end) as p(item)
   where p.item->>'voided' is distinct from 'true'
 ),
 page_rows as (
   select
     m.item->>'id' as material_id,m.item->>'name' as material_name,
     m.item->>'unit' as unit,
     coalesce(m.item->>'category','Consumable') as category,
     b.item->>'id' as brand_id,b.item->>'name' as brand_name,
     coalesce(mk.department,nullif(nullif(m.item->>'department',''),'Unassigned'),'Painting') as department,
     bal.material_id is not null as has_balance
   from active_pairs a
   join materials m on m.item->>'id'=a.mid
   join brands b on b.item->>'id'=a.bid
   left join public.zukait_stock_material_keys mk on mk.material_id=a.mid
   left join public.zukait_stock_balances bal
     on bal.material_id=a.mid and bal.brand_id=a.bid
   where length(coalesce(m.item->>'name','')) between 1 and 180
     and length(coalesce(b.item->>'name','')) between 1 and 180
   order by material_id,brand_id
   limit 21 offset (p_page*20)
 ), numbered as (
    select row_number() over() as rn, p.* from page_rows p
 )
 select coalesce(pg_catalog.jsonb_agg(
     pg_catalog.jsonb_build_object(
       'materialId',x.material_id,'name',x.material_name,
       'brandId',x.brand_id,'brand',x.brand_name,
       'unit',x.unit,'category',x.category,
       'department',x.department,'linked',x.has_balance
     ) order by x.rn
   ) filter (where x.rn<=20),'[]'::jsonb),
   count(*)>20
 into v_rows,v_has_more
 from numbered x;

 return pg_catalog.jsonb_build_object(
  'items',v_rows,'page',p_page,'hasMore',v_has_more,
  'readOnly',true);
end
$legacy$;
revoke all on function public.zukait_stock_legacy_preview(text,integer)
 from public,anon,authenticated;
grant execute on function public.zukait_stock_legacy_preview(text,integer)
 to service_role;

-- Pilot: read-only totals across every stock balance, independent of UI pagination.
create or replace function public.zukait_stock_balance_report()
returns jsonb language sql stable security invoker set search_path=''
as $$
  select jsonb_build_object(
    'valuation',coalesce(sum(stock_value),0),
    'items',count(*),
    'low',count(*) filter(where physical-reserved>0 and physical-reserved<minimum),
    'out',count(*) filter(where physical-reserved<=0)
  ) from public.zukait_stock_balances;
$$;
revoke all on function public.zukait_stock_balance_report() from public,anon,authenticated;
grant execute on function public.zukait_stock_balance_report() to service_role;

-- Both is a shared physical stock pool. Never sum the department reports together.
create or replace function public.zukait_stock_department_report(p_department text)
returns jsonb language sql stable security invoker set search_path=''
as $$
  select jsonb_build_object(
    'valuation',coalesce(sum(b.stock_value),0),
    'items',count(*),
    'low',count(*) filter(where b.physical-b.reserved>0 and b.physical-b.reserved<b.minimum),
    'out',count(*) filter(where b.physical-b.reserved<=0)
  )
  from public.zukait_stock_balances b
  join public.zukait_stock_material_keys m using (material_id)
  where m.active and p_department in ('Painting','Mechanical')
    and m.department in (p_department,'Both');
$$;

create or replace function public.zukait_stock_department_history(
  p_department text,p_material_id text,p_brand_id text,p_cursor bigint
)
returns jsonb language sql stable security invoker set search_path=''
as $$
  select coalesce(jsonb_agg(to_jsonb(page) order by page.id desc),'[]'::jsonb)
  from (
    select h.id,h.material_id,h.brand_id,h.action,h.physical_delta,h.reserved_delta,
      h.cost_delta,h.job_card,h.actor_id,h.note,h.recorded_at
    from public.zukait_stock_movements h
    join public.zukait_stock_material_keys m using (material_id)
    where p_department in ('Painting','Mechanical') and m.department in (p_department,'Both')
      and (p_material_id is null or h.material_id=p_material_id)
      and (p_brand_id is null or h.brand_id=p_brand_id)
      and (p_cursor is null or h.id<p_cursor)
    order by h.id desc limit 51
  ) page;
$$;
revoke all on function public.zukait_stock_department_report(text),
  public.zukait_stock_department_history(text,text,text,bigint) from public,anon,authenticated;
grant execute on function public.zukait_stock_department_report(text),
  public.zukait_stock_department_history(text,text,text,bigint) to service_role;

-- ZUKAIT stock installation preflight — STAGED ONLY, not a deployment.
-- One bounded, read-only check of catalog metadata. No workshop_state reads,
-- stock transactions, history scans, snapshots, or outside-network calls.
-- Used by the authenticated Workshop API STATUS route only after stock is
-- deliberately enabled on the server. A balance table alone is insufficient.
create or replace function public.zukait_stock_installation_ready()
returns jsonb language sql stable security invoker set search_path=''
as $ready$
  with required_relations(relname) as (values
    ('zukait_stock_material_keys'),
    ('zukait_stock_brand_keys'),
    ('zukait_stock_balances'),
    ('zukait_stock_reservations'),
    ('zukait_stock_reservation_lots'),
    ('zukait_stock_movements'),
    ('zukait_stock_request_receipts')
  ),
  checked_relations as (
    select coalesce(bool_and(
      cls.oid is not null and coalesce(cls.relrowsecurity,false)
      and not coalesce(pg_catalog.has_table_privilege('anon',cls.oid,'SELECT'),true)
      and not coalesce(pg_catalog.has_table_privilege('anon',cls.oid,'INSERT'),true)
      and not coalesce(pg_catalog.has_table_privilege('anon',cls.oid,'UPDATE'),true)
      and not coalesce(pg_catalog.has_table_privilege('anon',cls.oid,'DELETE'),true)
      and not coalesce(pg_catalog.has_table_privilege('authenticated',cls.oid,'SELECT'),true)
      and not coalesce(pg_catalog.has_table_privilege('authenticated',cls.oid,'INSERT'),true)
      and not coalesce(pg_catalog.has_table_privilege('authenticated',cls.oid,'UPDATE'),true)
      and not coalesce(pg_catalog.has_table_privilege('authenticated',cls.oid,'DELETE'),true)
    ),false) as ready
    from required_relations rel
    left join pg_catalog.pg_class cls
      on cls.oid=pg_catalog.to_regclass('public.'||rel.relname)
  ),
  required_functions(signature) as (values
    ('public.zukait_stock_command(text,text,text,jsonb)'),
    ('public.zukait_stock_link_master(text,text,text,text)'),
    ('public.zukait_stock_legacy_preview(text,integer)'),
    ('public.zukait_stock_balance_report()'),
    ('public.zukait_stock_department_report(text)'),
    ('public.zukait_stock_department_history(text,text,text,bigint)')
  ),
  checked_functions as (
    select coalesce(bool_and(
      fn.oid is not null
      and not coalesce(pg_catalog.has_function_privilege('anon',fn.oid,'EXECUTE'),true)
      and not coalesce(pg_catalog.has_function_privilege('authenticated',fn.oid,'EXECUTE'),true)
    ),false) as ready
    from required_functions target
    left join pg_catalog.pg_proc fn
      on fn.oid=pg_catalog.to_regprocedure(target.signature)
  )
  select pg_catalog.jsonb_build_object(
    'ready',checked_relations.ready and checked_functions.ready,
    'schemaReady',checked_relations.ready,
    'rpcReady',checked_functions.ready
  ) from checked_relations cross join checked_functions;
$ready$;
-- No public client may call the installation check directly.
revoke all on function public.zukait_stock_installation_ready()
  from public,anon,authenticated;
grant execute on function public.zukait_stock_installation_ready()
  to service_role;

