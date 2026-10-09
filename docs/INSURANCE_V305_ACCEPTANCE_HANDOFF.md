# V305 acceptance handoff

Candidate: V305 / versionCode 268, architecture-v2 only.
Verified application source: `e5ff093189758496db12e55d35a5583ce5311360`.
Status 2026-10-10 (Oman): isolated QA backend DEPLOYED; authenticated role transport
and the selected real mutation scenarios below PASS. Full fault/device acceptance
is INCOMPLETE; physical device acceptance NOT_RUN.
Live remains V304 / 267, workshop-api 58 and staff-auth 4. No release authorization.

## 2026-10-10 real mutation checkpoint

Tested source: `fa74ebca62eb4bb7745aa3f5862eb98af3684c3f` (same file tree as
`8e1fe27bf4896fd1795fa85d6aa67ff2bbcfff42`). All network writes targeted only
`https://omqgkqknbdcnotabffek.supabase.co`, using real staff-auth/workshop-api
HTTPS endpoints and synthetic accounts. No schema, Edge implementation,
production data, release metadata or application code was changed.

The following supersedes earlier NOT_RUN entries only for these exact scopes:

- PASS: Receptionist cash intake creates a linked checklist and shared Job Card.
  Exact request replay returns the original result; changed body/actor conflict.
  Credit rejects a missing account reference, then succeeds with one.
  Both Receptionist and Supervisor dashboard searches see the created jobs.
- PASS: VWC movement was committed, its response discarded, independently read
  through Supervisor, and retried with the saved UUID/body. A new Python process
  replayed both the original cash creation and movement without duplication.
  This is transport/process evidence, not a browser crash/offline result.
- PASS: Supervisor Promise Date is optional, audited and visible in follow-up;
  a missing date remains visible. Receptionist cannot write it; stale expected
  dates conflict; exact retry does not add a second audit.
- PASS: Receptionist cannot record issued insurance approval. Manager approval
  appears in Approved Vehicles; subsequent Receptionist JC creation removes it.
  Exact creation retry returns duplicate rather than creating another job.
- PASS: two concurrent HTTPS MOVE requests with one expected revision produced
  exactly one success and one `reception_stale_revision` rejection.
- PASS: Manager reviewed cancellation, Supervisor denial, exact cancellation
  replay and removal from active Reception job lists. SQL confirms one
  cancellation record, while the vehicle remains VWC. Active-work/parts-change
  cancellation races remain covered by earlier local tests, not this HTTPS run.
- PASS: linked identity correction is Manager-only and visible in Supervisor
  shared state. A full-state save containing stale vehicle identity, location,
  and Promise Date fields could not overwrite authoritative values.
- PASS: normal insurance preliminary parts, real estimate number allocation,
  estimate save/link, partial initial approval, Receptionist CREATE_JOB and
  exact retry. Additional request, estimate allocation/save/link, partial
  additional approval and exact retry also passed over HTTPS.
- SQL readback: `RC0006` / `QAN28D65FD1J` has exactly one initial transfer,
  one additional approval and one additional transfer. `PL001` contains one
  Front bumper (approved 1 of requested 2) and one Additional lamp (approved
  1 of requested 3); neither is received. No duplicate transfer on replay.
- PASS: completed synthetic assignment/session fixtures were saved through the
  Supervisor API. Dedicated synthetic QA SUP002/SUP001 accounts were created
  through Manager staff-auth and completed password change. Their real
  PAINTING_QC and FINAL_QC requests passed, followed by Receptionist delivery
  and duplicate replay. Both Receptionist and Supervisor then show the job in
  Delivered and omit it from Ready. SQL confirms one delivery audit, QC revision
  3, and preserved Promise Date. Employee start/finish was not exercised here.
- PASS: temporarily disabling the synthetic Employee rejected its existing
  session at both Edge Functions and rejected fresh login. Account restored
  active. Existing four saved tester passwords were unchanged.
- PASS: all six test sessions logged out and subsequently returned HTTP 401.
  The two temporary synthetic QC accounts are disabled; the original four QA
  tester accounts remain active. No passwords or session tokens are committed.
- PASS: comparison against QA state-history revision 1 confirms the unrelated
  `ZQA-JC-UNRELATED`, expenses, leaves and users are unchanged.
- PASS: all 18 local Reception suites and the isolated transport self-test.
  Chromium/WebKit layout rerun BLOCKED: missing Chromium; install returned an
  invalid/truncated archive. No physical Android/iPhone/Mac device available.

Synthetic retained records: RC0004 cash `QA261010722E1FC` (VWC, identity corrected),
RC0005 credit `QA261010722E1FR` (delivered), RC0006 normal insurance
`QAN28D65FD1J` (approved, two parts), RC0007 issued insurance
`QA261010722E1FI` (cancelled job, VWC). These are QA evidence, not real vehicles.
The normal-flow harness initially attempted pre-JC parts allocation and correctly
received 404; it resumed using CREATE_JOB's atomic allocator. A delivery harness
field-name mismatch was corrected to `jobCard` before resuming. These were test
harness corrections, not application changes or product defects.

Still required: physical device scenarios below; actual browser offline/reconnect
and termination with pending journals; complete response-loss/concurrency matrix
across all mutation types; employee work-to-QC interaction; preservation scenarios
with nonempty unrelated financial/work histories; release/recovery rehearsal,
production backup and explicit staff-release approval. Do not infer full
acceptance from the selected transport passes. V305 remains unapproved.

