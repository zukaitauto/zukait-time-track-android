# V305: production backup gate (read-only verification)

**Status: BLOCKED; no backup or restore has been made in this checkpoint.**
Production Supabase project: `pjknotnjkufadqavcmii` (its name
`zukait-time-track-test` is misleading). Isolated QA:
`omqgkqknbdcnotabffek`. NEVER run a production restore into either
active workshop or occupied QA database.

## Evidence from 2026-10-10 inspection

- The organization is on the Supabase **Free** plan. According to
  [Supabase Database Backups](https://supabase.com/docs/guides/platform/backups),
  automated daily backups are provided for paid projects; Free users should
  routinely export databases to private off-site storage.
- At the sampled production revision **12582**, production contained
  **62 Job Cards, 214 assignments, 789 work sessions, 23 workshop staff,
  69 spare-parts state rows, 359 operational events, 19 live-worker rows**,
  and 12,016 history revisions. These are live counts and will change.
- The newest of **14 application-level `workshop_backups`** rows was
  created **2026-10-03 14:53:06 UTC** (revision **11612**), holding only
  **47 Jobs and 495 sessions**. That older JSON state snapshot does NOT
  contain all work present on October 10, and cannot substitute for a
  complete PostgreSQL database backup. In-database history is not off-site.
- Phase 1 Reception remains the only installed Reception migration in
  production; all **nine Phase 2** migrations remain uninstalled. Production
  Edge functions are `workshop-api` version **58**, `staff-auth` **4**.

## Required for V305 acceptance

1. Arrange a fresh encrypted **complete PostgreSQL export/recovery point**
   in private off-site storage before a coordinated migration or write pause.
   Preserve database schema, data, sequences, grants, policies, triggers,
   functions, and migration history, not just the JSON workshop state. Handle
   staff password hashes and tokens as confidential.
2. Separately record the current backend Edge function versions/sources,
   signed V304 APK/updater, Pages deployed artifact, and storage objects
   needed for a complete restore; PostgreSQL alone does not archive uploaded
   Storage API object bytes.
3. Verify the backup file actually exists; record hash, timestamp, tool
   version, environment, protected location, owner, and retention.
4. Restore to a **fresh disposable database**, never to production or
   the populated V305 QA project. Verify all tables and sequence values,
   representative Job Card histories, session identity/time, spare-parts
   quantities and purchase expenses, estimates, cash invoice values,
   consumables, and employee live-status handling. Do not recreate staff
   sessions in active devices from the restored test.
5. Record restore result and rollback/forward-reconciliation plan in the
   acceptance handoff. Only then mark `fresh_backup_restored` complete
   in `docs/INSURANCE_V305_ACCEPTANCE_GATE.json`, with evidence
   referencing the actual private backup and restore report (not the
   backup file's secret URL).

A completed CI backup rehearsal against **disposable synthetic PostgreSQL**
is useful technical evidence, but does **not** prove recovery of current
production data.

No customer records or credentials are included in this document.
