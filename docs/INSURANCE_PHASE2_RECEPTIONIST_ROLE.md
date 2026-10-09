# Reception-only staff account requirement

Status: code implemented; complete automated verification and physical acceptance pending. **Not activated**.
Requested 2026-10-09. Applies only to architecture-v2.
Production stays V304 / versionCode 267 until verified release authorization.

## User workflow

A named Receptionist signs in with an individual User ID and temporary password,
changes that password on first login, and sees only the Reception workspace.

The Receptionist can:
- Create and update Reception checklists, record checklist observations, and print.
- Record confirmed physical vehicle movements using existing Reception rules.
- See the approval status and create a Job Card only after authoritative approval.
- See a minimal list of linked vehicles ready for delivery and deliver only after
  existing work-completion and painting/final-QC checks pass.

Approval and additional approval remain with existing authorized insurance staff.
Cancellation remains Manager-only, audited and subject to existing review guards.
The Receptionist cannot perform QC, change invoice amounts, approve quotations,
manage users, assign technicians or use Supervisor, Spare Parts, Consumables,
Estimate, 360-degree, finance or reporting workspaces. Approved-part transfer stays
server-owned and atomic; no receptionist parts-edit privilege is needed.

VWC is a physical location and must never be treated as delivery. Parts arrival,
approval and Job Card creation must not imply a vehicle movement.

## Verified integration gaps

Audit base: d5133a60aa7864d8c7d38b4fe16800b0d7e496f1.

- Live staff_credentials_role_check accepts Employee, Supervisor, Manager,
  Purchaser only (read-only catalog inspection on 2026-10-09).
- Live staff-auth v4 manager_create allows Employee, Supervisor, Purchaser;
  it already hashes passwords and requires the initial password to change.
- secure_auth.js and offline_test.html have no Receptionist login route or
  Manager account-creation option.
- workshop-api's load action provides shared workshop state to a valid session.
  A Receptionist needs an explicit action allowlist before that dispatch.
- Pending reception_create_job migration permits Manager/Supervisor creation.
  The role must be supported explicitly without impersonating a Supervisor.
- qc_delivery_rules.js restricts delivery to a Supervisor. It already computes
  readiness from completed work and current, passing painting/final QC.
- Existing Reception designation alone is insufficient: it does not create a
  dedicated account role or prevent access to the account's other modules.

Do not create this account as a Supervisor or change a live credential's role to
an unsupported value merely to enable Reception.

## Coordinated implementation

1. Capture and version the live staff-auth source before modifying its creation
   allowlist. Force department Reception for this role; preserve password hashes,
   session validation, lockout and first-login password change.
2. Create an additive pending migration with the Supabase CLI after the existing
   eight Phase 2 migrations. Extend the role constraint and Reception permissions,
   explicitly restrict operations, and preserve Manager-only corrections and
   cancellation. Do not edit or deploy a partial subset of the eight migrations.
3. Restrict workshop-api by the current server-verified credential role, including
   direct action calls. Allow only Reception operations and narrowly scoped
   delivery reads/writes. Deny shared-state load/save, time, parts, finance,
   estimates, reports and administration endpoints.
4. Give the client a dedicated Reception route without fetching, displaying or
   caching full workshop state. Keep approval/parts/cancellation controls absent.
   Existing cached Manager data must not be available in a Receptionist session.
5. Return only checklist and necessary approval/delivery status fields. Do not
   send financial records, technician history, full approvals or unrelated module
   data to this account, even if the menu hides it.
6. Reuse authoritative QC readiness for delivery. Recheck under the state lock
   or compare-and-swap; retain request UUID across loss/restart, reject conflicting
   replay, and record actor/date in the existing delivery audit. Do not permit
   QC changes, invoice edits or duplicate delivery from the restricted action.
7. Add Receptionist to Manager secure account creation. Initial password is
   supplied through the existing password field, never committed or logged.

## Required acceptance evidence

- Manager creates the role; Receptionist cannot create/reset other accounts.
- First password change and session revocation work; disabled credentials fail.
- Only Reception is visible on Android WebView, iPhone Safari and PC Safari.
- Crafted API requests, role fields and module navigation cannot bypass denial.
- No full workshop/financial state is returned or exposed from a prior session.
- Checklist -> existing quotation/approval actors -> Receptionist CREATE_JOB
  transfers the approved quantities exactly once.
- Manager-linked vehicle corrections and stale-save protection still hold.
- Physical movement updates only after server confirmation; VWC remains distinct
  from delivery and does not disable active Job Card/parts operations.
- Delivery refuses incomplete work, missing/stale/failed QC and cancelled jobs;
  concurrent work or QC changes cannot invalidate a successful delivery.
