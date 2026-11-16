# ZUKAIT Recovery Readiness — 16 November 2026

**Verdict:** RECOVERY METHOD QUALIFIED; **REAL CURRENT COHERENT RECOVERY POINT NOT YET VERIFIED**. No production change was made in this task.

## Verified live production state (read-only)

Project: `pjknotnjkufadqavcmii` (internal production; branch `architecture-v2`).
Production `workshop-api` **v124** source bundle hash:
`ebd48e18da452008048a67902a346b9b3ad67e9f85124aa48aaa2dae7e134f3e`,
43 files, `verify_jwt=false`.

At 2026-11-16 07:39:25 UTC, live workshop revision **17163**; archive **16,592** rows.
At 2026-11-16 07:46:29 UTC, previous archived revision **17162**
and current revision **17163**, with **zero** waiting locks.
All **34** Mechanical/Vehicle private foreign-key constraints were validated.
All **7** direct Vehicle role audit rows had existing referenced Public reception
command rows (**zero missing**). These checks establish live referential sanity
at sample time; they do not prove a backup's restoration.

## Corrected recovery approach

Previous user PC backups: public/history **14 November** and private
Mechanical/Vehicle **15 November** were captured at different times. Their
isolated restore had **three** Vehicle audit references with no matching older
Public parent records, despite live production being consistent.

**Remedy prepared:** `scripts/backup-zukait-coherent-app-snapshot.ps1`
uses exactly **one** PostgreSQL 17 `pg_dump` process and one MVCC consistent,
serializable/read-only snapshot for `public`, `zukait_mechanical`,
`zukait_vehicle`. It writes only to the operator's encrypted `Z:` folder,
uses the existing production database username/password entered locally, and
verifies the archive's TOC, expected table data and SHA-256. The private
password must never be placed in GitHub/chat.

**Method tested without real customer data:**
[GitHub Actions run 43826075559](https://github.com/zukaitauto/zukait-time-track-android/actions/runs/43826075559),
`tests/coherent-recovery-pg17.mjs`. PASS. The test created synthetic
Workshop/ID001 revisions, Public commands, Mechanical receipts, and six
Vehicle audit records. One PG17 dump/restore preserved the records, all six
audit references, historical revision, ID001 fixture and enforced FK.
This test does **not** count as a real production backup or restore.

## Remaining mandatory evidence for complete Phase 1

1. **Run the coherent read-only backup once** from the operator's trusted PC
   when encrypted `Z:` is unlocked and Supabase disk I/O has sufficient
   headroom and the workshop is not busy. Do not attempt an expensive full
   dump while I/O balance is near exhaustion.
2. **Restore that exact new archive** to an isolated test PostgreSQL 17 /
   matching Supabase PostgreSQL environment, not production or existing QA,
   verifying all archived rows, FK constraints, permissions, trigger definitions,
   old/current history and app-specific reads. A TOC/hash check alone is
   insufficient. If the restore cannot verify an object, record FAIL, do not
   approve compaction.
3. **Retain current exact-source API v124** in off-platform encrypted storage;
   source fingerprint has been verified read-only, but user PC v124 bundle was
   not created in this task. Existing offline v124 staged reader and rollback
   scripts are ready once source archive has been captured.
4. **Account for external recovery dependencies:** application role/ACL
   permissions, Supabase Auth, Storage metadata and private object **bytes**,
   active Edge Functions and runtime secrets. A Public/Mechanical/Vehicle
   dump is coherent for its included schemas, but not an entire Supabase
   service image. Preserve previous verified source/Storage exports.
5. Keep all history, old encrypted backups and live project unchanged while
   readiness remains pending. The production Micro Disk I/O budget has a
   recent exhaustion warning and only 8 GB provisioned disk.

The operator's remaining first step is **one** integrated app-schema dump,
not the former sequence of public and private dumps on different dates.
No paid Supabase resources, data deletion, service restart or production
schema changes are required for the preparation and isolated CI method test.

**Do not mark `coherent_recovery_restore` verified until real new
production archive data has been restored and independently checked.**
