# ZUKAIT — minimal v123 Edge-only optimization release preparation
**Preparation state: READY FOR OWNER RELEASE DECISION; NOT DEPLOYED.**

## 1. Exact scope and provenance

- Production project: `pjknotnjkufadqavcmii`.
- Target function: `workshop-api` **ONLY**. Other eight Edge Functions, Android, GitHub Pages, Storage, PostgreSQL objects, auth configuration and runtime secrets are **out of scope**.
- Existing deployed release: `workshop-api` v123 `ACTIVE`, live bundle SHA256 `edf5131f3b1394afe3ecff52d4d45c72680f8462889b07a1cfd871e9d374d68a`, 43 files.
- Source-of-truth for the hotfix **must be the 43-file encrypted Windows Z: backup** at `Z:\Zukait-20261025\ZUKAIT-EDGE-SOURCES-20261115-124648-f701d082`. Do not replace it with branch `architecture-v2` or any older unverified sources.
- The minimal three-hunk standard diff is [WORKSHOP_API_V123_SCOPED_READ_ONLY.patch](WORKSHOP_API_V123_SCOPED_READ_ONLY.patch), applied **only** to v123 `index.ts`; the other 42 files must remain byte-identical.
- Two modifications, read-only: Insurance Manager dashboard selects `jobs:data->jobs`; Receptionist delivery list selects `jobs:data->jobs,assign:data->assign,sessions:data->sessions`. No change to delivery mutation, Insurance LPO mutation, authentication, QC logic, employee work time, finance, history storage or reconciliation.

## 2. Proven qualification

