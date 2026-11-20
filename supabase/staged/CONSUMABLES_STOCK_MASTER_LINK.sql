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
 v_scope text;
 v_final_scope text;
begin
 if nullif(p_session_hash,'') is null then
   raise exception 'STOCK_FORBIDDEN' using errcode='42501';end if;
 if p_origin not in ('Mechanical','Painting') then
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
 if v_unit not in ('Liter','kg','Piece') or length(v_name) not between 1 and 180
    or length(v_brand_name) not between 1 and 180 then
   raise exception 'INVALID_MASTER' using errcode='22023';end if;
 if p_origin='Mechanical' and v_category='Paint' then
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
