# Phase 2: additional approvals and safe additional-parts transfer

Pending only. V304 and workshop-api version 58 remain live. Migration
`20261009104912_reception_additional_approvals.sql` depends on all five preceding
Phase 2 migrations, including shared vehicle authority. Do not deploy separately
or activate incomplete Phase 2. No Phase 3 or cancellation behavior changes.

## Workflow and evidence

After approved RC-to-Job-Card creation, active Managers and Supervisors can prepare
one additional draft per open linked insurance Job Card. Drafts can contain new
parts or be empty for labour-only work. Every round has a stable UUID and new
source-item UUIDs; prior rounds cannot be reused or edited after approval.

Additional estimates use official existing estimate allocation, current RC vehicle
identity and the linked Job Card. Linking a quotation records a reviewed snapshot.
Changed request items clear its link and require another explicit review/link.
Approval rechecks the exact linked quotation and current identity under locks;
a changed quotation or vehicle correction requires review before approval.
A quotation used by any initial/additional approval cannot be reused.

Approval reference, date, incremental OMR amount (three decimals), selected parts
and quantities, original request, quotation, identity, staff identity and reason
are stored as immutable evidence. Additional amounts are increments, never a
replacement cumulative amount, income, payment or expense. The displayed initial
amount comes from the audited CREATE_JOB approval; additional totals sum rounds.
The original approval, its snapshots and original part mappings are preserved.

## Atomic operational transfer

The server uses request-UUID advisory locking/deduplication, RC revision checks,
then RC -> shared workshop state -> draft -> quotation -> normal PL/event locking.
It rechecks that exactly one linked insurance job is open and not delivered or
cancelled. VWC remains an open operational location and does not prevent approval.

Only selected approved quantities are transferred through the existing PL allocator
and SPARE_PART_LISTED events. The existing single PL for a Job Card is reused.
The first parts approval following a labour-only job creates the normal list event;
a labour-only additional approval allocates no PL and emits no part events.
Every transfer retains an immutable approval/source UUID -> operational part ID,
PL number, quantity and actor mapping. Approval, audit, events, projections,
request status and deduplication result commit together or roll back together.

Duplicate active parts fail atomically. This increment deliberately does not
increase existing ordered/purchased quantities or merge new approvals into an
active item. Review existing orders before preparing a distinct additional item.
Unselected/reduced requested quantities remain historical, unapproved evidence;
later requests use a new round, source IDs and quotation. The normal allocator
can leave a sequence gap after a failed new allocation, as PostgreSQL nextval
is nontransactional; test fixtures reserve explicit allocations and consume none.

No Job Card is created locally. UI draft, quotation and approval retries retain
request UUIDs after lost responses. Operational parts refresh only after server
confirmation. No changes are made to technician sessions, assignments, purchases,
consumables, expenses, QC, delivery, shared work status or confirmed VIW/VWC.
Reception observations remain checklist-only. Shared vehicle corrections continue
to overlay current identity on additional estimates without rewriting evidence.

## Files and database access

- Migration: three RLS-enabled service-only additional request/approval/transfer
  tables, two validation helpers and a reception RPC wrapper. Helpers and RPC are
  security invoker with public/anon/authenticated execution revoked. Approval and
  transfer tables grant service-role SELECT/INSERT only.
- Reception module: additional draft, quotation review, approval/transfer and
  history UI, server gates, selected quantities, incremental totals and retries.
- Estimate module: RC-linked additional estimate creation and official allocation.
- Tests: `reception-additional.sql` and `reception-additional.mjs`, included in
  reception and full regression runners. Existing Edge Function session authority
  forwards commands unchanged; no Edge Function deployment is needed for testing.

## Verification before commit

All six pending migrations were exercised inside BEGIN/ROLLBACK against the live
project, with explicit negative fixture sequence numbers. SQL tests passed initial
creation, additional permissions, revision conflicts, exact request retries,
conflicting request reuse, one-draft enforcement, quotation review invalidation,
changed quotation rejection, decimal/quantity validation, partial selected
transfer, duplicate active-part rollback after an earlier item event, original
parts/evidence preservation, unchanged workshop data/location, multiple rounds,
labour-only/no-PL and first additional parts/list creation, delivered-job refusal,
service-only grants and unchanged business sequences. Earlier preliminary,
approval, job-guard and vehicle-authority SQL suites also passed with this migration.
Post-rollback checks found no pending tables/functions or RC/estimate/PL fixtures.

Reception DOM/API suites, JavaScript validation (76 inline blocks), production
asset checks and all locally runnable full regression tests passed. The full local
runner stops at the unchanged native-dialog Java test because this environment
has no javac; GitHub signed acceptance runs the complete runner with Java 17.
GitHub build results are reported with the final commit after execution.

Physical concurrent-device and Android/Safari integrated acceptance is still
required before Phase 2 activation. Next: audit all existing cancellation
dependencies, then implement Manager-only reasoned/date/identity-audited
cancellation with active work/outstanding parts review and retained financial/time
history. Do not release or deploy until remaining Phase 2 work and acceptance pass.
