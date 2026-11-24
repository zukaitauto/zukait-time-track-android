create or replace function public.zukait_stock_counted_page(p_page integer,p_department text,p_material_id text,p_brand_id text)
returns jsonb language sql stable security invoker set search_path='' as $$
select coalesce(jsonb_agg(to_jsonb(q) order by q.material_id,q.brand_id),'[]'::jsonb)
from (
select b.material_id,b.brand_id,b.unit,b.physical,b.reserved,b.stock_value,b.minimum,b.updated_at,
case when p_department is not null then jsonb_build_object('department',m.department,'active',m.active) else null end as material,
exists(select 1 from public.zukait_stock_movements x where x.material_id=b.material_id and x.brand_id=b.brand_id and x.action in ('OPENING','PURCHASE','ADJUST')) as initialised
from public.zukait_stock_balances b
join public.zukait_stock_material_keys m using(material_id)
where p_page between 0 and 20
and (p_department is null or (p_department in ('Painting','Mechanical') and m.active and m.department in (p_department,'Both')))
and ((p_material_id is null and p_brand_id is null) or (b.material_id=p_material_id and b.brand_id=p_brand_id))
order by b.material_id,b.brand_id
limit 101 offset (greatest(0,least(coalesce(p_page,0),20))*100)
) q;
$$;
revoke all on function public.zukait_stock_counted_page(integer,text,text,text) from public,anon,authenticated;
grant execute on function public.zukait_stock_counted_page(integer,text,text,text) to service_role;
