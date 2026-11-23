# Phase 2: audited linked Job Card cancellation

Pending only. V304 and workshop-api version 58 remain live. Migration
`20261009111840_reception_job_cancellation.sql` depends on all six preceding
pending Phase 2 migrations. No deployment, release or Phase 3 activation.

## Dependency audit before implementation

| Existing dependency | Finding and retained behavior |
| --- | --- |
| `secure_auth.js` / `confirmDeleteJob` | Legacy Delete removes Job Card, assignments, sessions and reworks. Linked RC jobs now route to server cancellation review before password/local mutation. Unlinked legacy deletion behavior is unchanged. |
| `job_card_master.js`, costing/reports | Cancelled assignments/sessions can be excluded from labour calculations. Cancellation retains every assignment/session and does not mark them cancelled, completed or zero their time. |
| Phase 1 reception constraints | A linked RC must retain APPROVED status and no initial-case outcome. These checks remain intact; Job Card cancellation has a separate immutable record. GET/LIST present its CANCELLED outcome without unlinking or rewriting initial approval history. |
| Work/event projections | Assignment and work events have independent projections. Review checks shared active work, projected active/paused work and unresolved projected allocations. Historical projected ASSIGNED rows matched to completed/cancelled shared assignments do not falsely count as active. |
| Parts projections and commercial events | Parts quantities and invoice/quotation events can change independently. Review fingerprint includes both. Job-related events take the shared state lock before projections so review and cancellation serialize with normal purchases/transfers. |
| QC/delivery rules | Completed work can remain QC-eligible. Cancelled jobs have a separate CANCELLED stage, are excluded from ready/QC queues and are refused by QC/delivery rules. Server state/event guards independently forbid delivery/reopening. |
| Manager time controls | Reopen/transfer/history edits could revive work. Cancelled job rules reject these operations and SQL guards preserve related time/assignment/QC/completion history. |
| Focused details/360/parts/finances | The retained master remains available to reporting, parts, consumables and expense views. Focused details show CANCELLED and existing work history without a reissue action. Parts return/purchase/settlement operations remain available. |

## Command and workflow

Active Manager only, verified through the existing staff-session API and rechecked
in SQL. Manager opens a fresh server review showing linked Job Card/vehicle,
active/unresolved work and all parts' PL, status, ordered/received quantities.
Cancellation is blocked until running/paused sessions and unfinished allocations
are resolved using existing work controls. It never force-finishes technicians or
automatically cancels assignments.

After reviewing outstanding supplier/parts commitments, Manager explicitly
acknowledges the review, types the exact Job Card number and supplies a mandatory
reason and Oman cancellation date between Job Card creation and today. Outstanding
parts may remain when acknowledged; cancellation does not return parts, void
purchases, reduce quantities or remove financial commitments automatically.

`CANCEL_JOB` uses request UUID deduplication, expected RC revision and an exact
review fingerprint. A changed work/parts/commercial review fails and must reload.
Locks follow RC -> shared workshop state -> projections. All cancellation/audit,
state history, status/projection, RC metadata/revision and request-cache writes
commit atomically. Any failure rolls all writes back. Lost-response retries retain
the UUID and read the committed result; no optimistic cancellation, local data
removal, session stop, PL/RC/estimate allocation or financial changes occur.

The immutable cancellation table records date, reason, staff ID/name, canonical
vehicle identity, original Job Card, reviewed work/parts and request UUID. Original
approvals, quotation snapshots, parts mappings/events and reception audits remain.
Shared state is archived through its existing history table; the live-status
trigger uses unchanged sessions. Never call the state commit RPC with an empty
live-status array.

Job status/workflow becomes Cancelled/CANCELLED. RC linkage and initial approval
constraints remain unchanged. Reception reads and CANCELLED filter derive the
linked cancellation outcome from the immutable record. Identity corrections and
physical VIW/VWC movements remain available under their existing permissions and
audits; they do not rewrite cancellation evidence. Cancellation does not move the
vehicle, set delivered fields, create an invoice or count as delivery.

## Server protections and access

One new RLS-enabled service-only table, `workshop_reception_job_cancellations`,
with SELECT/INSERT only; no anonymous/authenticated access or service-role
UPDATE/DELETE grants. All new RPC/helper/trigger functions are security invoker
with public/anon/authenticated execution revoked.

State guards retain cancellation metadata against stale saves, prevent local
work/assignment/QC/history changes and delivery/deletion/archive flags on cancelled
linked jobs. RC guard prevents unlinking cancellation evidence. Job Card projection
guard restores CANCELLED status/workflow and retains completion timestamps.
Event guards block new assignment/work/repeat/reopen/job-stage operations after
cancellation. Direct work/assignment projection changes are refused too. Normal
parts financial/return/settlement events remain usable. Legacy unlinked jobs and
VIW/VWC behavior are unchanged.

## Verification

All seven pending migrations were tested inside BEGIN/ROLLBACK against the live
project. `reception-cancellation-fixture.sql` reserves explicit negative fixture
RC/PL numbers; tests never call business nextval. Cancellation SQL tests passed
Manager permissions, identity/reason/date/acknowledgement checks, shared/projected
active work refusal, changed parts review, injected projection failure rollback,
retry/conflicting UUID, unchanged workshop time/finances/parts/live statuses,
CANCELLED filter, stale state/projection reopening protection, direct work and
job-event rejection, parts invoice event acceptance and service-only grants.
Earlier preliminary, approval, job guards, atomic creation, vehicle authority and
additional approval SQL suites passed with the new migration. Post-rollback checks
found no persistent Phase 2 schema or fixtures and no consumed business numbers.

Reception cancellation DOM tests verify outstanding-parts review, active-work
blocking, confirmed-only refresh, lost-response retry, preserved local data/VWC,
escaped history, legacy-delete routing, readable focused details and blocked
QC/work. Reception/API tests, JavaScript validation and production asset gates
pass. Full local regression is run except the unchanged native Java test, because
this environment lacks javac; GitHub signed acceptance runs the complete runner
with Java 17. Final commit/build run evidence is reported after completion.

Existing live advisors report intentional service-only RLS/no-policy notices and
an older spare-part SECURITY DEFINER trigger execute-grant warning. This increment
adds no SECURITY DEFINER code or public grants and does not change that deployed
trigger. Track its independent review before activation; remediation guidance:
https://supabase.com/docs/guides/database/database-linter?lint=0028_anon_security_definer_function_executable

## Remaining activation gates

Integrated concurrent-device and physical Android/Safari acceptance must cover
all Phase 2 features together, including work/parts arrival during review, lost
responses, corrections after approval, cancellation history/costs, return and
settlement after cancellation, checklist movements and legacy workflows.
Shared QC and time-rule Edge Function changes must be included in the verified
activation bundle; version 58 is unchanged until then. Do not deploy individual
migration guards or publish a release before the complete bundle passes.
