-- ZUKAIT HISTORY DEPENDENCY PREFLIGHT — READ ONLY
-- Checks stored SQL functions and views against the reviewed 16 Nov 2026
-- direct-legacy-writer inventory. No data payload reads or DDL/DML.
-- "PASS" authorizes only review of known SQL dependencies; it is NOT approval
-- to deploy history migration or reclaim disk. Dynamic SQL/client code can
-- evade this catalog scan. Re-run after any live function deployment.
with expected(function_name) as (
 values
 ('zukait_commit_workshop_state_v2'),
 ('zukait_mechanical_commit'),
 ('zukait_mechanical_deliver'),
 ('zukait_mechanical_section'),
 ('zukait_pause_at_duty_end'),
 ('zukait_reception_cash_base_command'),
 ('zukait_reception_command'),
 ('zukait_reception_estimate_command'),
 ('zukait_reception_management_base_command'),
 ('zukait_reception_role_base_command'),
 ('zukait_reception_vehicle_changed'),
 ('zukait_reception_vehicle_command')
),
definitions as (
 select n.nspname as schema_name,p.proname as function_name,
        pg_get_functiondef(p.oid) as definition
 from pg_proc p
 join pg_namespace n on n.oid=p.pronamespace
 where p.prokind='f'
   and n.nspname in ('public','zukait_mechanical','zukait_vehicle')
),
history_refs as (
 select d.schema_name,d.function_name,
        d.definition ~* 'insert[[:space:]]+into[[:space:]]+(public[.])?workshop_state_history([[:space:]]|[(])' as inserts_history,
        d.definition ~* '(from|join)[[:space:]]+(public[.])?workshop_state_history([[:space:]]|$)' as reads_history
 from definitions d
 where d.definition ilike '%workshop_state_history%'
),
status as (
 select h.schema_name,h.function_name,h.inserts_history,h.reads_history,
        e.function_name is not null as expected_writer
 from history_refs h left join expected e
   on h.schema_name='public' and h.function_name=e.function_name
),
missing as (
 select e.function_name
 from expected e
 where not exists (
   select 1 from status s
   where s.function_name=e.function_name
     and s.schema_name='public' and s.inserts_history
 )
),
history_views as (
 select count(*) as view_count
 from pg_class c join pg_namespace n on n.oid=c.relnamespace
 where c.relkind in ('v','m')
   and n.nspname not in ('pg_catalog','information_schema')
   and pg_get_viewdef(c.oid) ilike '%workshop_state_history%'
)
select now() as checked_at,
       (select count(*) from status) as referencing_functions,
       (select count(*) from status where expected_writer and inserts_history and not reads_history) as reviewed_writers,
       (select count(*) from missing) as missing_expected_writers,
       (select count(*) from status where reads_history) as direct_legacy_readers,
       (select count(*) from status where not expected_writer) as unreviewed_history_functions,
       (select view_count from history_views) as legacy_history_views,
       case when (select count(*) from status)=12
                 and (select count(*) from status where expected_writer and inserts_history and not reads_history)=12
                 and (select count(*) from missing)=0
                 and (select view_count from history_views)=0
            then 'PASS_CATALOG_DEPENDENCY_INVENTORY_ONLY'
            else 'HOLD_REVIEW_HISTORY_DEPENDENCIES'
       end as catalog_gate,
       'NOT_DEPLOYMENT_APPROVAL__CHECK_EDGE_READERS_BACKUP_AND_IO_SEPARATELY' as restriction;
