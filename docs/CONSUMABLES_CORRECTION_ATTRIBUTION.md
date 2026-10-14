# Consumables correction attribution — unreleased fix

Branch: architecture-v2 only. No deployment, release, database write, financial
repair, schema change or V318 release change is part of this work.

## Root cause and trace

managerRecalculateActualPrices changes saved actual lines and totalCost and emits
ACTUAL_PRICE_RECALCULATED with priceRecalculatedBy, but previously omitted
correctedBy/correctionReason. The server accepted only correctedBy/voidedBy for
protected changes. Authenticated Manager price edits therefore failed with
consumables_correction_actor_invalid. Void also preferred an older correctedBy
over the current voidedBy. The 403 catch suppressed its backoff timer but polling,
reconnect, initialization and manual sync could still submit the same dirty data.

Read-only production inspection found this metadata pattern on JC 12003,
actual-8906b030-37aa-445b-9d7c-207fb01a5685, totalCost 15.915:
priceRecalculatedBy=MGR001, correctedBy absent. Existing audit
 audit-e7a9c330-2532-4f38-a039-8928051d4a4b
attributes ACTUAL_PRICE_RECALCULATED to MGR001 with the reason
"Manager requested corrected Disc 1500 price applied from effective date".
This confirms the persisted pattern, not the identity of the currently rejected
local correction. The owner does not recall the Job Card; the device's unsynced
snapshot is not accessible from server records. Do not clear app/browser data.

## Fix

New price recalculations record authenticated-client Manager correction metadata
and reason before the audit after-image. Original creator and all older audit
entries remain unchanged. Server requires the authenticated Manager role and
matching author. Legacy queued recalculations may use priceRecalculatedBy only
with a new, matching ACTUAL_PRICE_RECALCULATED audit, matching entity, exact
post-change row, matching authenticated author, timestamp and nonblank reason.
Existing audit IDs cannot authorize a new write. No role/permission bypass or
blind author replacement is introduced. Void uses its own author and reason.

403 snapshots now have a persistent retry barrier. Identical dirty data is not
resent by background/poll/reconnect/restart paths. Catch preserves the newest
local snapshot, including edits made during the denied request. A different
account cannot adopt the blocked queue. Changed data can be checked once;
explicit SYNC asks confirmation before retrying identical data once. A new denial
restores the barrier. No queue is discarded or financial value automatically
changed to resolve a permission error. Script cache keys are advanced.

## Verification

Added tests/consumables-correction-attribution.mjs and
 tests/cloud-permission-retry-barrier.mjs to test:reception CI.
Tests cover actual price correction, old pending audit compatibility, non-Manager
and spoofed/missing/replayed evidence denial, void author precedence, untouched
old audits, persistent 403 blocking, account isolation, changed-payload retry,
explicit confirmed retry, and in-flight Job Card/financial preservation.
Existing Consumables smoke, UI, backend security, workshop history, Reception,
management and JavaScript regression checks are run before committing.

## Deployment requirements / limits

Deploy workshop-api plus coordinated web/Android assets only after review.
No migration is needed. Old queued data requires authenticated Manager evidence;
missing or mismatched evidence stays blocked for review, never silently adopted.
Physical device replay of the unknown pending snapshot remains unverified.
V318 safeguards and all release holds remain unchanged.
