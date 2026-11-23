-- STAGED ONLY. Apply once, in an approved maintenance window, AFTER a verified
-- production backup and isolated restore rehearsal. Do not run against live
-- workshop stock as part of a UI-only publication.
-- Distinguish a new zero-balance catalog placeholder from a recorded zero.
alter table public.zukait_stock_balances
 add column if not exists initialised boolean not null default false;
-- Preserve existing recorded stock and movement history. This only adds metadata;
-- it never modifies physical, reserved, value, or any historical price.
update public.zukait_stock_balances b set initialised=true
 where b.initialised=false
   and (b.physical<>0 or b.reserved<>0 or b.stock_value<>0
    or exists (
      select 1 from public.zukait_stock_movements m
       where m.material_id=b.material_id and m.brand_id=b.brand_id
         and m.action in ('OPENING','PURCHASE','ADJUST','RESERVE',
                          'FINALISE','RETURN','MECHANICAL_ISSUE','MECHANICAL_RETURN')
    ));
