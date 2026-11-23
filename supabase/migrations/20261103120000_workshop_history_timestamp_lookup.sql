-- ZUKAIT ERP: speed up date-based workshop history lookups.
-- Source diagnosis (2026-11-03): workshop_state_history contains >15k full
-- JSONB snapshots; a historical "updated_at <= ... order by updated_at desc
-- limit ..." query took ~67.7 seconds. Existing primary key is revision only.
--
-- Non-destructive: existing snapshots, revision ordering, restore points,
-- and state-commit semantics are unchanged. Apply during a maintenance window
-- and verify on staging first. Building the index briefly locks writes;
-- for an online production rollout use a separately reviewed CONCURRENTLY
-- build outside a transaction instead.
--
-- This index improves timestamp seek; it DOES NOT solve snapshot growth.
-- Do not implement history pruning until verified restore/retention gates exist.
create index if not exists workshop_state_history_updated_at_revision_idx
  on public.workshop_state_history (updated_at desc, revision desc);

-- Verification (run read-only after deployment):
-- select indexname, indexdef from pg_indexes
-- where schemaname='public' and tablename='workshop_state_history';
-- explain select revision, updated_at from public.workshop_state_history
-- where updated_at <= now() order by updated_at desc, revision desc limit 1;
--
-- Rollback (requires maintenance approval):
-- drop index if exists public.workshop_state_history_updated_at_revision_idx;
