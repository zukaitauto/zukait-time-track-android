# ZUKAIT production recovery and I/O readiness gate — 2026-11-15

**Status: hold history storage rollout. Live project unchanged.** Current evidence comes from the local operator's successful isolated restore outputs, live Supabase project metadata/advisors, catalog-only SELECTs and Edge Function inventory. No production DDL, write, restart, retention action, history backfill, or function deployment performed.

## Local recovery evidence (user-run Windows PostgreSQL 17)

- The isolated database `zukait_restore_rehearsal_20261114` restored and verified 16,410 history records through revision 16980 from 596 compressed pieces, plus a `public` core dump.
- The isolated clone `zukait_restore_privatecheck_20261115` restored the private-schema archive `ZUKAIT-PRIVATE-SCHEMAS-20261115-080422-fe641b8e`: **18** `zukait_mechanical` tables, **3** `zukait_vehicle` tables, **12** Mechanical functions and **31** public triggers; verified history remained 16,410.
- The late private-schema backup contains **6 Vehicle audit records**, including **3** request references that are absent from the earlier public core snapshot. All 6 were retained; the relevant local audit foreign key was recreated `NOT VALID` only in the isolated clone. **A consistent full recovery is not proven.** No prod constraint changed.
- User-run report: `Z:\Zukait-20261025\ZUKAIT-LOCAL-RESTORE-REHEARSAL\PRIVATE-SCHEMA-RESTORE-TEST.json`.
- The local PostgreSQL server has unexpectedly stopped between user sessions; subsequent startup recovery succeeded. Do not conflate local crash recovery with a fully qualified app recovery plan.

## Live Supabase read-only status on 2026-11-15

- Project `pjknotnjkufadqavcmii` reports `ACTIVE_HEALTHY`; latest health advisor result contained no lints. These do **not** establish spare disk space, remaining Disk I/O balance, or production user acceptance.
- Database allocated: **5,826,538,643 bytes**. `public.workshop_state_history` allocated: **5,787,058,176 bytes**, approximately **99.3%** of database allocation. `pg_total_relation_size` includes TOAST/index/storage overhead; it is not a measurement of deletable bytes.
- The history heap alone accounted for **1,499,136 bytes**; allocation is dominated by other relation storage, not necessarily material eligible for deletion.
- `pg_stat_user_tables.n_live_tup` (14) and `n_dead_tup` (0) are **inexact** and potentially stale; do not interpret them as the actual 16,410 history rows, or as absence of old data.
- `zukait_history` compact schema **absent**. The history foundation and reader proposals remain a future change requiring separate approval.
- Two Storage buckets exist: **`employee-voice-notes` (private)** and **`zukait-pc` (public)**. Object *bytes* have **not** been included in the database dumps or independently backed up.
- **9** active Supabase Edge Functions were listed:

| Function | Live version | Deployment SHA-256 (first 12) |
| --- | ---: | --- |
| `staff-auth` | 13 | `8c9007aef796` |
| `workshop-api` | 123 | `edf5131f3b13` |
| `pc-app` | 4 | `a1b50d9e635b` |
| `pc-app-v2` | 4 | `8312d5cf2c78` |
| `pc-app-v3` | 4 | `f28fdf9c52d9` |
| `publish-pc-site` | 6 | `f0ca5f113d13` |
| `publish-pc-svg` | 5 | `dc696866beea` |
| `auth-diagnostic` | 5 | `1d1e4778e5cd` |
| `voice-api` | 4 | `b82e6c78022c` |

- Only `staff-auth` and `workshop-api` are present under the current `supabase/functions/` repository directory. This does **not** prove the others have no source files elsewhere; it means version-pinned recoverable sources for the other seven still need verification.
- The older `HISTORY_COMPACT_ROLLOUT_PACKET.md` prepared reader changes for live **workshop-api v120**, which is **not the current v123**. **Do not deploy the v120-derived candidate or rollback source.** First obtain and verify exact live v123 files, compare any minimal reader patch against them and requalify tests and rollback.

## Blocking physical resource gate

Current database-allocation metadata cannot establish physical disk size, free disk, WAL allocation, or remaining EBS Disk I/O burst balance. ZUKAIT experienced a prior production incident attributed by Supabase Support to depleted EBS I/O balance.

