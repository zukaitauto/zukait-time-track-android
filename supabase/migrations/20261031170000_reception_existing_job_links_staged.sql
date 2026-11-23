-- V377 staged storage only. No backfill, job creation, state mutation or production rollout.
-- Existing Checklist -> already-created Job Card reconciliation must be
-- authorized by a separate atomic server command before enabling this feature.
begin;
create table if not exists public.workshop_reception_existing_job_links (
  rc_no text primary key references public.workshop_receptions(rc_no),
  job_card text not null unique,
  direct_rc_no text unique references public.workshop_receptions(rc_no),
  request_id uuid not null unique,
  linked_by text not null references public.staff_credentials(user_id),
  linked_at timestamptz not null default now(),
  reason text not null check (length(btrim(reason)) between 1 and 2000),
  audit_before jsonb not null,
  audit_after jsonb not null,
  constraint reception_existing_job_normalized check
    (job_card = upper(btrim(job_card)) and job_card ~ '^[A-Z0-9][A-Z0-9/-]{0,39}$'),
  constraint reception_existing_job_not_same_rc check (direct_rc_no is null or direct_rc_no <> rc_no)
);
alter table public.workshop_reception_existing_job_links enable row level security;
revoke all on public.workshop_reception_existing_job_links from public,anon,authenticated,service_role;
grant select,insert on public.workshop_reception_existing_job_links to service_role;
comment on table public.workshop_reception_existing_job_links is
  'Staged immutable one-to-one reconciliation evidence; direct job audit rows remain separate and hidden. Server command with identity/authorization/locking checks required before use.';
commit;
