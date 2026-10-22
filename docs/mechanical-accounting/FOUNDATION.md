# Mechanical / Accountant Phase 1 foundation (inactive)

Owner authorized proceeding from the transferred summary on 22 October 2026. Full source Markdown specifications remain unavailable. This is a bounded initial foundation, not a claim that the full plan or AT01–30 is implemented.

Base: architecture-v2 14cc1c32524bdf59771cf888da6dae904a5cffe7. Only a feature branch targeting architecture-v2 is used. No production routes, database schemas, grants, flags, app versions or publication metadata are changed.

## Implemented boundary

`extensions/command_contracts.js` is a pure, unconnected preflight contract for future new operations. No current API imports it. Both extension domains default disabled. Flags, session actor/currentness and capability policy must be supplied by the verified server, never trusted from request JSON. A successful preflight is not authorization to post data: future handlers must still validate every record/field/department, full domain payload, stale signatures, request fingerprint, atomic UUID receipt and current database revision. This module neither persists nor allocates anything.

Mechanical access requires an explicit staff-ID/operation mapping, even for Manager/Supervisor. Generic Supervisor status does not grant Mechanical QC. Jibin is not mapped because his immutable staff ID and exact QC capability remain unverified. Existing painting/final QC remains untouched.

New financial approval contracts permit Accountant and Manager by default; policy can restrict these roles later. No mandatory Manager-only or no-self-approval rule is introduced. The contract applies only to the new operation names; existing ordinary financial permissions, projections and API allowlists remain unchanged. Finance requires online state and current verified session. Financial postings will use exact integer OMR mills and existing append-only ledger/idempotency foundations; no duplicate ledger is created.

At the initial checkpoint only MC001 was confirmed. The owner subsequently confirmed continuous numbering without an annual reset and one checklist per JC; the latest policy/persistence section below supersedes the earlier open numbering and duplicate-JC choices.

## Fixtures and tests

Synthetic fixture documents separate immutable MC UUID, display number and manual JC/date. It records the accepted 2-mechanics/120-labour/60-elapsed example and a linked handover preserving outgoing employee/history. These are requirements fixtures; the initial fixture alone did not qualify task/hour/handover algorithms. The later inactive transition candidate and its precise limits are documented below.

Executable tests cover inactive defaults, role/operation isolation, explicit Mechanical QC capability, configurable Accountant approvals, offline/account switch/actor/revision denial, MC formatting decision gate, exact integer amount contract and immutable inputs. CI runs local Node contracts and a disposable loopback-only PostgreSQL 17 service for the later persistence experiment; no production credentials, external business API calls or production probes.

## Decisions and next phases

Unresolved: Jibin identity/QC, numbering continuation/reset/width, manual JC date/cardinality, priority/promise/hold authority, opening cutover and signed balances, bank/CARD/CHEQUE mapping, tax/period/credits, salary/proration/leave/overtime/incentives/statutory rules, allocation basis, sensitive signature/price/salary visibility and retention, pilot/release ownership. Unresolved functionality stays inactive.

Next independent work: define additive record schemas and idempotent MC allocation/task contracts using the existing event envelope, then synthetic transition acceptance. Actual database migration files, route integration and UI activation are separate reviewable phases. Do not rewrite applied migrations, move old employee hours, bypass existing QC, infer historical account attribution, double count Cash invoice receipts, recognize settlement/payroll expense twice, treat standard JC labour as salary, or invent unknown costs.

The existing nine-module Accountant workspace, shared time/leave/ID001/repeat/delivery/export rules and append-only journal remain authoritative. Cash final invoice receipt policy follows V341, including deposit/late receipt reconciliation and posted versus counted distinction. All financial writes remain online-only. Warranty and expense attachments are excluded.

Production migration/deployment/publication requires separate exact-source/environment approval. Full plan approval is already recorded and is not requested again.

## Inactive checklist/task transition candidate

`extensions/mechanical_rules.js` now adds pure MC registration, task creation, multiple-mechanic assignment and audited handover plans. It is not imported by any API route or UI. MC registration requires an existing active JC, a valid explicit manual JC date, configured duplicate policy and a server-verified allocated MC identity tied to the same request UUID. It does not allocate sequence numbers or create JC records. Mechanical department identity must be supplied explicitly in trusted policy; no production Jibin/department mapping is guessed.

Handover is distinct from existing REASSIGN. It requires server-confirmed closed/paused outgoing work, unchanged allocation and employee-session tokens, an inactive-free target, an explicit reason and explicit successor allocation. It marks the source assignment completed, retains its employee, suggested time and all recorded sessions, creates a linked successor assignment and records before/after attribution. It never starts a timer or silently stops running work. Task assignment only schedules work; Start/Pause/Stop remains the existing shared time authority. The prototype does not establish duty/leave/overtime eligibility for a future Start command or change labour/payroll/QC calculations.

