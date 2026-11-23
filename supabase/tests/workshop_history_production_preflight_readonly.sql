-- ZUKAIT production compact-history PRE-FLIGHT, READ ONLY.
-- Run only for diagnosis. It does not read JSONB payloads, modify rows,
-- switch history modes, create triggers, reclaim disk or validate backups.
-- A successfully restorable backup and physical disk headroom are separate
-- mandatory rollout gates. Never infer those from these SQL metrics.
--
-- This uses relation metadata and indexed revision numbers only.
select now() as checked_at,
       pg_size_pretty(pg_database_size(current_database())) as database_allocated,
       pg_size_pretty(pg_total_relation_size('public.workshop_state_history')) as legacy_history_allocated,
       pg_size_pretty(pg_total_relation_size('public.workshop_state')) as live_state_allocated,
       (select count(*) from pg_stat_activity) as open_connections,
       pg_postmaster_start_time() as database_started_at,
       to_regclass('zukait_history.configuration') is not null as compact_infrastructure_installed;

with revisions as (
  select min(revision) as oldest, max(revision) as latest, count(*) as retained,
         count(distinct revision) as unique_revisions
  from public.workshop_state_history
)
select revisions.*,
       (select revision from public.workshop_state where id='main') as current_revision,
       (latest-oldest+1)-retained as revision_numbers_not_in_legacy
from revisions;

-- A gap is a missing archived revision, NOT proof of a missing job card.
-- Investigate each gap before approving compatible reader/compact cutover.
select series.revision as missing_legacy_revision
from generate_series(
  (select min(revision) from public.workshop_state_history),
  (select max(revision) from public.workshop_state_history)
) as series(revision)
left join public.workshop_state_history h on h.revision=series.revision
where h.revision is null
order by series.revision
limit 100;

-- Confirm runtime deployment and exact rollback bundle separately.
-- Do not activate DUAL/COMPACT, prune snapshots or use VACUUM FULL here.
