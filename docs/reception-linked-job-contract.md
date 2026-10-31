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

## V377 reconciliation — link an existing checklist to an already created direct Job Card

Status: **specified, not implemented or deployed**. Different operation from linked Job Card creation.

### Reception workflow
- In the original non-direct Checklist view, show **Link Existing Job Card** only when the Checklist has no existing JC link.
- Search existing Job Cards by exact JC number or normalized registration; include vehicle make, model, year, registration, VIN (when present), job type, and creation date to allow disambiguation.
- Never suggest an automatic link solely because registrations match. Staff must select and confirm a specific pair.
- On success display **JC Opened · JC number** with a clickable view; remove the checklist from pending / approved action queues as appropriate while retaining checklist history.
- Do not expose internal `details.direct_job_only=true` records as user-visible checklists.

### Atomic server operation
- Introduce an authenticated, role-checked `LINK_EXISTING_JOB` command, independent of `CREATE_JOB` and `CREATE_DIRECT_JOB`; Manager and authorized Receptionist/Supervisor may invoke according to existing Reception policy.
- Require original Checklist RC identifier, existing Job Card identifier, expected checklist revision, client request UUID, explicit operator confirmation, and reason (for audit).
- Lock both Checklist and Job Card plus the Job Card's internal direct-job audit row in one database transaction. Require each to be active, verify vehicle identity (registration and VIN where available), job type and Insurance company/claim when relevant; reject ambiguous/mismatched or cancelled records without changing data.
- Enforce one-to-one mapping: original checklist may have only one linked JC and an existing JC must not be claimed by another real Checklist. Use a unique database constraint or equivalent locking and uniqueness protection. Idempotent retries return the prior result.
- Retain the direct-job-only marker on the separate internal audit row; never delete that row or mark it as a second real checklist. Preserve all original checklist marks, notes, approvals, timestamps, and history. Do not change JC number, creation source marker, work assignments, time sessions, QC, invoice, LPO, parts, paint, or consumables.
- Store an auditable linking event with actor, timestamp, RC/JC identifiers, before/after link state and reason; no silent background repair or bulk auto-link.
- Authoritative server LIST/GET responses must resolve the explicit mapping for both web and Android clients. Return clear stale-revision, no-permission, conflict and identity-mismatch messages.

### Mandatory isolated regression tests
1. Previously unlinked approved Checklist + directly opened JC can be linked; originals preserved.
2. Duplicate registration with different VIN or a second JC requires explicit selection and rejects incompatible identity.
3. A linked Checklist or a JC linked to another real Checklist cannot be linked again; race between two users creates one mapping only.
4. Request replay is idempotent and stale Checklist revisions reject cleanly.
5. A failed operation leaves no partial link or audit event (transaction rollback).
6. Existing direct JC remains absent from Checklist List; original Checklist becomes JC Opened and leaves Approval Waiting/Approved queues where applicable.
7. Non-Manager/Reception unauthorized caller cannot link; audit event recorded for authorized caller.
8. No JC economic data, start/pause sessions or financial totals change after link.

**Release gate:** Do not mark this feature complete before SQL isolation, authenticated API, Reception UI and regression verification pass. Do not change production data or enable bulk backfill.
