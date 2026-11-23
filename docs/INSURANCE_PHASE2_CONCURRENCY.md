# Isolated PostgreSQL 17 acceptance

Branch: architecture-v2. Verification only; no deployment, release or live database writes.

## Setup and boundaries

`tests/fixtures/reception-postgres17-baseline.sql` contains schema and dependent function definitions captured read-only from the PostgreSQL 17 production catalog on 2026-10-09. It contains no workshop rows, credentials, sessions or business sequence values. Only the operational objects used by Reception are included. The fixture grants service access for tests; it is not a complete Supabase authentication or RLS replica and must never be deployed.

The runner creates a randomly named database on a loopback PostgreSQL 17 service, loads this baseline and the ordered repository migrations, inserts synthetic QA staff and state, and drops only its own generated database in cleanup. It ignores database URLs and requires explicit `ZUKAIT_RECEPTION_ISOLATED=1`. Tests intentionally commit inside this disposable database to make changes visible to concurrent connections. Production testing still requires BEGIN/ROLLBACK and explicit fixture numbers.

The Reception GitHub workflow starts `postgres:17` and runs `npm run test:reception:concurrency`. The pinned `pg` development dependency provides separate database connections. A control connection confirms the second connection is actually blocked by the first using `pg_blocking_pids`; elapsed delay alone is not considered evidence of a race.

## Scenarios

- Identical Job Card creation UUID: one creation and approved-parts transfer; retry returns cached result.
- Competing creation requests with the same RC revision: loser rejects the stale revision.
- Manager identity correction followed by a blocked old full-state save: corrected shared state and projection survive; observations remain on the checklist.
- Movement followed by a stale correction: confirmed location survives and stale edit is rejected.
- A commercial parts event while cancellation waits: the old cancellation review is rejected.
- New active work while cancellation waits: cancellation is blocked.
- Cancellation while a new work projection waits: the work write is rejected after cancellation commits.
- Identical cancellation UUID: one immutable cancellation; retry returns cached result, preserving VWC and avoiding delivery.
- Identical additional approval UUID: one transfer of the approved partial quantity; VWC remains unchanged.

The runner also executes existing SQL creation/identity, additional approval, cancellation and trigger-privilege integration tests in rollback transactions. Final assertions preserve unrelated technician work, assignments, employee live statuses, consumables, expenses and RC/estimate/PL sequences.

## Verified evidence

Reception workflow run `37955756290` executed the real PostgreSQL suite for acceptance commit `ec47e1c6e291b5f03c0425df83b79452400ff30a`. All nine overlapping scenarios, the three existing SQL rollback groups and final preservation assertions passed. Chromium/WebKit viewport verification also passed. Debug APK run `37955756282`, unsigned Android run `37955756201` and signed acceptance run `37955756227` all passed. Publishing was skipped. No application behavior or database migration changed in this acceptance work.

## Remaining acceptance

This verifies real PostgreSQL transaction overlap, not networked physical-device operation or the deployed Edge Function transport. Existing API tests verify sessions/permissions and Chromium/WebKit tests verify responsive UI. Physical Android WebView and iPhone/PC Safari acceptance, including lost connections and reconnection, remains required before activation. All eight pending migrations and matching API/client changes must activate together only after those gates pass. V304 stays live; no Phase 3 work.
