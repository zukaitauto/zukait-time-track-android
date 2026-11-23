-- ZUKAIT live PostgreSQL 17: forward-only TOAST compression observation.
-- READ ONLY. No production writes, trial revision, bulk JSON scan,
-- VACUUM, history deletion, restore, migration, or runtime configuration.
-- Verified 2026-11-15: migration 20261115160041
-- workshop_snapshot_forward_lz4_compression appears in migrations.
-- The post-migration column setting is LZ4 (attcompression = 'l');
-- legacy PGLZ rows are retained, so no immediate disk shrink is expected.
--
-- Safely run again AFTER normal workshop activity creates new revisions.
-- Compare timestamp against an independently recorded deployment time;
-- a migration identifier alone is not proof of execution time.
select now() as sampled_at,
       pg_postmaster_start_time() as postgres_started_at,
       pg_database_size(current_database()) as database_allocated_bytes,
       pg_total_relation_size('public.workshop_state_history') as history_allocated_bytes,
       (select count(*) from pg_locks where not granted) as waiting_locks;

select n.nspname as schema_name,
       c.relname as table_name,
       a.attname as column_name,
       case a.attcompression
         when 'l' then 'lz4'
         when 'p' then 'pglz'
         else 'cluster_default'
       end as configured_compression
from pg_attribute a
join pg_class c on c.oid = a.attrelid
join pg_namespace n on n.oid = c.relnamespace
where n.nspname = 'public'
  and c.relname in ('workshop_state','workshop_state_history')
  and a.attname = 'data'
  and not a.attisdropped
order by table_name;

-- The current state is one row. This inspects metadata of its stored value.
select revision,updated_at,
       pg_column_compression(data) as actual_compression,
       pg_column_size(data) as stored_column_bytes
from public.workshop_state where id = 'main';

-- Bounded primary-key latest revisions; never count/scan 5+ GB of JSON.
select revision,updated_at,
       pg_column_compression(data) as actual_compression,
       pg_column_size(data) as stored_column_bytes
from public.workshop_state_history
order by revision desc limit 5;

-- Interpretation:
-- 1. Column setting lz4 does NOT change historic PGLZ payloads.
-- 2. Old toasted pointers can retain their previous compression when copied.
-- 3. A successful rollout requires observed new LZ4 rows, stable save/read
--    behavior and measured growth across comparable working-day intervals.
-- 4. This is NOT compact/delta history. No retained snapshot may be removed
--    without an independently verified coherent restore and separate approval.
