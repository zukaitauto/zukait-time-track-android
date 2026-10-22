# Mechanical / Accountant Phase 1 foundation (inactive)

Owner authorized proceeding from the transferred summary on 22 October 2026. Full source Markdown specifications remain unavailable. This is a bounded initial foundation, not a claim that the full plan or AT01–30 is implemented.

Base: architecture-v2 14cc1c32524bdf59771cf888da6dae904a5cffe7. Only a feature branch targeting architecture-v2 is used. No production routes, database schemas, grants, flags, app versions or publication metadata are changed.

## Implemented boundary

`extensions/command_contracts.js` is a pure, unconnected preflight contract for future new operations. No current API imports it. Both extension domains default disabled. Flags, session actor/currentness and capability policy must be supplied by the verified server, never trusted from request JSON. A successful preflight is not authorization to post data: future handlers must still validate every record/field/department, full domain payload, stale signatures, request fingerprint, atomic UUID receipt and current database revision. This module neither persists nor allocates anything.

Mechanical access requires an explicit staff-ID/operation mapping, even for Manager/Supervisor. Generic Supervisor status does not grant Mechanical QC. Jibin is not mapped because his immutable staff ID and exact QC capability remain unverified. Existing painting/final QC remains untouched.

New financial approval contracts permit Accountant and Manager by default; policy can restrict these roles later. No mandatory Manager-only or no-self-approval rule is introduced. The contract applies only to the new operation names; existing ordinary financial permissions, projections and API allowlists remain unchanged. Finance requires online state and current verified session. Financial postings will use exact integer OMR mills and existing append-only ledger/idempotency foundations; no duplicate ledger is created.

Only MC001 is confirmed. Pure formatting returns MC001 for allocated sequence 1; later sequences require explicit width policy. No annual reset, sequence allocation, retry receipt, manual JC cardinality/date policy or additional numbering assumption is implemented.

## Fixtures and tests

Synthetic fixture documents separate immutable MC UUID, display number and manual JC/date. It records the accepted 2-mechanics/120-labour/60-elapsed example and a linked handover preserving outgoing employee/history. These are requirements fixtures; this phase does NOT implement or qualify the task/hour/handover algorithms.

Executable tests cover inactive defaults, role/operation isolation, explicit Mechanical QC capability, configurable Accountant approvals, offline/account switch/actor/revision denial, MC formatting decision gate, exact integer amount contract and immutable inputs. CI invokes only local Node tests; no external API, database service, credentials or production probes.

## Decisions and next phases

Unresolved: Jibin identity/QC, numbering continuation/reset/width, manual JC date/cardinality, priority/promise/hold authority, opening cutover and signed balances, bank/CARD/CHEQUE mapping, tax/period/credits, salary/proration/leave/overtime/incentives/statutory rules, allocation basis, sensitive signature/price/salary visibility and retention, pilot/release ownership. Unresolved functionality stays inactive.

Next independent work: define additive record schemas and idempotent MC allocation/task contracts using the existing event envelope, then synthetic transition acceptance. Actual database migration files, route integration and UI activation are separate reviewable phases. Do not rewrite applied migrations, move old employee hours, bypass existing QC, infer historical account attribution, double count Cash invoice receipts, recognize settlement/payroll expense twice, treat standard JC labour as salary, or invent unknown costs.

The existing nine-module Accountant workspace, shared time/leave/ID001/repeat/delivery/export rules and append-only journal remain authoritative. Cash final invoice receipt policy follows V341, including deposit/late receipt reconciliation and posted versus counted distinction. All financial writes remain online-only. Warranty and expense attachments are excluded.

Production migration/deployment/publication requires separate exact-source/environment approval. Full plan approval is already recorded and is not requested again.
