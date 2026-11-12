# Compact-history rollout preparation — 12 November 2026

Status: development/isolated qualification only. No production history change or deployment approved by this packet.

## Verified baseline

Live workshop-api v120 was read back and all 43 files matched the stored priced-parts deployment bundle exactly. Active Accountant sharing remains literal true; priced-parts filtering, verify_jwt=false/custom authentication and import map remain preserved. All nine CI workflows for f3666d563a17aa0ef602e6110cd58f0eac19efda passed, including full regression, native PostgreSQL 17 history, signed acceptance build, Reception and Accountant isolated checks. An acceptance APK build is not a publication.

At 2026-11-12T19:58:56.241064Z production was ACTIVE_HEALTHY, with no lock waiters. Postmaster start stayed 16:30:18.117243Z. Database allocation 5,363,379,347 bytes; legacy history allocation 5,320,048,640 bytes; compact schema absent. Database stats_reset is NULL, WAL reset 16:30:18.268310Z, statements reset 16:30:18.022031Z/dealloc 0. Do not infer cross-restart deltas or physical free disk from these figures. Health advisor returned no findings. Performance advisor index suggestions are not sufficient evidence to add indexes.

## Offline exact-source reader packet

Run from repository root using an exact live v120 source readback or its verified deployment bundle:

```sh
node scripts/prepare-history-reader-candidate.mjs /path/to/verified-v120.json /path/to/new-packet-directory
node tests/history-reader-rollout.mjs /path/to/new-packet-directory/candidate-index.ts
```

The packager fails on baseline handler/API drift, keeps 42 files byte-identical, changes only baseStateForRevision in index.ts, and emits candidate, exact v120 rollback and per-file SHA256 manifest. It performs no network request or deployment. Recheck the entire live readback immediately before any future deployment; the packager does not establish live identity itself. Preserve generated packets securely with release evidence; no customer-data export is needed. Do not deploy the whole repository handler, which contains unrelated pending changes.

Default reader remains legacy. Explicit ZUKAIT_HISTORY_READER_COMPAT=true activates the private compatibility RPC only after separately approved infrastructure exists and permissions are checked. Merely deploying the disabled reader produces no compact-storage savings.

## Isolated rollback qualification

Eleven SQL groups now include workshop_history_mode_rollback_qa: actual fixture save RPC across compact -> legacy -> compact -> legacy; old/new revisions readable through both private/public compatible readers; archives created during rollback; compact-chain gaps bridged by legacy snapshots and resumed checkpoints; transaction failure after capture rolls back state and both history stores together. Local PGlite passed all eleven. Native PG17 result for this new test must be recorded from this commit's CI. These synthetic fixtures do not substitute for an actual backup restore.

## Ordered production rollout gates

1. Verify latest successful backup and an isolated restore with control totals, representative old/current revision integrity and access controls. Never restore over the live garage project. Provisioning a billed clone/restore destination needs owner approval. Database backups do not include Storage objects.
2. Verify physical disk usage/capacity, WAL/system headroom and peak resource load in Supabase dashboard. These connector tools expose database allocation, not physical available disk or remaining IO budget.
3. Separately approve exact infrastructure sources for this project in LEGACY mode; no backfill/retention changes. Apply reviewed migrations in dependency order, verify private-schema/RPC ACL and default mode. Do not dispatch an aggregate deployment that includes unrelated migrations.
4. Separately approve exact minimal reader deployment; verify custom auth and default legacy reads before explicit RPC opt-in. Retain v120 rollback source. With compact revisions present, keep a compatible reader until every compact-only revision remains accessible; reverting all the way to the old legacy-only reader after compact cutover is unsafe.
5. Only after verified restoration/headroom, approve a short bounded DUAL observation during representative saves. Dual mode increases storage/WAL temporarily. Stop on failed reconstruction, increased save failure/latency, lock waits, unexpected archive counts or resource pressure. Compare independent reset-valid counters and aggregate logs over actual elapsed periods.
6. Separately approve COMPACT cutover only after every active history reader is compatible. Retain all legacy snapshots. Continue monitoring reads, saves and revision integrity. Switching capture to legacy is nondestructive, but does not materialize compact-only historical revisions into the old table.
7. Disk reclamation, backfill and deletion remain out of scope and require a separate verified plan/approval. Reducing future history growth does not immediately shrink existing disk allocation or network uploads.

## Evidence still unavailable

A current isolated restore, physical disk capacity/free space and real working-day Accountant savings remain unverified. No production data was exported or changed to obtain this packet. The earlier app-release backup-test waiver is not treated as authorization for a history-storage cutover.

References: [Supabase backups](https://supabase.com/docs/guides/platform/backups), [database versus disk allocation](https://supabase.com/docs/guides/platform/database-size), [performance advisor remediation](https://supabase.com/docs/guides/database/database-linter?lint=0001_unindexed_foreign_keys).

## Follow-up candidate: redundant seed guard

See HISTORY_SEED_GUARD.md. A sixth additive staged migration avoids recomputing OLD-state seed payload/digest after its revision is already captured. The runner now includes twelve isolated groups and a negative-control check was performed locally. It is not applied to production; the earlier eleven-test qualification does not automatically qualify this later commit.