The pure function returns dedicated scoped Mechanical record updates and shared workshop assignment updates. A future server handler MUST persist both atomically, check both revisions, enforce immutable UUID/fingerprint receipts and database constraints, and read current verified time in that same transaction. The test harness exercising revision conflicts is not a replacement for real PostgreSQL concurrency/allocator qualification. Receipt/audit arrays in the prototype input/output model scoped database projections; they must not be appended to the production full-state JSON or loaded as unbounded history.

Tests exercise separate MC/manual-JC identity, request retry/misuse, configured duplicate gating, independent tasks, multiple mechanics, wrong-department/inactive employee denial, target/source running work, changed session/allocation tokens, handed-over original session/hour preservation, reason/audit, no implicit timer start, lost-ack successor deduplication, metadata/workshop revision checks and source immutability. Two simultaneous 60-minute synthetic periods are checked using the existing shared workedMinutes helper, yielding 120 labour minutes and 60 elapsed minutes. Existing time-management and Manager correction/reassignment tests remain gates.

At this transition-only checkpoint, atomic allocator/persistence was still unimplemented; the later isolated SQL prototype below supersedes that status. API/UI and Start/Finish/QC integration, holds/promises/priority authority, PDFs/signatures, payroll and banking remain unimplemented. No production deployment is authorized by these candidate tests.

## Confirmed numbering and draft persistence — supersedes earlier open decisions

Owner confirmed continuous MC001, MC002, MC003 onward with no annual reset, and one Mechanical checklist per manual JC. Defaults now encode three minimum digits/continuous numbering and duplicate-JC denial. A unique database constraint additionally enforces one JC/checklist. Those decisions are no longer open. Jibin staff/QC, manual date business bounds and other listed financial/operational decisions remain unresolved.

`experiments/mechanical-persistence.sql` is an isolated SQL prototype, NOT a generated/applied migration. Private RLS-enabled tables separate checklists, tasks, assignment links, receipts and audits from workshop JSON. The configuration defaults disabled and no staff mapping is populated. Service role cannot enable it. The RPC is security invoker and executable only by service_role, with current staff role/capability checks; public/anon/authenticated are denied. Trusted server session verification remains mandatory in a future API handler.

The allocator and command write share a transaction: lock Mechanical control then workshop row, check request receipt before stale revisions, validate both revisions, verify the proposed next display number, insert the checklist and only then advance the counter. Unique JC/number constraints and lock serialization protect simultaneous requests. An exception after receipt/audit processing rolls all changes back, including number advancement. MC/task metadata writes do not update/archive the full workshop snapshot. Numbering continues across dates; no reset operation exists.

For assignment/handover, the RPC applies only a small assignment delta under the shared state lock, archives the prior workshop revision once and updates data/revision through existing reception/time/live-status triggers. It does not take a caller-supplied live-status override. It never changes recorded sessions. Source equality, active-work checks, legacy period review and dual revisions are rechecked inside the transaction. Source employee/history cannot be reassigned; successor links and before/after audit persist atomically. Receipt/audit UPDATE/DELETE/TRUNCATE are denied.

`mechanical_persistence_plan.js` is a server-only, unconnected adapter. It emits bounded record/assignment deltas without the full snapshot or historical employee-session arrays. SHA-256 fingerprints are computed server-side with WebCrypto. The persistence adapter rejects raw/unverified transition fingerprints; the future handler must compute mechanicalCommandFingerprint before receipt lookup and synchronous transition evaluation. The synchronous prototype's raw-canonical fallback is only for isolated pure transition fixtures, not database storage. Stored fingerprints are 64 hex characters, avoiding embedding historical session tokens in receipt/RPC traffic.

Qualification runs a fresh in-memory PGlite fixture locally and a loopback-only disposable native PostgreSQL 17 database in CI, loading the full existing migrations and live-state trigger fixture. Tests include MC001/MC002, lost acknowledgements, duplicate JC denial, injected audit failure with no consumed number/partial rows, no full-state writes for metadata, atomic handover/history/status preservation, 400 synthetic historical periods without sending their array in the RPC, both revision conflicts, append-only operations and ACL denials. Native CI additionally overlaps same-UUID retries and competing distinct UUIDs, observes row-lock waits, rejects stale writers, retries at the next number and confirms continuous MC005. No production access or records are used.

Still not activated/qualified: API routes and current-session binding, applied/generated migration, production settings, MC UI, financial posting, real-device acceptance, old-client full-save authority preservation and end-to-end Start/Finish/QC/delivery integration. In particular, existing full-state saves and their live-status payloads must preserve Mechanical handover authority before activation; this isolated persistence prototype alone does not establish old-client compatibility. Do not deploy independently of those integration gates. The existing Accountant ledger and financial rights remain unchanged.

Final persistence candidate tested: ff2d319881d4f7012214dee5e942fbb42896afce. Native/contract CI 39835087638 and existing sync/full-save/permission CI 39835096981 both passed. These results qualify isolated transactions, not production integration or rollout.