Before any live migration or dual-writing experiment, inspect the **minimum** Disk I/O balance over the last seven days (not only averaged balance), disk/WAL/system usage and peak I/O activity in Supabase Dashboard **Observability > Database Health** and **Infrastructure settings**. Save evidence with dates; agree on explicit stop thresholds, monitoring and maintenance window. Do not restart, scale, pay for extra resources, or modify production without approval.

Official documentation: https://supabase.com/kb/troubleshooting/exhaust-disk-io and https://supabase.com/docs/guides/platform/compute-and-disk.

## Ordered next gates

1. **No-change evidence**: capture physical disk headroom and minimum I/O balance in Supabase Dashboard; confirm recent production Android/Web behavior is normal.
2. **Recoverability coverage**: safely preserve the exact deployed Edge Function sources, environment-variable names/configuration (without committing secrets), Auth setup, Storage object bytes (including private voice notes) and database role/policy state. Do not claim the public/private-schema dumps alone cover Supabase services.
3. **Fresh coherent recovery point**: design a consistent export/reconciliation plan to avoid the three cross-snapshot audit references, validate with a fresh isolated restore. Preserve the older successful snapshots and reports.
4. **Application behavior**: test Manager, Reception, Mechanical, staff authentication and history reads against isolated recovery without connecting it to production.
5. **Only with explicit approval and resource headroom**: review minimal, exact-current legacy-mode history infrastructure, test reader compatibility and rollback, and perform a separately approved bounded dual-mode observation. Dual mode **increases** WAL and storage initially.
6. **Hold** compact cutover, snapshot deletion, vacuum-full or any disk reclamation until separate complete recovery and approvals. No existing historical rows have been deleted.

**This is a metadata inventory and a release-blocking checklist, not a production change or confirmation of full application restore.**


## Follow-up inventory — 2026-11-15 afternoon (read-only; no platform changes)

- Project still reports ACTIVE_HEALTHY; health advisors returned no current lints.
- The database allocated 5,850,188,947 bytes and the public workshop_state_history relation 5,810,716,672 bytes in a lightweight catalog query. These values do not measure physical free disk or Disk I/O burst balance.
- Supabase Auth auth.users has 0 rows. ZUKAIT uses a separate staff authentication mechanism; 0 here does NOT indicate no staff accounts. Preserve the public credential, session and authorization data and custom staff-auth source.
- Storage exact counts: employee-voice-notes (private) has 0 objects; zukait-pc (public) has 7 objects. Source object sizes from metadata (bytes): app.svg 266011; cloud_sync.js 11476; index.html 260907; production_pilot.js 14741; professional_ux.js 16177; secure_auth.js 10614; zukait_logo.webp 4052. Metadata is not a backup of object bytes.
- Added scripts/backup-zukait-public-storage-readonly.ps1. It downloads only those 7 public files to a new encrypted Z: drive folder, hashes and size-checks them, and writes a manifest after success. The script was inspected in source, not yet executed on the user's PC.
- All 9 currently deployed Edge Function source bundles could be read back through the Supabase connector. Live workshop-api v123 has 43 files (including deno.json); staff-auth v13 has 2; voice-api v4 has 2; each of the remaining 6 has 1. This is not yet a durable off-platform backup, and no secrets or source bodies were written to the repo.
- Remaining blocker: the physical disk free-space and Disk I/O balance cannot be established from these management/catalog metadata tools.

### Next steps without production changes

1. Run and verify public Storage 7-object backup to encrypted Z: and its STORAGE-BACKUP-PASSED.json manifest. Recheck private bucket before any eventual release.
2. Preserve the exact current 9 deployed Edge Function source bundles securely and separately, along with versions/import maps and hashes; do not deploy anything.
3. Obtain dashboard evidence of physical free disk, WAL headroom and minimum recent Disk I/O balance.
4. Plan a transaction-consistent recovery point addressing the 3 Vehicle audit references missing from the older core dump.
5. Only after documented resource headroom, full recovery and explicit production approval, requalify history migration against current workshop-api v123. Retain legacy history; no deletion/compaction now.


## Exact live Edge source SHA256 snapshot — 2026-11-15

The read-only Management API get_edge_function endpoint returned all **9** active functions, containing **53** individual deployed source files, inclusive of deno.json files. A SHA-256/UTF-8 byte inventory (with file paths, live version, deployment bundle SHA and verify_jwt/import-map flags) was committed in docs/storage/EDGE_FUNCTION_LIVE_SOURCE_SHA256_20261115.json. No source bodies or secret values were committed. workshop-api is active at version 123 and contains 43 files including deno.json. The original 42-file count in prior notes was the file count before accounting for the dependency config file.

