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
