# V305 acceptance handoff

Candidate: V305 / versionCode 268, architecture-v2 only.
Verified application source: `e5ff093189758496db12e55d35a5583ce5311360`.
Status 2026-10-09: isolated QA backend DEPLOYED; anonymous HTTPS denial/CORS smoke PASS;
fully authenticated role transport and physical device acceptance NOT_RUN.
Live remains V304 / 267, workshop-api 58 and staff-auth 4. No release authorization.

## Available evidence and missing access

| Evidence | Reference | Result |
| --- | --- | --- |
| Full Reception suite | [37979060565](https://github.com/zukaitauto/zukait-time-track-android/actions/runs/37979060565) | PASS: nine preparation checks, 14 PostgreSQL 17 overlaps, 16 browser layout checks, API/client tests |
| Signed candidate build | [37979060447](https://github.com/zukaitauto/zukait-time-track-android/actions/runs/37979060447) | PASS: actual APK V305 / 268 and established signing certificate |
| Android builds | 37979060455 and 37979060472 | PASS |
| Signed ZIP artifact | 11640156376; expires 2026-10-23 | SHA-256 `963a8e92cdd66d2257449e136291bd93a93d977d3f91e77cea497ab631604c16` |
| Publishing / Pages | 37979060430 / 37979060575 | SKIPPED |
| Separate QA backend | `omqgkqknbdcnotabffek` (`zukait-v305-qa`), Mumbai / `ap-south-1` | DEPLOYED: 34 RLS tables, 15 QA migration records (6 schema foundation + nine Phase 2), Edge staff-auth v1 and workshop-api v1 |
| Physical devices | No Android, iPhone or Mac/Safari connection available | REQUIRED |

The older signed ZIP is build evidence, not an isolated QA installation. Its ZIP digest
is not the APK digest. The **separately packaged QA debug APK** was built by
[run 37985087786](https://github.com/zukaitauto/zukait-time-track-android/actions/runs/37985087786),
artifact `11642771036`, source `01a56d4249bea53170d98fc86b4bd4b042e5a4ed`.
Its package is `com.zukait.timetrack.acceptance`, V305-ACCEPTANCE / 268,
updater disabled; assets point to the QA backend only. It is *not* the
production-signed staff release. Physical installation and acceptance remain NOT_RUN.

On 2026-10-09, Supabase quoted **USD 0/month** for a new project in the
already-selected `zukaitauto` organization (`hhzqrfyvjvrdjftlaimo`).
Cost confirmation was obtained through the connector and the isolated project
`zukait-v305-qa` (`omqgkqknbdcnotabffek`) was created successfully in
`ap-south-1`. The project reports ACTIVE_HEALTHY, PostgreSQL 17.11, and its
separate API URL is `https://omqgkqknbdcnotabffek.supabase.co`.
At initial inspection QA was schema-empty. It was then populated with the
**schema-only** foundation reconstructed using read-only production catalog
metadata: 25 tables, 25 routines, 65 constraints, 56 indexes, two triggers,
seven sequences and RLS on all 25 tables. All nine Phase 2 migrations were
then applied in order to QA only, adding nine tables and their functions,
constraints and guards. QA migration history records 15 entries (six foundation
and nine Phase 2). QA Edge Functions `staff-auth` and `workshop-api` were
deployed as version 1 with source from the `41345bb...` branch commit.
A real [HTTPS smoke](https://github.com/zukaitauto/zukait-time-track-android/actions/runs/37985238583)
passed both CORS preflights, unknown-user/session HTTP 401 denials, mismatched
publishable-key HTTP 401 denials and direct protected-staff-table HTTP 401 denial.
This is **not** a successful authenticated Reception flow or physical
acceptance test; those remain pending.

Four **synthetic-only** QA staff credentials (Manager, Supervisor,
Receptionist, Employee) with unique PBKDF2-SHA256 hashes and mandatory
first-password change were generated locally and seeded without importing
production credentials. A synthetic unrelated cash workshop job, finished
session, expense, insurance company, and reception access grants were seeded;
one QA employee live status was generated. No real customer, staff or
production business records, sessions, keys or sequence states were copied.
Test passwords are not committed to Git, screenshots or logs. The QA-only
credentials were generated to a locally protected file for physical testers;
protect them and rotate after testing.

## 2026-10-10 live QA SQL RPC verification (transactionally rolled back)

Source: actual PostgreSQL 17.11 in isolated Supabase project
`omqgkqknbdcnotabffek`. These checks directly invoked the installed
`public.zukait_reception_command` routine with synthetic QA actors inside
`BEGIN; DO ... END; ROLLBACK`. They are **not** authenticated Edge HTTP
transport tests and are **not** physical-device acceptance.

- **PASS: Direct Reception Cash and Credit JCs.** Receptionist permission,
  receipt and credit-account validation, durable UUID deduplication, read-back
  through LIST/GET, employee-denied creation, Receptionist-denied STAFF, UUID
  replay identity conflict, and preservation of unrelated cash job, expenses,
  completed time session and nonempty authoritative live worker.
- **PASS: Previously issued insurance approval.** Receptionist insurance
  checklist and MASTER, denial of unapproved Job Card, denial of Receptionist
  approval issuance, Manager-only external approval, duplicate approval retry,
  authorized Receptionist external-approval-to-JC transition, duplicate JC retry,
  preservation of unrelated worker sessions/expenses/live status, existence of
  new JC projection during the transaction.
- **PASS: QA database privileges.** No public-schema workshop SQL function
  grants EXECUTE to `anon`/`authenticated`; no public workshop table grants
  read/write privileges to those roles. QA Edge HTTPS test
  [37985238583](https://github.com/zukaitauto/zukait-time-track-android/actions/runs/37985238583)
  separately confirms unauthorized REST denial and both function HTTP 401 cases.
- **PASS: credential-file integrity.** All four private local QA temporary
  passwords were checked locally against their actual SHA-256 PBKDF2 hashes and
  salts used to initialize QA. Passwords/tokens are not reproduced here. This
  does not establish successful HTTPS sign-in or first-password-change flows.

Post-rollback read-back: **0** Reception records, **0** Reception command
receipts, **0** external approvals, **0** projected JCs, **0** staff sessions;
the synthetic workshop stays at revision **1**, with four QA-only staff rows and
one live worker. Because PostgreSQL `nextval` is not transactional, QA-only
reception sequence advanced to **3** even though business rows were rolled back.
No production sequence, record or workload was touched.

**Still required:** real HTTPS sign-in, first-password-change, verified
Manager/Supervisor/Receptionist/Employee sessions, authenticated Edge
authorization/transactions and concurrent device races on QA; physical
Android WebView, iPhone Safari and Mac Safari device reports; explicit
release approval. The execution environment cannot directly reach the
QA hostname, and the available GitHub connector cannot set protected
GitHub Actions secrets; do not place QA passwords or staff session tokens
in GitHub source or logs. Do not claim these remaining gates passed.

## Setup record

Complete this record before any backend mutation or physical installation:

- Confirmed QA reference and organization: `omqgkqknbdcnotabffek` / `zukaitauto`; cost quote USD 0/month. Owner / project expiry / allowed testers: TO RECORD.
- QA schema inspection: baseline recreated from production metadata (25 tables, 25 SQL functions, 65 constraints, 56 indexes, two triggers, seven sequences); nine Phase 2 migrations applied successfully. QA PostgreSQL 17.11.
- QA staff-auth v1 and complete workshop-api v1 deployed from `41345bb659bbbf414aec462f0ae9626245712a47` source; all local imports included; QA only.
- QA host: `https://omqgkqknbdcnotabffek.supabase.co`; QA-only public publishable key configured in isolated build workflow. Real CORS, invalid-user/session, invalid-key and protected REST denials PASSED; authenticated session fixture / protected token-file and full role transport: PENDING.
- Generated isolated debug APK/web bundle: GitHub run `37985087786`, artifact `11642771036`, package `com.zukait.timetrack.acceptance`, version V305-ACCEPTANCE/268; archive includes APK SHA-256 and signature evidence, not yet copied into this handoff. Device installation: PENDING.
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
