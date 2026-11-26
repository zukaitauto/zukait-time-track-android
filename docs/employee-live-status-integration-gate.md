# Employee live-status selective write integration gate

Status: candidate only. Do not merge or deploy based on the pure comparison tests.

## Confirmed existing contracts
- The API computes a full employee projection from workshop users, sessions, assignments and jobs.
- The API's live-status repair currently compares each row's state_revision to the global revision, and upserts **all** expected rows when any row differs.
- The SQL timer commit updates live rows with state_revision in its ON CONFLICT comparison, so a global revision increment can update otherwise unchanged employees.
- The current cached projection validates rows against the full expected projection. Relaxing revision equality in only one layer is unsafe.

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
