# Linked-checklist Job Card creation — implementation contract

Status: design specification only; **not implemented**. Branch: `architecture-v2`.

## User experience
- Search existing checklists by registration or RC number, choose exactly one record, prefill all shared fields.
- Keep every field editable. Require manual unique Job Card number.
- When an existing checklist is selected, submit a new **atomic linked-create** operation, never `CREATE_DIRECT_JOB` (that would insert a second RC).
- If no checklist is selected, keep the separately tested direct Cash/Credit/approved Insurance creation.
- Show original checklist odometer and original reading unit read-only as historical information; capture **Job Card intake odometer and unit separately**, including cases where the vehicle left and returned.
- Surface explicit authorization, stale-revision, approval invalidation, and duplicate-number errors. Never silently retry with changed vehicle details.

## Atomic linked-create API (pending)
- Idempotent request UUID; RC number; expected RC revision; manually entered Job Card number.
- Edited shared identity (make, model, registration, year, VIN, customer, contact, claim, insurance company); preserve fields not edited by the user.
- New job intake odometer/unit, distinct from `workshop_receptions.details.odometer` and `odometer_unit`. Both readings and their dates must remain queryable independently.
- Existing approval reference/record as appropriate; if changes alter the approved identity, require an explicitly valid re-verification instead of using a stale approval snapshot.
- All mutations execute in a single transaction: lock RC, validate role and expected revision, validate approval, unique JC reservation, update shared RC identity, create linked job and event, preserve checklist condition/signatures/notes/reading, write audit including before/after, commit or roll back completely.
- Preserve existing preliminary-parts transfer/quotation workflows. Do not bypass `zukait_reception_job_approval_valid`, duplicate guards, vehicle authority triggers, or legacy client conflict handling.
- Manager/Supervisor/authorized Receptionist access should mirror current creation permissions; immutable business history remains protected.

## Mandatory tests before any migration or release
- Exact RC/registration search, duplicate registration with disambiguation, already-linked RC, cancelled RC, VWC returned vehicle.
- Edit any allowed shared field and verify authoritative RC, job state, and 360° display agree.
- Two independent odometer readings even if unit changes (KM/Miles); original checklist print remains unchanged.
- Approved Insurance: unchanged identity, changed identity with re-approval, withdrawn approval, stale revision.
- Cash/Credit direct flow unchanged; one JC per RC, multiple devices racing to create the same JC, idempotent response-loss retry.
- Forced transaction failure rolls back *all* RC, job, audit, and event writes; old devices cannot overwrite the authoritative updated identity.
- Isolated PostgreSQL acceptance, web browser, Android build, signed APK, and public Pages staging verification.
