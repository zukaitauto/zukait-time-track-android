-- STAGED ONLY: atomic Paint Actual Materials -> Stock ledger reconciliation.
-- NEVER apply in production without a verified backup, explicit historical
-- opening-stock baseline, role acceptance, and end-to-end revision-save QA.
-- When server feature flag is OFF, the existing save RPC is unchanged.
-- This wrapper commits the workshop snapshot and its stock movements in ONE
-- PostgreSQL transaction; failures roll both back. No client-supplied ledger
-- quantity or cost is trusted. Historical Actuals are not auto-replayed.
create table if not exists public.zukait_stock_paint_applied (
 job_card text not null,
 material_id text not null,
 brand_id text not null,
 quantity numeric(18,4) not null check (quantity > 0),
 inventory_cost numeric(20,8) not null check (inventory_cost >= 0),
 applied_revision bigint not null,
 updated_at timestamptz not null default now(),
 primary key (job_card,material_id,brand_id)
);
alter table public.zukait_stock_paint_applied enable row level security;
revoke all on public.zukait_stock_paint_applied from public,anon,authenticated;
grant select,insert,update,delete on public.zukait_stock_paint_applied to service_role;
-- Countable audit action types for Paint; do not mislabel unreserved usage
-- as an explicit reservation FINALISE or RETURN.
alter table public.zukait_stock_movements
 drop constraint if exists zukait_stock_movements_action_check;
alter table public.zukait_stock_movements add constraint zukait_stock_movements_action_check
 check (action in ('OPENING','PURCHASE','RESERVE','CHANGE','CANCEL',
 'FINALISE','RETURN','ADJUST','MINIMUM','MECHANICAL_ISSUE','MECHANICAL_RETURN',
 'PAINT_ACTUAL_ISSUE','PAINT_ACTUAL_RETURN'));

create or replace function public.zukait_commit_workshop_paint_stock_v1(
 p_expected_revision bigint, p_data jsonb, p_changed_by text, p_live jsonb
) returns jsonb language plpgsql security invoker set search_path=''
as $paint$
declare
 v_before jsonb;
 v_old jsonb;
 v_new jsonb;
 v_committed jsonb;
 v_revision bigint;
 v_line record;
 v_bal public.zukait_stock_balances%rowtype;
 v_applied public.zukait_stock_paint_applied%rowtype;
 v_present boolean;
 v_delta numeric;
 v_cost numeric;
 v_newcost numeric;
 v_oldcost numeric;
 v_qty numeric;
 v_request text;
 v_scope text;
 v_unit text;
