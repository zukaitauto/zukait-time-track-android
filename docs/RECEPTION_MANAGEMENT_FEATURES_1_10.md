# Reception & Insurance Management — Features 1–10

Status: implementation candidate, not a production release. Branch: `architecture-v2` only.
Baseline inspected and refetched: `ff505fa01d2e015b3e87813fe26642e359da2eb3`.
`b5cff418` is an ancestor; its Supervisor FINISH implementation is retained.
No repository AGENTS.md was present. Existing Reception, estimator, QC, invoice,
vehicle authority, cancellation, release and backup documents were inspected.

## Authoritative records

| Concern | Authority and write path |
| --- | --- |
| Checklist, damage markings, accessories and notes | Existing `workshop_receptions`; service-only Reception command, row revision and immutable audit |
| Checklist-linked identity | Existing Reception identity triggers; Job Card links to `rc_no`, never deletes Checklist |
| New direct Job Card identity | `workshop_direct_job_identity`; service-only Manager correction with append-only `workshop_direct_job_audit` |
| Direct Insurance approval evidence | `workshop_direct_job_approvals`; immutable initial evidence, no Checklist or RC sequence allocation |
| Jobs, work, QC and invoices | Existing `workshop_state.jobs[]`, state revision/history, existing V2 job/work projections |
| CTL / Not Repaired / release | Independent `repair_status`, `repair_notes`, `released_date`, `release_remark`; existing location and approval fields remain separate |
| Insurance LPO | Exactly one `jobs[].insuranceLpo` with amount, receivedDate, revision, immutable correction history; final invoice remains separate |
| Receptionist estimates | Existing estimate array and number sequence; restricted RPC exposes only estimates attached to requested Checklist |

`insurance_lpo` and Invoice Entry both write the same LPO object using the existing
state CAS transaction. An identical Invoice Entry receipt adds no second LPO.
Cash and Credit invoices do not create LPOs. Historic invoice amounts are not
automatically interpreted as collected LPOs. Corrections retain actor, timestamp,
reason and before/after values. A concurrent unrelated change is reread and
preserved; stale LPO revisions conflict instead of overwriting.

Reception writes require a verified active staff session. SQL functions are
service-only, invoker-security functions; anonymous/authenticated roles have no
direct table or RPC grants. Caller-supplied actor and role fields are rejected.
UUID receipts replay only the exact actor/payload; changed retries conflict.
New direct creation, state history, identity approval/audit, V2 event and linked
Checklist writes execute within a single SQL transaction.

## Feature mapping

1. Direct creation inserts no Checklist. Linked creation retains and links the
   existing Checklist. List filters All / Pending / JC Opened and clickable JC
   details retain original Checklist, damage markings and history.
2. Reception Job Cards sort by number numerically descending, with date tie
   breaking. Search and date/month filters remain.
3. The four old top actions are removed from the primary action area. Their
   existing preparation/history workflows remain accessible lower in the record.
4. Five primary actions: VWC / VIG location, CTL notes, existing Estimate editor,
   APPROVED date/remark and NOT REPAIRED reason. The CTL garage list includes
   Deliver / Release; release records date/remark/history and shows Vehicle
   Released. Prepared Insurance parts retain the existing reviewed quotation
   approval workflow rather than fabricating financial approval.
5. A linked Job Card excludes its Checklist from active Approved Vehicles.
6. A linked Job Card excludes its Checklist from active VWC Checklist rows;
   corresponding job rows remain independently available.
7. Checklist Scan VIN captures text. Android uses the existing ML Kit text
   bridge; browsers use bundled Tesseract worker/core/English data. Images are
   processed locally. OCR text requires editable confirmation; ambiguous I/O/Q
   remain visible. Manual input remains available. New VINs require 17 valid
   characters. Existing legacy Checklist VINs remain readable/editable unchanged;
   opening a new linked Cash/Credit job requires valid VIN/year if recorded.
8. Manager-only Insurance dashboard: job list, company/month/date/search,
   complete paginated print, LPO Pending entry, correction history, receipt-month
   collected sum, monthly deliveries/company breakdown, Approval Pending link
   and WIP link. Clickable Job Card details also work for delivered jobs.
9. Responsive Reception header/action layout and Insurance mobile cards use
   larger readable labels and retain existing layout components.
10. Insurance Invoice Entry uses the shared LPO record; Cash/Credit remain
    separate. Supervisor may enter a first matching invoice receipt, but changing
    a recorded LPO through Invoice Entry requires Manager and a correction reason.

## Migration and preservation

New migration: `20261012131131_reception_insurance_management.sql`, created with
Supabase CLI. It adds fields/tables/functions/triggers and wraps existing
Reception commands and Manager correction helpers. No rows are deleted, no
historic LPO values are fabricated, and existing direct-job audit RCs are retained.
Historical direct-only RCs remain excluded from Checklist lists.

The original vehicle illustration, marking coordinate renderer, one-page A4
Checklist document generator and five-row notes output are retained. Source
preservation is verified against the baseline, with existing PDF/print and work
regressions included. Version/release metadata stays V315 / 278; the `316` script
cache suffix identifies candidate assets and does not constitute an APK release.

## Reproducible checks

- `npm run test:reception`: existing Reception DOM, roles, history, restart
  recovery, estimates, cancellation, direct creation, lists and authority tests.
- `npm run test:management`: pure financial/list rules; real Edge handler with
  mocked transport/CAS conflicts and lost responses; DOM VIN/LPO verification;
  actual migration chain execution in disposable in-memory PostgreSQL (PGlite).
- `scripts/ci-full-regression.sh`: existing full regression plus all four new
  management tests. No production credentials are used by these tests.
- `scripts/verify-reception-platform-assets.py`: Pages/APK source parity,
  including local OCR worker, core and trained data. Pages packaging explicitly
  copies OCR assets, and changed script URLs have updated cache identifiers.

PGlite verifies SQL transactions and role grants but does not establish simultaneous
multi-connection races, hosted Supabase REST behavior, pgcrypto staff authentication
or production backup restoration. Those remain distinct acceptance checks.

## Release gates — currently unfulfilled

Do not apply this migration, deploy the Edge function, publish Pages or distribute
an APK from this candidate using the old V315 approvals.

1. Record exact source SHA; obtain passing CI, signed candidate APK and asset parity.
2. Export a fresh protected production database/data backup using the existing
   fail-closed backup exporter; record SHA256, row counts, time, operator and all
   shared Reception/job/work/QC/invoice/estimate/approval/movement/audit projections.
3. Restore that backup into an isolated database; verify data counts, historical
   damage/approvals, permissions, sequences and rollback/recovery procedures.
4. Test migration and Edge function together in staging. Run genuine concurrent
   request tests and anonymous/authenticated REST denial tests, including stale
   clients, exact replay and LPO versus Invoice Entry races.
5. Verify PC widths, physical Android and Safari: camera permission/cancellation,
   local OCR/WASM, manual VIN correction, all new lists/actions, restart retry,
   keyboard/dialog lifecycle and the original one-page PDF/vehicle markings.
6. Independently sign complete data-preservation and business acceptance evidence
   for all ten features. Approve the exact source SHA/version for publication.
7. Deploy the approved migration/backend, smoke-test privately, then publish the
   same-source Pages/APK with hashes and existing publication gates. Record final
   deployment URLs/run IDs; monitor post-release reconciliation.

Existing release-request/acceptance files were not marked approved or altered to
bypass these checks. Production database, Edge, Pages and APK publication remain
untouched. Missing physical-device/backup evidence is not an implementation pass.
