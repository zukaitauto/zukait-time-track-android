-- STAGED ONLY: Manager and Accountant scoped, one-time read of existing saved consumables master.
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
 if v_actor is null or v_role not in ('Manager','Accountant')
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
     nullif(nullif(m.item->>'department',''),'Unassigned') as saved_department,
     case when mk.active and mk.department in ('Painting','Mechanical','Both') then mk.department end as stock_department,
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
       'department',x.department,'savedDepartment',x.saved_department,'stockDepartment',x.stock_department,'linked',x.has_balance
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