begin
 if p_data is null or pg_catalog.jsonb_typeof(p_data)<>'object'
   then raise exception 'INVALID_STOCK_SAVE' using errcode='22023';end if;
 -- Lock the same authority row as the revision-CAS commit. A competing writer
 -- cannot interleave a successful save before these stock movements.
 select ws.data into v_before from public.workshop_state ws
  where ws.id='main' for update;
 if v_before is null then
  return pg_catalog.jsonb_build_object('ok',false,'code','missing');
 end if;
 v_old:=coalesce(v_before#>'{consumables,actuals}','[]'::jsonb);
 v_new:=coalesce(p_data#>'{consumables,actuals}','[]'::jsonb);
 if pg_catalog.jsonb_typeof(v_old)<>'array' or
    pg_catalog.jsonb_typeof(v_new)<>'array' then
  raise exception 'INVALID_PAINT_ACTUALS' using errcode='22023';end if;

 -- Existing workshop-save CAS, merge validation and history/live status remain
 -- authoritative. Any stock error below rolls back this commit automatically.
 v_committed:=public.zukait_commit_workshop_state_v2(
   p_expected_revision,p_data,p_changed_by,p_live);
 if v_committed->>'ok' is distinct from 'true' then return v_committed;end if;
 v_revision:=(v_committed->>'revision')::bigint;
 if v_old=v_new then return v_committed;end if;
 -- Bound the reconciliation. Never scan stock history or rewrite all legacy
 -- actuals. Quantity totals reflect ONLY locked, nonvoided Painting records.
 for v_line in
  with old_pairs as (
   select upper(trim(x.actual->>'jobCard')) jc,
          l.line->>'materialId' mid,l.line->>'brandId' bid,
          sum((l.line->>'actualQuantity')::numeric) qty
   from pg_catalog.jsonb_array_elements(v_old) as x(actual)
   cross join lateral pg_catalog.jsonb_array_elements(
     case when pg_catalog.jsonb_typeof(x.actual->'lines')='array'
       then x.actual->'lines' else '[]'::jsonb end) as l(line)
   where x.actual->>'locked'='true'
     and x.actual->>'voided' is distinct from 'true'
     and coalesce(x.actual->>'department','Painting')='Painting'
   group by 1,2,3
  ), new_pairs as (
   select upper(trim(x.actual->>'jobCard')) jc,
          l.line->>'materialId' mid,l.line->>'brandId' bid,
          sum((l.line->>'actualQuantity')::numeric) qty
   from pg_catalog.jsonb_array_elements(v_new) as x(actual)
   cross join lateral pg_catalog.jsonb_array_elements(
     case when pg_catalog.jsonb_typeof(x.actual->'lines')='array'
       then x.actual->'lines' else '[]'::jsonb end) as l(line)
   where x.actual->>'locked'='true'
     and x.actual->>'voided' is distinct from 'true'
     and coalesce(x.actual->>'department','Painting')='Painting'
   group by 1,2,3
  )
  select coalesce(a.jc,b.jc) jc,coalesce(a.mid,b.mid) mid,
         coalesce(a.bid,b.bid) bid,
         coalesce(a.qty,0)::numeric old_qty,
         coalesce(b.qty,0)::numeric new_qty
  from old_pairs a full join new_pairs b on
    a.jc=b.jc and a.mid=b.mid and a.bid=b.bid
  where coalesce(a.qty,0)<>coalesce(b.qty,0)
  order by 1,2,3
 loop
  if nullif(v_line.jc,'') is null or length(v_line.jc)>36 or
     nullif(v_line.mid,'') is null or nullif(v_line.bid,'') is null or
     v_line.new_qty<0 or v_line.old_qty<0 or
     pg_catalog.round(v_line.new_qty,4)<>v_line.new_qty or
     pg_catalog.round(v_line.old_qty,4)<>v_line.old_qty then
   raise exception 'INVALID_PAINT_ACTUAL_QUANTITY' using errcode='22023';end if;
  select b.* into v_bal from public.zukait_stock_balances b
   where b.material_id=v_line.mid and b.brand_id=v_line.bid for update;
  if not found or v_bal.initialised is distinct from true then
   raise exception 'STOCK_OPENING_REQUIRED' using errcode='23514';end if;
  select k.department,k.unit into v_scope,v_unit from public.zukait_stock_material_keys k
   where k.material_id=v_line.mid and k.active=true;
  if v_scope not in ('Painting','Both') or v_scope is null or
      v_unit<>v_bal.unit then
   raise exception 'PAINT_STOCK_SCOPE_INVALID' using errcode='23514';end if;
  if v_unit='Piece' and
     (pg_catalog.trunc(v_line.new_qty)<>v_line.new_qty or
      pg_catalog.trunc(v_line.old_qty)<>v_line.old_qty) then
   raise exception 'PIECE_WHOLE_REQUIRED' using errcode='22023';end if;
  select a.* into v_applied from public.zukait_stock_paint_applied a
   where a.job_card=v_line.jc and a.material_id=v_line.mid
     and a.brand_id=v_line.bid for update;
  v_present:=found;
  -- Pre-activation historical Actual rows cannot silently become inventory
  -- issues or returns. Manager must perform verified baseline reconciliation.
  if not v_present and v_line.old_qty<>0 then
   raise exception 'HISTORICAL_ACTUAL_BASELINE_REQUIRED' using errcode='23514';end if;
  if v_present and v_applied.quantity<>v_line.old_qty then
   raise exception 'PAINT_STOCK_RECONCILIATION_CONFLICT' using errcode='23514';end if;
  v_delta:=v_line.new_qty-v_line.old_qty;
  v_oldcost:=case when v_present then v_applied.inventory_cost else 0 end;
  if v_delta>0 then
   if v_delta>v_bal.physical-v_bal.reserved then
    raise exception 'INSUFFICIENT_STOCK' using errcode='23514';end if;
   v_cost:=pg_catalog.round(v_delta*v_bal.stock_value/v_bal.physical,8);
   v_newcost:=v_oldcost+v_cost;
   update public.zukait_stock_balances set
    physical=physical-v_delta,
    stock_value=case when physical=v_delta then 0 else stock_value-v_cost end,
    updated_at=now()
    where material_id=v_line.mid and brand_id=v_line.bid;
  else
   if not v_present or v_applied.quantity<=0 then
    raise exception 'PAINT_STOCK_RECONCILIATION_CONFLICT' using errcode='23514';end if;
   v_cost:=pg_catalog.round((-v_delta)*v_oldcost/v_applied.quantity,8);
   v_newcost:=v_oldcost-v_cost;
   if v_line.new_qty=0 then v_newcost:=0;end if;
   update public.zukait_stock_balances set
    physical=physical-v_delta,stock_value=stock_value+v_cost,updated_at=now()
    where material_id=v_line.mid and brand_id=v_line.bid;
  end if;
  if v_line.new_qty=0 then
   delete from public.zukait_stock_paint_applied
    where job_card=v_line.jc and material_id=v_line.mid
      and brand_id=v_line.bid;
  else
   insert into public.zukait_stock_paint_applied
    (job_card,material_id,brand_id,quantity,inventory_cost,applied_revision)
   values(v_line.jc,v_line.mid,v_line.bid,v_line.new_qty,v_newcost,v_revision)
   on conflict(job_card,material_id,brand_id) do update set
    quantity=excluded.quantity,inventory_cost=excluded.inventory_cost,
    applied_revision=excluded.applied_revision,updated_at=now();
  end if;
  v_request:='paint-'||pg_catalog.md5(v_revision::text||':'||
       v_line.jc||':'||v_line.mid||':'||v_line.bid);
  insert into public.zukait_stock_movements
   (material_id,brand_id,action,physical_delta,reserved_delta,
    cost_delta,job_card,actor_id,request_id,note)
  values(v_line.mid,v_line.bid,case when v_delta>0 then
    'PAINT_ACTUAL_ISSUE' else 'PAINT_ACTUAL_RETURN' end,
    -v_delta,0,case when v_delta>0 then -v_cost else v_cost end,
    v_line.jc,p_changed_by,v_request,
    'Atomic workshop save / Actual Materials quantity delta');
 end loop;
 return v_committed;
end
$paint$;
revoke all on function public.zukait_commit_workshop_paint_stock_v1(bigint,jsonb,text,jsonb)
 from public,anon,authenticated;
grant execute on function public.zukait_commit_workshop_paint_stock_v1(bigint,jsonb,text,jsonb)
 to service_role;
