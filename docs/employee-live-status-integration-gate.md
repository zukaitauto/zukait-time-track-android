# Employee live-status selective write integration gate

Status: candidate only. CI now runs the actual candidate SQL function in a disposable PostgreSQL 17 database and exercises the real API projection loader in a mocked database harness. These are NOT end-to-end QA server tests. Do not merge or deploy based on CI alone.

## Confirmed existing contracts
- The API computes a full employee projection from workshop users, sessions, assignments and jobs.
- The candidate API repair compares business fields and updates only differing rows. Its default mode still compares state_revision strictly; the selective revision contract requires an explicit opt-in after SQL migration.
- The production SQL timer commit still compares state_revision, so global revision increments can rewrite otherwise unchanged employees. A business-only ON CONFLICT comparison is staged in tests/sql/candidate-commit-workshop-time-changes.sql and has passed isolated PostgreSQL CI.
- The candidate cached projection validates business fields and (when selective mode is enabled) checks that each row revision is a valid positive integer no newer than the global revision. Changing only one layer remains unsafe.

## Required integration (single coherent change)
1. Preserve the API's global revision and authoritative workshop snapshot checks.
2. Implement selective updates inside the atomic SQL timer commit, without changing the timer audit, conflict retry, or idempotency behavior.
3. Adapt API read-repair to use the same business-field comparison; never return stale actual status when the authoritative projection differs.
4. Preserve deletion of truly removed employee rows, and detect duplicates and future revisions.
5. Decide and document how per-row state_revision and updated_by describe last status change, while API revision describes overall workshop freshness.
6. Test Manager, Supervisor and Employee visibility, cache expiry, reconnect, Start/Pause/Resume/Finish and simultaneous employee actions.

## Release blockers
- Existing SQL commit and API repair have NOT been changed.
- No QA database integration test or concurrent benchmark has been executed.
- No production changes are authorized by this PR.

## QA read-only preflight — 2026-11-26
- QA project: `omqgkqknbdcnotabffek` (separate from production).
- Workshop revision 865; four live-status rows; all four at revision 865.
- Zero future, null/invalid, or duplicate employee revisions/IDs.
- Database sessions: four idle ClientRead, two extension waits, one active without a wait event; no lock wait observed in this sample.
- Existing QA `private.commit_workshop_time_changes(bigint,jsonb,text,jsonb)` hash (MD5 of pg_get_functiondef): `106903561fe9ef75eb8e654e88db291d`.
- QA writer still compares excluded.state_revision; candidate writer NOT installed.
- No writes or deployments performed in this preflight.

### Required next controlled QA acceptance
1. Capture a fresh QA-only recovery snapshot and confirm QA users are not actively testing.
2. Compare the candidate SQL function with the installed QA function, including all archive-normalization and undo/audit dependencies; stage SQL on QA only.
3. Deploy the matching API to a QA-only function, preserving the existing QA endpoint. Enable selective-revision flag only for the isolated candidate.
4. Test Employee Start/Pause/Resume/Finish and duplicate action IDs; Manager/Supervisor views; ID001; two simultaneous employees; reconnect; forced conflict/retry; historical audit and undo.
5. Compare workshop revision, per-employee status and number of live-status row writes before and after. Confirm unchanged rows keep their revision and changed rows advance.
6. Disable candidate endpoint and revert QA SQL as a unit if any mismatch; do not merge or deploy to production until these checks pass.

## QA function drift found — 2026-11-26
- Read-only `pg_get_functiondef` comparison found candidate timer SQL missing `private.normalize_job_edit_archive_candidate(v_current,coalesce(p_data,'{}'::jsonb))`, which is present in the installed QA function.
- Restored that normalization call before the unchanged-submission guard in the candidate function. Updated disposable PostgreSQL integration harness with the dependency stub.
- This is a candidate compatibility fix only; no QA or production SQL was replaced.
- The latest CI run must pass again after this correction, and the complete QA function body must be reconciled before deployment.

## Full QA timer-function comparison — 2026-11-26
- Re-fetched the installed QA `pg_get_functiondef` (read only).
- Normalized whitespace/comments and compared the full function before and after the `ON CONFLICT ... WHERE row(...) IS DISTINCT FROM row(...)` predicate: both segments match exactly.
- The only functional SQL difference is removing `state_revision` and `updated_by` from the conflict-update predicate; both fields remain assigned when an employee's business status changes.
- CI passed on `7b05a599` after adding the missing archive-normalization stub; later documentation-only commit checks may still be pending.
- **No QA function replaced.** A recoverable QA snapshot and coordinated QA-only API/SQL rollout with authenticated workflow acceptance remain prerequisites.

## QA rollback readiness — 2026-11-26
- The QA timer function is currently installed with MD5 `106903561fe9ef75eb8e654e88db291d`; retain its exact `pg_get_functiondef` SQL before replacing it.
- QA workshop revision was 865 with four live rows at the same revision and no duplicates/invalid revisions at read-only preflight.
- Candidate must be deployed only after a verified QA database backup/snapshot and confirmation that QA is idle; this GitHub branch does not constitute a backup.
- Rollback requires restoring both the old SQL writer and the prior QA API deployment/feature flag. Restoring SQL alone while the API still accepts older per-row revisions is not a coordinated rollback.
- Before switching, record API function version and deployed source, database revision, row count, and row write counters. After switching, run a single controlled test user first, then multi-user concurrency.
- Do not claim the backup is verified or QA acceptance passed until independently demonstrated. No deployment was performed during this readiness review.
