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
