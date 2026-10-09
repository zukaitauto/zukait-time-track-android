# Phase 2 physical-device acceptance preparation

Status on 2026-10-09: **PREPARATION ONLY; ACCEPTANCE NOT PASSED**.
Branch: architecture-v2 only. Source inspected: `52fa0d3d6e54d00ba3788f032816e55025245662`;
previous verified implementation: `ec47e1c6e291b5f03c0425df83b79452400ff30a`.
V304 / versionCode 267 and workshop-api 58 remain live.
The next candidate is V305 / versionCode 268; it is not approved for publishing. No deployment, release,
production writes, sequence allocation or Phase 3 work is part of this change.

## Access and evidence

The managed workspace started empty. Shell clone failed because the configured
proxy was unreachable; a subsequent network-permission attempt was interrupted.
Repository files were inspected at the exact remote SHA through GitHub MCP.
The recursive remote tree contained no AGENTS.md. This is a partial local source
snapshot, not a complete git checkout or an Android build environment.
There is no adb executable, USB device directory, configured VPN, device connector
or configured device credentials. No attached physical Android/iPhone/Mac was
identified. PC Safari requires an actual supported Mac/Safari installation.
Chromium/WebKit emulation cannot satisfy these gates.

Read-only Supabase inspection confirmed PostgreSQL 17, workshop-api 58, the Phase 1
Reception RPC, and none of the eight Phase 2 migrations in production history.
There are no existing development branches. The spare-part trigger EXECUTE advisor
warnings remain live, as expected. The project name includes "test" but its reference
`pjknotnjkufadqavcmii` is the live workshop and must always be treated as production.
Update 2026-10-09: Supabase cost lookup returned USD 0/month and the
confirmation tool authorized creation of isolated project `zukait-v305-qa`
(`omqgkqknbdcnotabffek`) in organization `zukaitauto`, region `ap-south-1`.
It reports ACTIVE_HEALTHY with PostgreSQL 17.11 and a modern publishable key.
QA has **no public tables, Zukait functions, migrations or Edge Functions yet**.
This project is separate from production. Build the verified, schema-only
workshop foundation before applying the nine Phase 2 migrations; importing
production data, credentials, sessions, business sequence values or the local
PostgreSQL baseline fixture is prohibited. No QA migration or deployment was
performed during project creation.

Existing signed artifact `11627887497` from run `37955756227` is available until
2026-10-23. Its source is `ec47e1c...` and ZIP digest is
`sha256:64b2119844966cfed13eb8527a6a201bb9c7e5ef2a169a13f816ee12b63cc651`.
It uses the normal production package and endpoints; **do not install it as an
isolated Phase 2 candidate**. This ZIP digest is not the APK digest.

## Isolated backend preparation: execute only on the confirmed QA target

1. Record the non-production reference, owner, expiry, cost and allowed testers.
   Never infer safety from a project name. Obtain pricing confirmation before paid
   branch creation; reuse an existing explicitly designated QA project if available.
2. On the confirmed separate QA project `omqgkqknbdcnotabffek`, establish
   a schema-only baseline without GitHub auto-merge or production deployment.
   Inspect its actual tables, functions, triggers, policies and grants before use.
   Supabase dashboard branching can replay migration history instead of copying the
   complete schema, and custom roles may be missing. Reconcile against a read-only
   production schema export. Do not import production workshop/customer rows,
   sessions, credentials, storage objects or business sequence values.
   `tests/fixtures/reception-postgres17-baseline.sql` is for the loopback disposable
   PostgreSQL runner only: **never deploy it to Supabase**, including a QA branch.
3. Apply all nine pending migrations in the order below only to that QA reference.
   Keep the complete bundle unavailable to clients until all nine succeed. Verify
   function signatures, service-only grants, trigger installation and advisors.
4. Prepare synthetic `ZQA_RC_<run>_manager`, `_supervisor`, `_reception`, `_employee`
   credentials/access and isolated staff sessions using the actual staff-auth
   contract. Seed `workshop_state`, id `main`, with synthetic unrelated work,
   assignments, sessions, live statuses, purchases, consumables and expenses for
   preservation comparisons. Use realistic non-empty live statuses matching those
   sessions; never pass an empty live-status array to the state commit RPC.
   QA business sequences belong to QA only and may advance there. Never allocate
   production RC, estimate or PL numbers. Keep session files outside checkout and
   browser artifacts; do not log tokens or passwords.