- Delivery loss/restart/retry uses the same UUID; different actor/body replay
  cannot duplicate or incorrectly confirm delivery.
- Delivery preserves work history, purchases, consumables, expenses and invoices.
- Existing Supervisor/Manager delivery/QC behavior remains unchanged.
- Physical-device and real isolated Edge Function evidence is separate from
  browser emulation and APK build results.

Run committing/concurrency scenarios only in a disposable isolated PostgreSQL
database. Never deploy tests/fixtures/reception-postgres17-baseline.sql, consume
live business sequences or commit empty live-status arrays.

## Activation and account creation

This is an extension to the pending coordinated Phase 2 release, not a production
activation instruction. Test the new role in an isolated backend and acceptance
client first. Review the ordered migrations, staff-auth/workshop-api and client
activation as one release; do not deploy Job Card guards alone.

Create a production receptionist credential only after verified activation is
authorized. The account User ID and display name are not yet supplied. A Manager
sets a temporary password privately through secure account creation; the user
changes it at first login. Physical acceptance, real isolated Edge Function acceptance and
production credential creation remain outstanding.

The implementation adds pending migration 20261009175402_reception_receptionist.sql,
server allowlists/projections, secure account creation, a dedicated Reception client
and server-owned, idempotent delivery. No live database objects or credentials were
changed. No physical device acceptance is claimed.



## Implementation and activation notes

The pending role migration filename was generated by Supabase CLI 2.120.0 in
workflow run 37969491834; it follows all eight original Phase 2 migrations.
Existing atomic creation, authority, approval, cancellation and retry bodies are
retained with checked permission-expression changes. Definition drift aborts the
migration. The wrapper and Edge allowlist restrict Receptionist operations.

The dedicated client is receptionist.html with receptionist_session.js; it reads
only the secure-session record and its own Reception command journals. It does
not load shared workshop state or other module scripts. Existing login redirects
Receptionists to that page. Manager secure account creation offers Receptionist
and the server forces department Reception, hashes the initial password and
requires a password change. Workshop API rejects temporary-password Receptionist
sessions until that change is complete.

Delivery uses receptionist_delivery_list / receptionist_deliver, not the broad
qc_delivery endpoint. It permits RC-linked vehicles only, rejects financial
fields, performs current QC/work checks on each optimistic commit attempt,
preserves histories/costs and refuses an empty live-status array. Successful
delivery retains the UUID, actor and request fingerprint in server-owned QC and
delivery history. Exact replay returns confirmation without another write;
changed actor, job or review revision conflicts. The client preserves the UUID
across restart/lost response/offline operation and requires an explicit retry.
Offline operation does not claim a successful server write.

The acceptance manifest now lists all nine migrations and hashes staff-auth
source as well as workshop-api and client source. In an isolated backend, apply
all nine in order, deploy the complete workshop-api folder (including the delivery
rules) and captured staff-auth folder with the existing custom-session configuration,
then use the prepared QA client. No production reference may be used for acceptance.
Do not activate staff-auth role creation before the complete restricted API is ready.

For production review: retain live staff-auth v4 / workshop-api v58 preimages,
schema/function/grant snapshots and backup/PITR evidence; pause writes as described
in DEVICE_ACCEPTANCE; apply the nine ordered migrations; deploy the complete
restricted workshop-api before staff-auth account creation; verify role denials,
then activate the verified client and create the named account through Manager
User Management. Create no production Receptionist credential during QA testing.
Before resuming writes, verify existing staff workflows and the restricted role.
Keep V304 live until the coordinated verified release is authorized.

If activation fails before new writes, keep writes paused and recover from the
reviewed preimages or complete the verified bundle. After new writes, revoke
Receptionist sessions/creation and pause affected operations while preserving
command receipts, delivery/QC audit, all approvals, parts transfers and financial
records. Prefer a forward fix. Do not remove the role constraint while Receptionist
credentials exist, reset sequences, drop new audit records or blindly restore a
backup over later workshop work. Reconcile retained UUIDs before retrying clients.

Use a clean Receptionist browser/device profile for acceptance. The dedicated page
does not read prior Manager caches; existing caches are not automatically erased
because they can contain unconfirmed workshop work. Verify privileged-session
handover and use a separate profile for Receptionist operation. Menu/API denial is
not a claim that browser localStorage isolates users sharing the same profile.

Manual acceptance remains required on physical Android WebView, iPhone Safari and
PC Safari, with real isolated Edge transport and at least two devices. Exercise
full checklist/approval/Job Card/additional approval/cancellation workflow with
appropriate actors, then Receptionist delivery; repeat loss/restart/offline/reconnect
and concurrent work/QC/cancellation changes. Record device, OS/browser, source SHA,
QA project, migration hashes, API versions and retained request UUIDs.
