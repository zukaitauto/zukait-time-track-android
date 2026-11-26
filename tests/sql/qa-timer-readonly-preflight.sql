-- QA timer rollout preflight. READ ONLY. Do not execute on production.
-- Backup verification must be completed independently before any deployment.
-- Requires the existing private timer function and workshop tables.
select current_database() as database_name,
       now() as checked_at,
       (select revision from public.workshop_state where id='main') as workshop_revision,
       (select count(*) from public.workshop_live_status) as live_employee_count,
       (select count(*) from public.workshop_live_status where employee_id is null or btrim(employee_id)='') as invalid_employee_ids,
       (select count(*) from public.workshop_live_status where state_revision is null or state_revision<1) as invalid_row_revisions,
       (select count(*) from public.workshop_live_status where state_revision>(select revision from public.workshop_state where id='main')) as future_row_revisions,
       md5(pg_get_functiondef('private.commit_workshop_time_changes(bigint,jsonb,text,jsonb)'::regprocedure)) as installed_timer_function_md5;

-- Cumulative counters, NOT a per-action benchmark. Capture before and after
-- a controlled test; compare deltas and check for counter resets.
select relname,n_tup_ins,n_tup_upd,n_tup_del,n_dead_tup,stats_reset
from pg_stat_user_tables
cross join (select stats_reset from pg_stat_database where datname=current_database()) as db
where schemaname='public' and relname in ('workshop_live_status','workshop_state');

-- Keep any rollback evidence separate from backup artifacts. This file does not
-- back up data, restore data, or enable any feature flags.