5. Deploy the exact candidate workshop-api and every local imported rule file to
   QA only. Include `job_type_authority.js`, `paint_order_rules.js`,
   `qc_delivery_rules.js`, `time_management_rules.js`, `index.ts` and `deno.json`.
   Ensure staff-auth exists and its configuration uses QA credentials. Verify
   `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY` and publishable-key allowlist are
   QA-owned; keep secrets server-side. Both pending Edge Functions now **fail
   closed** when neither `SUPABASE_PUBLISHABLE_KEY` nor a valid
   `SUPABASE_PUBLISHABLE_KEYS` JSON allowlist is present. Supabase normally
   injects the latter for modern project keys; inspect the QA Edge Function
   secrets before deployment and test the real key, malformed/unrelated key,
   and missing-key denial. Repeat this configuration check before production
   activation so existing clients are not interrupted. Match the existing custom staff-session
   authentication and verify_jwt=false configuration, with unauthenticated denial
   confirmed over the real Edge endpoint. Do not copy a production service key.
6. Run the real transport preflight with protected QA sessions:

   ```sh
   ZUKAIT_RECEPTION_ISOLATED=1 \
   ZUKAIT_ACCEPTANCE_PROJECT_REF=<qa-ref> \
   ZUKAIT_ACCEPTANCE_PUBLISHABLE_KEY=<qa-publishable-key> \
   ZUKAIT_RECEPTION_QA_FIXTURES=/protected/qa-sessions.json \
   node tests/reception-isolated-transport.mjs
   ```

   Fixture JSON is an array of four `{name,id,token}` records with the above
   manager/supervisor/reception/employee IDs. This checks real HTTPS CORS, verified
   sessions, permissions, actor spoofing, malformed/guest requests and direct REST
   denial. It also sends a syntactically valid but unrelated publishable key
   with a valid QA session to both Edge Functions and requires HTTP 401. If
   either accepts it, configure the QA-only `SUPABASE_PUBLISHABLE_KEY` or
   `SUPABASE_PUBLISHABLE_KEYS` allowlist before retesting: a prefix-only
   fallback is insufficient. The preflight never logs session tokens.
   Staff-session heartbeat may update QA last_seen_at. It does not write
   Reception records or establish that Phase 2 schema/flows or devices pass.

## Concrete acceptance client preparation

The new manual workflow `insurance-isolated-acceptance.yml` runs only on
architecture-v2. Configure repository variables `ZUKAIT_ACCEPTANCE_PROJECT_REF`
and `ZUKAIT_ACCEPTANCE_PUBLISHABLE_KEY` with the confirmed QA target, then dispatch
**Prepare isolated insurance acceptance** at the reviewed branch commit.
No service key or production endpoint is accepted. The workflow never migrates,
deploys, publishes Pages, signs a production release or updates release metadata.

`scripts/prepare-insurance-acceptance.py` requires a clean architecture-v2 checkout
(or the exact detached Actions SHA), creates a separate build tree outside it,
and replaces the production backend reference/key throughout client text assets.
It refuses unexpected additional Supabase hosts and verifies the auth/cloud/
Reception replacements. Original source assets and version metadata stay untouched.
The candidate uses `com.zukait.timetrack.acceptance`, label `Zukait ACCEPTANCE`,
V305-ACCEPTANCE / 268, and disables native update checking/downloading/installing.
The separate package provides separate storage and cannot overwrite production.

The artifact contains a debug-signed APK, web assets, package/signature evidence,
APK SHA-256, and a manifest with exact source SHA, ordered migration digests,
API source digests and generated client digests. Backend and device acceptance
are labelled NOT_RUN. Debug signing may differ between runs: use disposable QA
installations and record the actual certificate. This build does not verify the
permanent production certificate or upgrade path; the existing signed acceptance
workflow remains a separate release gate.

Serve the generated `web/` assets at a dedicated HTTPS QA origin and open
`offline_test.html` in actual iPhone Safari and Mac Safari. Do not publish them
at the production PC origin. Keep browser storage separate from production.
Record both HTTPS origin and backend reference before login. Browser assets
are not deployed by the preparation workflow. Native-only features must be
tested in Android; web layout/flow tests must use actual Safari.

## Required physical acceptance record

Record candidate commit, APK hash/certificate/package, web asset manifest/origin,
QA reference, ordered migration hashes/API version, tester, time, device model,
Android/iOS/macOS version, Android System WebView version and Safari version.
Use at least Android WebView plus iPhone Safari concurrently, and Mac Safari for
desktop acceptance. Keep sanitized command bodies, request UUIDs, HTTP statuses,
server revisions, before/after SQL counts/digests and screenshots. Remove session
headers, passwords and customer data from all retained traces.

