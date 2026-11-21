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
