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