## 2026-10-10 authenticated HTTPS checkpoint

This section supersedes the earlier authenticated-transport/network-access
blockers below; older preparation and SQL-only entries are historical evidence.
Application branch inspected at `11eb200ca20e15ffb18e7b45733ea63fd8645167`.
Actual isolated target: `omqgkqknbdcnotabffek`, staff-auth v1, workshop-api v2.
The user explicitly approved use of saved synthetic QA credentials and temporary
password rotation/restoration. No production endpoint or credential was used.

- PASS: real Manager, Supervisor, Receptionist and Employee sign-in, password
  change, rejection of the prior session, and acceptance of the replacement
  session. Original saved QA passwords were restored; all four accounts now
  have `must_change=false`, zero failed attempts and no lockout.
- The saved Receptionist password initially failed. Read-only account inspection
  confirmed an active account with an already-completed password change. A
  concurrent session had updated the private tester file to version 2 after the
  initial read. The QA Manager reset function restored the earlier credential,
  then normal password
  change and session-revocation checks passed. This was QA fixture recovery,
  not evidence of an application authentication defect.
  After testing, Receptionist was reconciled to the current version-2 tester
  credential through normal password change; its reconciliation session was
  revoked and rejected. Other saved account passwords were unchanged.
- PASS: existing `reception-isolated-transport.mjs` preflight, all 23 real HTTPS
  requests, using a local curl adapter for the environment connection proxy.
  Checked CORS, exact API-key enforcement on both functions, four authenticated
  session identities/roles, capabilities, authorized lists, Employee actor-spoof
  rejection, guest/malformed rejection, Receptionist load/revision/STAFF denial,
  restricted delivery-list fields, and direct table/RPC denial.
- PASS: 36 real dashboard requests. Each of the nine list sections returned
  confirmed data for Manager, Supervisor and Receptionist; Employee was denied
  for every section. The ten UI tiles include create actions and shared VWC
  lists; this is not a physical UI acceptance result.
- Fixed the isolated runner to accept the deployed `ZQA_RC_V305_*` synthetic
  account namespace alongside existing hexadecimal fixture namespaces. Self-test
  covers the actual namespace and rejects real/unrelated/mismatched identities.
  Production-host, exact-key and four-role restrictions remain enforced.
- SQL read-back: zero Reception records; workshop revision still 1. Authentication
  changed QA credential hashes/session history only; no workshop mutation was
  tested. No password or session token is committed or included in this evidence.
- Supporting local checks: all 18 Reception automated suites passed; isolated
  transport self-test passed; diff whitespace check passed. Local responsive
  browser rerun could not start: Chromium absent and its download returned an
  invalid archive. Earlier CI layout evidence remains historical.

PASS: all four temporary QA sessions were logged out through staff-auth, and
each subsequent session check returned HTTP 401 / `invalid_session`.
Remaining gates: actual mutating Edge workflows, disabled-account behavior,
concurrent/lost-response/offline/restart tests, delivery synchronization and
physical Android WebView/iPhone Safari/Mac Safari acceptance. Production backup,
coordinated activation and explicit staff-release approval are still required.
`release-request.json` remains `approvedForStaff=false`; V305 is not published.

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

### 2026-10-10 authenticated HTTPS checkpoint

Tested from a fresh Work session against isolated QA project
`omqgkqknbdcnotabffek`; checked branch head
`11eb200ca20e15ffb18e7b45733ea63fd8645167`. QA workshop-api v2 dashboard
deployment is documented in INSURANCE_PHASE2_WEB_RECEPTION.md.

- PASS: real HTTPS sign-in and staff-auth session validation for all four
  synthetic Manager, Supervisor, Receptionist and Employee accounts.
- PASS: Manager and Supervisor Reception capabilities and checklist dashboard
  requests returned HTTP 200; Manager STAFF returned 200, Supervisor STAFF
  returned 403 / reception_manager_required.
- PASS: Receptionist temporary-password session was denied by workshop-api
  with 401 / invalid_session, matching the explicit must_change guard.
  Completed the real first-password change for this QA Receptionist;
  the old session then returned 401. The replacement session returned 200
  for Reception capabilities, checklist dashboard and delivery list, and
  403 / receptionist_forbidden for STAFF and full workshop load.
- PASS: Employee capabilities returned allowed=false; dashboard and STAFF
  returned 403 / reception_forbidden.
- All sessions created by these probes were logged out with HTTP 200.
  The current Receptionist password is retained in the private tester file;
  no password or session token is committed here. Other three accounts still
  require their initial password change.
- Local dashboard-rules and Receptionist authentication regression checks
  passed. Remote architecture-v2 head matched the inspected commit before
  this evidence update. No AGENTS.md was found in the checkout.

These are authenticated HTTP access checks, not complete transport acceptance:
filtered populated dashboard data, promise-date writes, actor spoofing,
wrong-key checks with valid sessions, business mutations, response-loss races,
disabled-account revocation and physical devices remain to be verified over
HTTPS. No checklist, Job Card, financial or production data was changed by
these probes. QA credential/session lifecycle writes were required for testing.
V305 remains unapproved and unpublished.

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