| Scenario | Required action and evidence | Status |
| --- | --- | --- |
| Complete initial flow | On Android create synthetic Reception in VWC, record accessories/fuel/damage/odometer/remarks, add two preliminary parts, allocate/link a real QA quotation, approve a partial quantity and create JC. On Safari observe the same server records. Verify immutable approval/source evidence and exact approved quantities in normal operational PL/projections. | NOT_RUN |
| Concurrent creation/retry | Submit the same CREATE_JOB UUID concurrently, then competing UUIDs at one revision. Count one JC, one transfer per source item, one correct PL allocation and cached retry; loser is stale/conflicting. Do not use arbitrary timing as overlap proof. | NOT_RUN |
| Additional approval | Add a round with new item UUIDs, distinct quotation and partial approved quantity; repeat approval UUID from another device. Verify one transfer, correct total quantities and unchanged earlier snapshots. Approval/arrival must leave VWC unchanged. | NOT_RUN |
| Authoritative corrections | Manager corrects make/model/year/registration/VIN/claim/customer/contact/insurer with reason, including clearing an optional field. Refresh Reception, Estimate, JC, Spare Parts, Consumables, 360 and Delivered Vehicles. Identity agrees; approval evidence retains its original identity; checklist observations stay checklist-only. Use a separate legitimately delivered QA job for Delivered Vehicles; do not deliver the cancellation fixture. | NOT_RUN |
| Stale writes/projections | Hold old full-state data on a second device, then save after correction; attempt isolated direct projection updates/rekeying through controlled QA SQL. Corrected identity/location/linkage survive. Preserve unrelated workflow, technician times/costs and financial records. | NOT_RUN |
| Server-confirmed movement | Delay/drop movement response. UI must not optimistically mark VIW/VWC. Retry identical command/UUID; refresh both devices to confirmed location. VWC leaves JC open, parts/work usable, no delivery/income/completion/session stop. | NOT_RUN |
| Cancellation review races | Open Manager review, add running/paused work or unresolved allocation from another device; cancel must fail. Resolve work using normal controls, review again, then change quantities/commercial parts data on second device; old fingerprint must fail. No forced technician finish or financial mutation. | NOT_RUN |
| Audited cancellation | Fresh review plus reason, Oman date, exact JC identity and acknowledgement succeeds once. Supervisor/Reception/Employee cannot cancel. Repeat UUID; verify one immutable audit, retained sessions/assignments/history/time/costs/purchases/consumables/expenses/parts commitments and location. Return/settlement after cancellation works; new/reopened work, QC and delivery are refused. | NOT_RUN |
| Lost response | For CREATE, parts save, estimate allocation/link, approval, CREATE_JOB, correction, movement, additional approval and cancellation: forward the request to the actual QA Edge Function and allow SQL commit, then drop only its response. Confirm commit server-side before retrying unchanged form. Capture identical UUID and cached result, without duplicate rows/transfers/audits or second number allocation. A browser route fulfilling a mocked response does not count. | NOT_RUN |
| Offline/reconnection | Disable network before submission and while a request is in flight. Keep forms/error states, no fabricated success/location/job/cancellation. Restore connectivity, retry unchanged request and compare authoritative state on all devices. Test local pending workshop work and stale conflict handling; it must not revert RC authority or erase work. | NOT_RUN |
| Background/restart | After response loss, background/foreground Android and Safari; also terminate/reopen each client. Confirm unresolved outcomes by server refresh before new actions. Record whether UUID survives each lifecycle; in-memory retries alone do not prove restart safety. Check edits to a retry form and session changes never reuse a UUID for a different command/actor. Fix any observed defect before sign-off. | NOT_RUN |
| Physical UI/legacy workflows | Android keyboard/rotation/back navigation, iPhone keyboard/scroll/focus, Mac Safari wide table/forms; normal cash/credit and grandfathered insurance jobs, time/QC/parts/expenses/reports still work. VWC is excluded from delivery counts. | NOT_RUN |

For response loss use a controlled TLS proxy on the tester's devices that matches
only the QA hostname, operation and chosen request UUID. Forward the request to
the real Edge Function; discard its response after commit is independently
confirmed. Save sanitized evidence and remove test proxy configuration afterward.
Turning Wi-Fi off without confirming server commit is insufficient evidence of
the lost-response case. Never point this fault injection at production.

## Ordered activation/recovery draft — not release authorization

Prepare the final review package only after every physical/transport row passes
on the exact release candidate and full CI passes. No guards-only deployment.

1. `20261009074037_reception_preliminary_parts.sql`
2. `20261009075901_reception_estimate_approval.sql`
3. `20261009084321_reception_job_creation_guards.sql`
4. `20261009090923_reception_create_job.sql`
5. `20261009094309_reception_vehicle_authority.sql`
6. `20261009104912_reception_additional_approvals.sql`
7. `20261009111840_reception_job_cancellation.sql`
8. `20261009153713_reception_trigger_privileges.sql`
9. `20261009175402_reception_receptionist.sql`

The ninth migration adds the requested restricted Receptionist role. Include
`supabase/functions/staff-auth` and the complete workshop-api folder in the
coordinated QA/activation bundle. See INSURANCE_PHASE2_RECEPTIONIST_ROLE.md for
role permissions, device scenarios and credential creation/recovery requirements.

