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
