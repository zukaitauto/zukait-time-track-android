# V305 acceptance handoff

Candidate: V305 / versionCode 268, architecture-v2 only.
Verified application source: `e5ff093189758496db12e55d35a5583ce5311360`.
Status: automated verification passed; real Edge transport and physical acceptance NOT_RUN.
Live remains V304 / 267, workshop-api 58 and staff-auth 4. No release authorization.

## Available evidence and missing access

| Evidence | Reference | Result |
| --- | --- | --- |
| Full Reception suite | [37979060565](https://github.com/zukaitauto/zukait-time-track-android/actions/runs/37979060565) | PASS: nine preparation checks, 14 PostgreSQL 17 overlaps, 16 browser layout checks, API/client tests |
| Signed candidate build | [37979060447](https://github.com/zukaitauto/zukait-time-track-android/actions/runs/37979060447) | PASS: actual APK V305 / 268 and established signing certificate |
| Android builds | 37979060455 and 37979060472 | PASS |
| Signed ZIP artifact | 11640156376; expires 2026-10-23 | SHA-256 `963a8e92cdd66d2257449e136291bd93a93d977d3f91e77cea497ab631604c16` |
| Publishing / Pages | 37979060430 / 37979060575 | SKIPPED |
| Separate QA backend | No project/branch available in last access inspection | REQUIRED |
| Physical devices | No Android, iPhone or Mac/Safari connection available | REQUIRED |

The signed ZIP is build evidence, not an isolated QA installation. Its ZIP digest
is not the APK digest. Generate the separate QA-targeted build after the QA backend
is ready; it uses `com.zukait.timetrack.acceptance`, V305-ACCEPTANCE / 268 and disabled
updates. It must not replace the live workshop app or contact the live backend.

The only visible Supabase organization is `zukaitauto` (`hhzqrfyvjvrdjftlaimo`).
The pricing connector requires the user's organization selection before lookup
and cost confirmation before creating a backend. Organization selection and
quoted cost confirmation remain pending. An existing explicitly designated QA
project can be used instead. Production `pjknotnjkufadqavcmii` is not QA.

## Setup record

Complete this record before any backend mutation or physical installation:

- Confirmed QA reference, organization, owner, cost and expiry: PENDING.
- QA schema inspection/export comparison and ordered nine-migration result: PENDING.
- QA staff-auth and complete workshop-api deployment source SHA: PENDING.
- QA host, publishable-key configuration and protected session-file location: PENDING.
- Generated isolated APK SHA-256, package/version/certificate and web bundle SHA: PENDING.
- Android model, OS and System WebView version: PENDING.
- iPhone model, iOS and Safari version: PENDING.
- Mac model, macOS and Safari version: PENDING.
- Tester, UTC/Oman dates and sanitized evidence location: PENDING.

Follow [backend preparation](INSURANCE_PHASE2_DEVICE_ACCEPTANCE.md), including
all nine ordered pending migrations and private grants. Deploy both staff-auth
and the complete workshop-api directory, including `receptionist_delivery_rules.js`
and every other local import. No production rows, credentials, sessions, keys or
business sequences may be copied. The PostgreSQL baseline fixture is never a
Supabase deployment input. Run the real HTTPS preflight with protected synthetic
Manager, Supervisor, Receptionist and Employee sessions.

Use a clean Receptionist browser profile/device. The restricted page does not
read Manager caches; sharing an origin/profile does not isolate existing stored
data from someone using developer tools. Preserve unresolved workshop work during
handover rather than deleting caches to hide it. Never store test passwords or
session tokens in the repository, screenshots or evidence logs.

## Required device scenarios

Run the applicable scenarios on physical Android WebView, iPhone Safari and Mac
Safari using the same real QA Edge Functions and at least two concurrent devices.
Record PASS/FAIL separately per device. Browser automation and mock transport are
supporting evidence only.

| Scenario | Actions and required evidence | Physical result |
| --- | --- | --- |
| Receptionist access | Manager creates synthetic Receptionist, first password change succeeds, old session is revoked. Only Reception and Delivery controls appear. Direct Supervisor/parts/consumables/finance/time/admin requests fail. Disabled account loses access. | NOT_RUN |
| Direct cash | Receptionist opens cash JC after physical receipt confirmation. Supervisor refreshes and sees that exact JC and shared vehicle/customer details. Supervisor assigns technician work; Reception sees server-confirmed linked identity/location. No duplicate job, fabricated invoice or copied checklist observations. | NOT_RUN |
| Direct credit | Missing account reference is refused; valid customer/contact/reference creates one CREDIT JC. Supervisor and relevant modules see the same record. Stale full-state saves preserve classification, reference and authoritative vehicle details. | NOT_RUN |
| Issued insurance approval | Reception checklist records arrival. Manager/Supervisor records issued approval reference/date/document evidence/reason without making a replacement estimate. Receptionist cannot record approval, but can create the approved insurance JC. Existing preliminary parts require the quotation approval route, not silent unapproved transfer. | NOT_RUN |
| Normal insurance | Checklist, preliminary parts, quotation, recorded approval and atomic JC creation. Approved quantities transfer exactly once. Partial additional approval transfers only its approved quantities. Approval and parts arrival do not move a vehicle to VIW. | NOT_RUN |
| Global Job Cards and legacy records | Existing Supervisor-created cash/credit and grandfathered insurance jobs remain intact and usable in their established workflows. Reception-created jobs occupy the same shared jobs and projections. Existing JC number is rejected rather than creating or merging another card. Registration/VIN do not automatically merge separate historical visits. | NOT_RUN |
| Manager vehicle correction | Correct make/model/year/registration/VIN/customer/contact/claim and insurer where applicable. Compare Reception, Estimate where linked, JC, Spare Parts, Consumables, 360 and a legitimately Delivered Vehicle. Checklist observations stay on the checklist. Stale state/projection writes cannot revert shared identity. | NOT_RUN |
| Movements | Drop only the real committed MOVE response, then retry the saved UUID. Location changes only after server confirmation. VWC leaves work/parts/JC open and does not count as delivery. New JC creation leaves an existing insurance checklist's location unchanged. | NOT_RUN |
| Delivery | Complete work and authorized painting/final QC through existing roles; existing invoice rules still apply. Receptionist can deliver a ready linked job without changing QC or financial fields. New work, cancellation or identity correction before confirmation rejects stale delivery. Lost-response retry produces one delivery audit. | NOT_RUN |
| Cancellation | Manager reviews identity, date/reason and work/parts commitments. New active work or changed review state rejects cancellation. Fresh valid review cancels once while retaining technician history, purchases, costs, consumables, expenses and vehicle location. QC/delivery/new work are then refused. | NOT_RUN |
| Lost response / concurrent devices | Forward to the real QA Edge endpoint, independently confirm commit, then drop its response. Retry the exact saved UUID/body after refresh and client termination/restart. Cover cash/credit/external/normal creation, parts transfer, corrections, movements, additional approval, cancellation and delivery. One write per request; changed actor/body conflicts. | NOT_RUN |
| Offline / reconnection | Disconnect before submission and during an in-flight request. No optimistic success, JC, location or delivery. Retain pending UUID/body; reconnect and explicitly reconcile/retry. Preserve unrelated pending work and financial history. | NOT_RUN |
| Physical interaction | Android keyboard/rotation/back/background; iPhone keyboard/focus/scroll/restart; Mac Safari desktop forms/tables. Record versions, screenshots, requests and any differences. | NOT_RUN |

Use separate synthetic jobs for successful delivery and cancellation. Observe
real row/audit counts, request UUIDs, quantities and state revisions before and
after each test. Preserve unrelated synthetic histories/costs/statuses for digest
comparison. Never call the state commit RPC with an empty live-status array.
Fault injection must match only the confirmed QA host, action and UUID.

## Completion and release review

Acceptance is complete only when every required physical/transport result has
sanitized evidence for the exact tested application/backend source. Fix failures,
rerun affected checks and commit on architecture-v2. Then finalize the ordered
migration/API/client activation and recovery plan from the existing draft, rehearse
recovery in QA and request release authorization. Activate the complete bundle
under the reviewed write pause; never deploy guards alone. Record any source
change after acceptance and assess whether retesting is required.

V305's release request currently has `approvedForStaff=false`; old V304 approval
metadata was cleared. The live updater remains V304 / 267. No named production
Receptionist account has been created. Create its individual ID and temporary
password through the Manager flow only after verified, authorized activation;
do not send passwords through repository files or acceptance evidence.
