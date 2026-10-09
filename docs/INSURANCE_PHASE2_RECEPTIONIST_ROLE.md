# Reception-only staff account requirement

Status: code implemented; automated results are recorded in branch CI. Real isolated
Edge transport and physical acceptance remain pending. **Not activated**.
Requested 2026-10-09. Applies only to architecture-v2.
Production stays V304 / versionCode 267 until verified release authorization.

## User workflow

**Login/launcher rule:** existing Manager and Supervisor users keep their
current User IDs, passwords, and workshop sessions. Each signed-in Manager and
Supervisor dashboard shows one near-top **Reception** button that launches
Reception in the same application session, without reauthentication or opening
the Receptionist-only login page. Other workshop dashboards must not display
that button. Server-side role and Reception capability checks remain enforced.
Only newly created dedicated Receptionist staff receive a separate Reception
login, created by the Manager using existing User Management and forced
first-password change; never create extra Manager/Supervisor credentials.

A named Receptionist signs in with an individual User ID and temporary password,
changes that password on first login, and sees only the Reception workspace.

The Receptionist can:
- Create and update Reception checklists, record checklist observations, and print.
- Record confirmed physical vehicle movements using existing Reception rules.
- Open cash/credit Job Cards directly from Reception with customer/account details.
- See insurance approval status and create insurance Job Cards after authoritative
  quotation approval or authorized recording of an already issued approval.
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


## Automated evidence and expanded checks

The first complete implementation, 8c3a4cbd8a09dfa0e256c636252ff863a26c2d0b,
passed Reception run 37971545407 (job 113959149352), debug APK 37971545604,
unsigned Android 37971545602, signed acceptance 37971545411 and Estimate checks
37971545636. Publishing run 37971545571 was skipped. This baseline included the
new auth/PBKDF2, role API/privacy, delivery/CAS and restart/offline DOM tests,
all existing rollback SQL integration tests and nine PG17 transaction overlaps.

The expanded suite additionally exercises the dedicated Receptionist page on
Chromium/WebKit at 1440, 1024, 768 and 390 pixels, and four real PostgreSQL
state-lock overlaps for delivery: identical UUID/CAS retry, new work, cancellation
and Manager vehicle correction. The suite checks both original and new work
history, unrelated expenses/consumables, original employee live status and all
business sequence values. It commits only in its generated disposable database.

Delivery now includes the confirmed vehicle identity as well as the QC revision
in its request fingerprint. A changed vehicle requires a fresh physical review;
an exact lost-response retry still confirms the original committed receipt. The
client displays the saved retry immediately after uncertainty, retains it through
reconnection, and uses readable messages for review/session failures. Vehicle
handover/location is recorded using Checklist movements; delivery is an independent
QC-guarded confirmation and does not silently change VIW/VWC.

The read-only real-transport preflight now checks authoritative roles for all four
QA identities, requires Receptionist (not a designated Employee) for the reception
identity, rejects shared-state/staff reads and verifies the minimal delivery DTO.
Its self-test is mocked and is not evidence of real HTTPS or physical acceptance.

Read-only live reinspection on 2026-10-09 still found staff-auth v4, workshop-api
v58, the original role constraint and none of the nine pending migrations applied.
Only the live project is connected; adb and xcrun are unavailable. No account,
database object, deployment or release was created in production.

The existing spare-parts trigger execution advisor warnings remain until the
pending hardening is activated as part of the full bundle. Remediation references:
[anon execution](https://supabase.com/docs/guides/database/database-linter?lint=0028_anon_security_definer_function_executable) and
[authenticated execution](https://supabase.com/docs/guides/database/database-linter?lint=0029_authenticated_security_definer_function_executable).

Remaining acceptance: a separate QA project and protected QA sessions, actual
Edge transport, multiple physical devices, Safari/WebView reconnect/lost-response
checks and final release authorization. Actual Receptionist User ID/display name
and production credential creation remain pending; Manager sets the temporary
password privately after authorized activation.

## Direct Job Card intake extension (pending acceptance)

Reception now includes Open Cash / Credit Job Card. The server creates a linked
checklist and an unassigned Job Card in one transaction. Make, model, customer,
contact, creation reason and confirmation that the vehicle was received are
required. Credit additionally requires an account/customer reference. This is
an account reference, not a new credit-limit or lending authorization system.
The established job classifications, work assignment, costs, invoices and QC
remain in their existing modules. Receptionists cannot enter financial amounts.
Intake observations remain on the checklist.

For a vehicle arriving with insurance approval already issued, Manager or
Supervisor records the approval reference, date, document evidence and reason
on its checklist. This creates an immutable identity snapshot without generating
a replacement estimate. The receptionist can then open the approved Job Card.
The external route requires an empty preliminary-parts draft; existing drafted
parts use the tested quotation/parts approval and exact transfer route. New
Job Card parts continue through the established parts workflow. Receptionists
cannot approve their own insurance jobs or change recorded approvals.

The pending ninth migration is extended (it has never been deployed), after
the original eight unchanged migrations. It adds authoritative job_type, permits
a null insurer only for cash/credit, adjusts linked-vehicle authority to preserve
classification, and adds the private RLS-protected immutable external-approval
table and service-role-only RPCs. Existing rows default to INSURANCE. Retry UUIDs
and actor/command fingerprints are enforced before any write, including atomic
intake. Do not deploy this migration or either API independently of the release.

Acceptance must cover cash, credit and issued insurance approval on real devices
and real isolated Edge transport, as well as the existing quotation flow. None
of these paths has been activated in production or counted as physical testing.

Direct-intake follow-up verification preserves the credit-account reference on
the authoritative Reception row as well as the linked Job Card, so stale state
saves cannot remove it. Browser checks also cover credit-field visibility, cash
intake and the issued-approval creation form at every tested layout. The actual
SQL overlap suite includes 14 scenarios (the original nine, four delivery races
and one simultaneous direct-cash intake UUID).