- Original 43 files matched independent live-source SHA-256 inventory.
- Minimal v123 patch applied successfully in isolation: three hunks.
- Operator's **15 November 2026** PowerShell run passed **7 synthetic API scenarios**, including response equivalence for Insurance/Reception and role-denial cases. Source untouched, zero production requests, zero writes.
- PC report, as provided by operator: `Z:\Zukait-20261025\ZUKAIT-V123-RUNTIME-TEST-20261115-141939-e2e6b9af\V123-ISOLATED-RUNTIME-TEST-PASSED.json`.
- GitHub runner self-tests separately passed in build run [43722088802](https://github.com/zukaitauto/zukait-time-track-android/actions/runs/43722088802). The exact backup test **did not depend on** those CI synthetic fixtures.
- Live Supabase check after the operator run reconfirmed v123 `ACTIVE` with the same SHA; no deployment performed.

## 3. Read-only operational baseline

At SQL sample **2026-11-15 14:33:24 UTC**:

- PostgreSQL process start `2026-11-15 11:06:56 UTC`; sample: **0 I/O waiters and 0 waiting locks**.
- Allocated database size: **5,883,448,467 bytes**, history relation **5,841,543,168 bytes**. This is *allocated storage*, not physical free space.
- In the explicitly checked **13:15–14:16 UTC** logs, API gateway had **0 HTTP 5xx events / 1,543 events**, Edge Functions had **0 HTTP 5xx events / 1,601 events**. Counts reflect the requested window, not a guarantee of future availability.
- Current EBS I/O burst balance and physical free capacity remain **UNMEASURED**. This is a blocker to **history migration or expensive database work**, which is outside this hotfix. Do not claim the current improvement changes physical I/O credits.

## 4. Preflight gate (all required immediately before any release)

- **Explicit owner approval of this exact single-Edge-Function release**; general "NEXT" or "PROCEED" to preparation is not approval of final live publication.
- Re-read deployed function status/version/source hash. **Abort on any drift from v123 / `edf513...`**, including an intervening deployment or new incidents. Never overwrite a newer function.
- Encrypted Z: original v123 43-file backup, its `EXPECTED-LIVE-SOURCE-SHA256.json` and `EDGE-SOURCE-BACKUP-PASSED.json` must still exist and verify. Preserve original files read-only. The test report above must exist.
- Separate rollback **re-deployable** baseline: restore *all* 43 original source files with the same `deno.json`, entrypoint, production function settings and JWT/region/security configuration (as currently live), **without copying secret values into logs, GitHub or chat**. Confirm authorized operator is able to perform a rollback using the installed Supabase CLI/management path. If rollback unproven, **abort**.
- Create a fresh separate staging folder **outside the original backup**; copy all 43 files; apply exactly the three-hunk patch to only `index.ts`. Independently compare SHA-256 for all 42 unchanged files, and ensure the staging folder contains only those 43 files. No partial function upload.
- Re-run isolated synthetic v123 tests on the staging copy, confirm deployed-source identity and correct write behavior. No cross-project environments or shared development bundle.
- Check 5xx error trend and workshop operations just before release. If active outage, IO balance incident, queue corruption or database restart is underway, **postpone**.
- **Do not run `.github/workflows/publish-approved-release.yml`** for this change: it coordinates staff APK/Pages publication and risks unrelated releases. Use a specifically controlled Edge-only operation that preserves rollback.
- Do not introduce the compact history schema, dual-write, heavy export, `VACUUM FULL`, new production indexes, database restarts or subscription upgrades.

## 4A. Verified offline staging/rollback tool (new; not yet run on operator PC)

- Runner: [`scripts/run-v123-scoped-read-offline-check.ps1`](../../scripts/run-v123-scoped-read-offline-check.ps1), with pinned Node helper [`scripts/verify-v123-scoped-read-isolated.mjs`](../../scripts/verify-v123-scoped-read-isolated.mjs) and three-hunk diff.
- The wrapper now creates a **new** `Z:\Zukait-20261025\ZUKAIT-V123-EDGE-RELEASE-STAGE-*` directory. It explicitly refuses to overwrite an existing stage and does not modify the source archive.
- Stages only these complete source directories, each with exactly 43 hash-checked files:
  - `CANDIDATE-PROJECTED-READS\supabase\functions\workshop-api\` (only `index.ts` patched);
  - `ROLLBACK-UNPATCHED-V123\supabase\functions\workshop-api\` (all 43 originals SHA-identical to encrypted backup).
- The tool copies the candidate bundle into a temporary rollback-drill folder, restores all 43 originals from the rollback package, SHA-compares all 43 files to the pinned baseline, and removes the drill. Only after success does it atomically publish the completed staging directory with `STAGE-AND-ROLLBACK-VERIFIED.json`. The source-only rollback rehearsal **is not** a deployed rollback exercise.
- Offline synthetic API runtime checks (7 cases) are rerun before packaging. No network requests or production mutations occur in Node; the PowerShell wrapper downloads only the public pinned checker and diff from GitHub.
- **GitHub CI verification passed**: [Build Zukait Time Track APK, run #43725642312](https://github.com/zukaitauto/zukait-time-track-android/actions/runs/43725642312) completed with successful functional smoke tests. Its job logs explicitly say `PASS: v123 patch parser, fail-closed 43-file staging/rollback, and 6 mocked API runtime self-checks (NOT deployed v123).` This validates parser, mocked request behavior and source-only package mechanics. It does **not** imply the operator's PC stage exists. **PC staging remains pending** until a `STAGE-AND-ROLLBACK-VERIFIED.json` file is produced and its output is shared.
- Even a successful source-only package cannot establish that the live CLI deployment/rollback command will work, retain the current JWT/region settings, or preserve server-side secret configuration. This remains a separate mandatory gate before live release.

## 5. Controlled rollout, when separately approved

1. Capture a short pre-release baseline of `workshop-api` HTTP statuses, request latency where available, relevant live error logs and user-facing login/Insurance/Reception read results.
2. Deploy the staging copy of the 43-file bundle as `workshop-api` only through a restricted, clearly identified action. **No DB migration, environment variable edit, new secret or application build**.
3. Immediately fetch the deployed function and verify the 43-file inventory/changed `index.ts`; record new deployment version and bundle hash. If other files differ, rollback immediately.
4. With authorized **test accounts**, verify: Manager Insurance dashboard jobs/WIP/pending and company filters; Receptionist delivery list and QC readiness; role restrictions; unaffected login, manager job lookup, employee Start/Pause/Finish and ID001 state; no unintended revisions/writes caused by list loads.
5. Monitor at least a short before/after window, compare error types (especially HTTP 503/504/5xx) and any available read response sizes/latency. **A smaller JSON projection is not by itself proof of faster physical disk I/O**.
6. Stop/rollback on failed QC results, unauthorized access, missing cards, changed financial totals, sustained increase in 5xx/latency, increased workshop sync errors, accidental changes to history or time tracking, or any source-sha drift. Preserve log evidence with no credentials or customer data.

## 6. Rollback gate

- Rollback target is the **complete unpatched v123 deployed 43-file bundle**, *not* the latest `architecture-v2` and *not* a partial index file.
- Before declaring success after rollback, verify restored source file hashes and function source/version, correct permissions/health, login, Insurance and Reception read results, employee time tracking and that all nine Edge Functions remain in their intended state.
- A rollback is a **new deployment** and therefore gets its own deployment version; do not assume version number decreases to 123. Verify source hashes instead.
- No attempt should delete workshop history or alter database state to achieve rollback.

## 7. Disposition

**Completed:** isolated validation, code scope, pinned baseline and backup evidence, read-only error/lock sample, release/rollback acceptance plan.

**Not completed:** explicit live-release authorization, a deployed and independently qualified 43-file staging artifact, confirmation of an executable rollback path, active deployment, post-release user acceptance or any actual performance gain.

**Current production**: `workshop-api` v123 unchanged. Hold release unless all gates pass. Other production history/IO optimization remains separate.
