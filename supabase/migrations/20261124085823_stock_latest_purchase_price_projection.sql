-- Read-only projection of confirmed purchase ledger events.
-- The purchase movement itself is the immutable history; no second price write.
create or replace function public.zukait_stock_latest_purchase_prices(p_session_hash text,p_page integer)
returns table(material_id text,brand_id text,price_per_unit numeric,recorded_at timestamptz,movement_id text)
language plpgsql stable security invoker set search_path=''
as $price$
begin
 if p_page is null or p_page<0 or p_page>49 then
   raise exception 'INVALID_PRICE_PAGE' using errcode='22023';
 end if;
 if not exists(
   select 1 from public.staff_sessions ss join public.staff_credentials sc on sc.user_id=ss.user_id
   where ss.token_hash=p_session_hash and ss.revoked_at is null and sc.active=true
   and coalesce(sc.must_change,false)=false and sc.role='Manager'
 ) then raise exception 'MANAGER_ONLY' using errcode='42501';end if;
 return query
 select b.material_id,b.brand_id,pg_catalog.round(m.cost_delta/nullif(m.physical_delta,0),3),
        m.recorded_at,m.id::text
 from (
   select sb.material_id,sb.brand_id from public.zukait_stock_balances sb
   join public.zukait_stock_material_keys mk on mk.material_id=sb.material_id and mk.active
   join public.zukait_stock_brand_keys bk on bk.brand_id=sb.brand_id and bk.active
   order by sb.material_id,sb.brand_id offset p_page*100 limit 101
 ) b
 left join lateral (
   select mov.id,mov.cost_delta,mov.physical_delta,mov.recorded_at
   from public.zukait_stock_movements mov
   where mov.material_id=b.material_id and mov.brand_id=b.brand_id
   and mov.action='PURCHASE' and mov.physical_delta>0 and mov.cost_delta>0
   order by mov.id desc limit 1
 ) m on true
 order by b.material_id,b.brand_id;
end
$price$;
revoke all on function public.zukait_stock_latest_purchase_prices(text,integer) from public,anon,authenticated;
grant execute on function public.zukait_stock_latest_purchase_prices(text,integer) to service_role;
