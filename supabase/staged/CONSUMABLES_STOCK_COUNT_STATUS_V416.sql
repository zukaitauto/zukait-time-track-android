-- STAGED / NOT APPLIED. V416 count-status metadata for Stock Balance.
-- Requires a verified production backup + isolated restore, explicit Manager
-- sign-off of historical counted balances, and an approved off-hours rollout.
-- Never infer opening quantity from Material Master brand prices.
-- This migration changes metadata only: no physical/reserved/stock_value,
-- movement, effective-dated price, or Job Card is changed.
alter table public.zukait_stock_balances
 add column if not exists initialised boolean not null default false;

-- Historical rows may already be physically received, adjusted or issued.
-- A zero placeholder with NO movement stays uncounted, not 'out of stock'.
-- Review historical exceptions BEFORE enabling count-status reads.
update public.zukait_stock_balances b
 set initialised=true
 where b.initialised=false
 and (
   b.physical<>0 or b.reserved<>0 or b.stock_value<>0
   or exists (
     select 1 from public.zukait_stock_movements m
     where m.material_id=b.material_id and m.brand_id=b.brand_id
       and m.action in (
         'OPENING','PURCHASE','ADJUST','RESERVE','FINALISE','RETURN',
         'MECHANICAL_ISSUE','MECHANICAL_RETURN'
       )
   )
 );
-- Do NOT enable ZUKAIT_STOCK_COUNT_STATUS_READS_ENABLED until the opening,
-- purchase and adjustment RPCs also set initialised=true transactionally
-- (staged RPC modifications are in PR #84), and isolated QA passes.