Before activation record live schema/function/API versions, grants, backup/PITR
availability and current sequence values using read-only queries. Rehearse recovery
in QA and retain production API 58 source and original function/trigger definitions.
Plan an explicitly authorized write pause: existing clients must not see intermediate
guards while new insurance creation lacks the complete schema/API/client bundle.
Apply the complete ordered bundle, verify schema/grants and API imports/config,
then activate the verified client and restore writes only after smoke checks.
The permanent-signature APK and client rollout/version decision need their own
verified release evidence and user authorization; V304 stays live until then.

On failure before any new production writes, keep writes paused and recover using
the reviewed schema/API preimages or finish the known complete bundle after diagnosis.
Do not improvise function drops or bypass guards. After Phase 2 writes exist, prefer
a verified forward fix with retained append-only evidence. Blind schema rollback or
backup restoration can discard later work, approvals, transfers and finances.
Freeze affected writes, inventory committed UUIDs/rows/revisions, preserve all audit,
work and financial records, and reconcile cached responses before resuming. Sequence
numbers are never reset/reused to hide gaps. A destructive PITR restore requires
separate review of data loss and reconciliation. Deleting a disposable QA branch is
not a production rollback procedure.

## Verification for this preparation change

### Reception restart retry fix

Further inspection reproduced a lifecycle defect in the original client: after a
CREATE response was lost following commit, a fresh JS runtime submitted the same
command under a different UUID. The mocked server recorded two writes. Request
identity previously existed only in memory and was also reset by opening forms.

Reception now persists one unresolved command/UUID per backend endpoint and staff
identity before sending it. Closing/reopening forms or restarting the client does
not discard it. The visible **Confirm Saved Action** button explicitly resends its
original payload, then refreshes confirmed server state. No background auto-replay
is introduced. A different mutation is blocked until the saved outcome is resolved.
Confirmed success clears the journal so a deliberately new identical checklist
gets a new UUID. Known Reception validation/stale/not-found responses clear it;
transport/server/parse errors, auth/permission failures and conflicting request IDs
retain it. Storage failure prevents transport; corrupt journals are kept for
Manager reconciliation. Never clear device storage merely to bypass this guard.
If the response arrives while another staff identity is active, recovery does not
refresh the other actor's screen. No token/password is stored in the journal.

`tests/reception-restart-retry.mjs` executes the actual mutator in fresh JS runtimes
for 13 operation labels with shared synthetic local storage. It checks identical
payload/UUID, one cached write, changed-command refusal, actor isolation, definitive
rejection, storage failure, malformed/server/auth responses and explicit recovery.
`tests/reception-restart-dom.mjs` recreates JSDOM windows after lost CREATE/MOVE
responses, restores their saved storage, and exercises the actual recovery button.
Both use mocked transport and are included in `npm run test:reception`; they do
not establish physical WebView/Safari durability or actual Edge/cache behavior.
The RC-linked estimate allocator had the same in-memory lifecycle defect. Its
initial/additional allocation key now persists per actor/backend/RC/round until
a draft is saved. If a draft with that key is already present after a crash, it is
opened without another allocation, duplicate draft or CREATE audit. Existing
draft linkage must match the RC/round. Storage failure/corruption prevents a new
allocation. `reception-estimate-restart.mjs` covers fresh runtimes, response loss,
saved-draft recovery, scope isolation and storage refusal; the existing initial
and additional estimate DOM tests now recreate module memory before retrying.
These are mocked checks. Physical-device and actual Edge allocation/cache
acceptance remain required for both retry fixes; generic unlinked estimate
creation keeps its existing behavior.

- `python3 tests/reception-acceptance-preparation.py`: seven isolation/preservation
  tests passed locally. These use temporary synthetic build inputs, not an APK.
- `node tests/reception-isolated-transport-selftest.mjs`: passed production/key
  refusal, exact-host enforcement, read-only request contract, CORS/auth/direct
  denial assertions and explicit NOT_RUN labels. It uses a mocked transport.
- `node tests/reception-api.mjs`: existing API identity/input/permission/conflict
  checks passed locally using the handler test harness.
- Reception CI now includes both preparation checks alongside the existing
  Reception, real disposable PostgreSQL overlap, browser and JS checks. Record the
  resulting run URL/SHA separately; no new CI result is claimed by this document.

Remaining blockers: confirmed physical devices, an isolated backend with full
schema/auth/API configuration, QA hosting/session setup, generation and installation
of the actual isolated APK, real transport preflight and every physical row above.
No final activation plan is approved and no release is authorized.

References: [working with Supabase branches](https://supabase.com/docs/guides/deployment/branching/working-with-branches),
[dashboard branching limitations](https://supabase.com/docs/guides/deployment/branching/dashboard).
