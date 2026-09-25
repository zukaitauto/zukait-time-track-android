# Zukait Time Track — Architecture V2 Migration

Baseline: V141 remains the production/recovery release. This branch is for structural migration and must not change workshop behaviour until regression tests prove parity.

## Non-negotiable architecture rules
1. One authoritative business rule per concept. PC and Android display the same server-derived state.
2. One renderer/controller per feature. No new version-number override layers.
3. New features live in feature modules, never appended to v74_updates.js or offline_test.html.
4. Operational writes are idempotent events with eventId, entityId, actorId, deviceId, clientTime, serverTime/revision, type, payload and syncState.
5. Offline actions persist before UI acknowledgement and retry safely; duplicate replay must not duplicate work time.
6. Live, recent and historical data have separate read paths. Historical lists are server-paginated.
7. Sensitive mutations write immutable audit records: actor, old/new values, reason, device and timestamp.
8. V141 behaviour remains the reference until each module is migrated and parity-tested.

## Target modules
- core/auth
- core/sync
- core/offline
- core/audit
- features/jobcards
- features/time
- features/id001
- features/leave
- features/repeat
- features/consumables
- features/spare-parts
- features/notifications
- features/reports
- ui/employee
- ui/supervisor
- ui/manager

## Migration sequence
### Phase 1 — Foundation
- Introduce module boundaries and shared contracts without changing UI.
- Add event envelope/idempotency helpers.
- Add canonical live-status selectors.
- Add architecture regression tests forbidding new legacy override layers.

### Phase 2 — Time and offline authority
- Migrate Start/Pause/Resume/Finish and ID001 to event writes.
- Preserve current duty, holiday, leave, overtime and one-active-job rules.
- Add reconnect/conflict tests for multiple devices.
- Android follow-up: persistent Room queue + WorkManager transport while retaining web queue compatibility.

### Phase 3 — Data scale
- Split LIVE / RECENT / HISTORY queries.
- Server pagination for Job Card/history screens.
- Remove whole-history scans from dashboard rendering.
- Add indexes and retention/archive policy.

### Phase 4 — Workshop workflow
Canonical optional JC stages:
Created -> Dismantling -> Parts Required -> Parts Ordered -> Parts Received -> Denting -> Painting -> Assembly -> QC -> Ready for Delivery -> Delivered.
Stages are optional by job type; transitions are audited.

### Phase 5 — Spare Parts
Supervisor initial/suspected list -> purchaser enquiry -> quotation -> order -> received -> Denter check -> Supervisor confirmation -> fitted/returned/unavailable/customer settlement.
Denter does not see prices. Track wrong-part returns, urgent requirements, supplier/order delays and bill cost.

### Phase 6 — Exception notifications
Central rules for 30-day completion risk, parts delay, duty-end pause, additional-time approval, repeat work, QC/Ready for Delivery and material variance. Notifications must be actionable and deduplicated.

### Phase 7 — Management/reporting
PC-focused WIP board, server search, audit history, cycle time, efficiency, repeat rate, ID001/waiting, overtime, parts delays, consumables variance, labour/material/parts JC cost and 30-day compliance.

## Client responsibilities
Android/mobile: fast operational actions, offline-safe writes, assignment/ID001, parts/material receiving, alerts.
PC/web: management search, WIP, approvals, reports, costing, audit, exports.
Both clients consume the same authoritative rules and records.

## Release gates
- JS validation and existing functional smoke suite pass.
- New architecture/event tests pass.
- No regression in Employee/Supervisor/Manager authority.
- Offline action replay is idempotent.
- Multi-device conflict test passes.
- 2k/10k historical JC rendering benchmark does not load full history into dashboard.
- Signed release only after explicit release-source approval.