A local-only Windows export script, scripts/backup-zukait-live-edge-functions-readonly.ps1, was committed. It uses Supabase CLI functions download --use-api into a unique encrypted Z: folder, checks each file against the above independently gathered SHA, and writes EDGE-SOURCE-BACKUP-PASSED.json only after all 53 files match. The script can run through an installed Supabase CLI or npx fallback and requires the user's own locally authenticated Supabase account; never provide an access token in chat. It may reconstruct only missing deno.json files from exact hash-verified Management API readback bytes. No functions deploy/delete/push/restart operation is present.

**Status update (15 November 2026, operator-confirmed):** The Edge download completed on the encrypted Windows Z: drive; all nine deployed functions and 53 source files matched the independently captured live SHA-256 checksums. The manifest `EDGE-SOURCE-BACKUP-PASSED.json` was written successfully. The backup is at `Z:\Zukait-20261025\ZUKAIT-EDGE-SOURCES-20261115-124648-f701d082`. This was an offline copy of deployed source, not a tested Edge redeployment or a backup of runtime secret values and hosted configuration. Full application recovery and production history optimization are not approved.

## Verified operator backup milestones (15 November 2026)

- **Public Storage**: all 7 objects from `zukait-pc` checked against original size and SHA-256 and `STORAGE-BACKUP-PASSED.json` created at `Z:\Zukait-20261025\ZUKAIT-STORAGE-PUBLIC-20261115-115829-4773a97b`. Private `employee-voice-notes` contained 0 objects when inventoried. The Storage backup is not the full platform configuration.
- **Edge Functions**: after Supabase CLI login on the operator PC, the read-only function listing confirmed nine active functions and their expected versions. `supabase functions download --use-api` extracted 53 files, and the SHA-256 comparison against the pinned live Management API readback passed. `Z:\Zukait-20261025\ZUKAIT-EDGE-SOURCES-20261115-124648-f701d082\EDGE-SOURCE-BACKUP-PASSED.json` exists according to the operator output. No Edge Function deployment or production modification occurred.
- **Outstanding**: verify physical disk/IO burst headroom, document external runtime secrets/configuration recovery in a secure vault (never copy secrets to GitHub or chat), reconcile the three Vehicle audit cross-snapshot references with a consistent recovery point, and test representative app/auth behavior against a recreated environment. **No production compaction, history deletion, or heavy table rewrite permitted yet.**


## Read-only capacity recheck — 15 November 2026, afternoon

- Project Management API reports `ACTIVE_HEALTHY`; Supabase health advisors return no active lints. These signals **do not** expose EBS burst balance, physical free disk, or guarantee application responsiveness.
- Metadata-only SQL returned database allocation **5,862,075,539 bytes**; legacy `public.workshop_state_history` allocation **5,820,194,816 bytes** (~99.3% of allocated database). These are allocated sizes, **not** safely removable bytes or free physical capacity.
- PostgreSQL `max_connections=60`; 10 database sessions present, one active; 0 waiting locks; cumulative deadlocks 0. This is a point-in-time concurrency snapshot, not a peak utilization assessment.
- `pg_stat_database.temp_bytes=237,232,224` bytes is a cumulative counter. `pg_stat_wal.wal_bytes=53,188,545` bytes, stats reset `2026-11-15 11:06:56.295104+00`; **neither value measures live WAL disk consumption, EBS IO balance, or remaining burst credits**.
- `zukait_history` schema is still **not installed** on the live project. No compact-mode infrastructure, data retention change, vacuum-full, or history rewrite has been applied.
- The available connected Supabase project, health, SQL and log interfaces do not expose physical disk free space or EBS balance. A reliable decision on performance-heavy migration **cannot** be made using those interfaces alone.
- Supabase documentation locates database size under the Database Reports view and full disk consumption (including WAL/system overhead) in Database Settings; official reference: https://supabase.com/docs/guides/platform/database-size. Observe disk and IO balance separately in the Dashboard; previous EBS IO depletion makes min (not only average) balance important.
- **Production decision: HOLD** any dual-history capture, compact cutover, production SQL migration, history deletion, table rewrite or forced VACUUM. All verified backups, the local recovery exception and v123 live Edge baseline remain preserved.

Next non-mutating evidence: capture Database Settings disk usage/allocated size and Database Reports Disk IO observations over the last 7 days (or the longest available range), including minimum I/O balance if present. Do not guess from database allocation.
