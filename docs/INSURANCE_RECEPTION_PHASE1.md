# Insurance reception Phase 1

## Architecture and scope

Branch: `architecture-v2`. Release candidate: V304 (version code 267). Publication remains gated by the signed acceptance build and the existing release approval workflow.

The current application authenticates custom staff sessions through `staff-auth` and `workshop-api`. Operational jobs, technician sessions, leave, consumables, estimates and financial records live in `workshop_state`; V2 job/spare-part projections use separate server-controlled tables. Reception follows the latter pattern. Its RPC never updates `workshop_state`, job projections, employee sessions, parts, expenses or income.

The insurance dropdown in `manager_job_edit.js` has eight fixed companies. The new insurance master is seeded with exactly those names. Existing dropdowns are deliberately unchanged until shared identity integration in Phase 2.

Existing `secure_auth.js` Job Card deletion removes job assignments and sessions. It is unsuitable for the requested cancellation that retains technician time and expenses. This path is unchanged. Reception case closure refuses a linked JC; Manager JC cancellation needs a separate transaction, active-work/parts review and regression tests in Phase 2.

## Implemented source behavior

- Independent RC numbers, server sequence with no cycle, unique constraints and request UUID deduplication. Padding expands beyond RC9999. Failed transactions may leave gaps; numbers are never recycled.
- Required insurance master selection, make and model; optional customer, contact, registration, year, VIN, reading/unit, claim/gate pass and reception observations.
- Nine independent optional accessory ticks. Unticked means not recorded. No photo upload, storage or digital signature capture.
- Separate physical location (`VIW`/`VWC`), insurance outcome (`CTL`/`CASH_LOSS`/`CANCELLED`) and reserved approval/link fields.
- Server-confirmed movements with reason, actor, occurrence/recording times and optional expected return. Oman time is explicit for entered dates. Reject future/backdated movements that would contradict the current location history.
- Before-JC case closure, decision and handover evidence. CTL/Cash Loss require a VWC handover and recipient. Cash Loss creates no garage income. Cancelled creates no completed repair/delivery.
- Manager and Supervisor permissions plus Manager designation/revocation of reception access for existing staff accounts. Does not change existing staff roles or login behavior.
- Server revision checks, row locks, request advisory locks and append-only audit/movement/command grants.
- Search by RC, registration, customer, VIN and insurer; requested status filters; descending RC pagination, 100 per page.
- Mobile forms/list/detail, movement and audit histories, print HTML and handwritten signature areas. Native Android Print/Share PDF uses established bridges. Web uses Print/Save as PDF, with manual sharing of the saved file.

## Database and authorization

Migration: `supabase/migrations/20261008202932_reception_phase1.sql` (created using Supabase CLI).

Adds six RLS-enabled tables: `workshop_insurance_companies`, `workshop_reception_access`, `workshop_receptions`, `workshop_reception_movements`, `workshop_reception_audit`, `workshop_reception_commands`; one RC sequence; indexed history/lookups; and `zukait_reception_command(text,jsonb)`.

No direct `anon`/`authenticated` table or RPC access. The existing edge endpoint verifies the active, non-revoked staff session, supplies its actor ID, and invokes the SECURITY INVOKER RPC using the service role. SQL rechecks the active staff role/designation on every request. Client-supplied actor IDs do not control authorization. Audit/movement/command tables do not grant service-role update/delete privileges.

Phase 1 exposes no approval setter, JC linker or operational preliminary-parts transfer. Linked checklist observation edits are Manager-only. Shared vehicle identity edits fail closed until Phase 2 can atomically update the authoritative JC and preserve cross-module synchronization. This avoids creating conflicting vehicle records.

## Verification performed

- `bash scripts/ci-validate-js.sh`: passed, including new reception source.
- `PATH=/tmp/zukait-test-bin:$PATH bash scripts/ci-full-regression.sh`: all 133 existing Node regression programs passed. A local wrapper invoked the installed Java compiler module for the native-dialog test.
- `npm run test:reception`: DOM/runtime tests for optional fields, accessory semantics, no photo input, escaped content, lost-response retry identity, separate identical new checklists, confirmed movements, native print/PDF calls and dashboard launcher.
- `node tests/reception-api.mjs`: executed the stripped TypeScript edge handler with mocked transport; verified server session identity, actor spoofing resistance, body limits, revoked sessions and response status mapping. This is not a full Deno dependency/type check.
- Supabase SQL tests: migration + `tests/reception-phase1.sql` in a fresh single transaction followed by rollback. Tested required fields, extra/photo field rejection, request retries/conflicts, permissions/designation revocation, revision conflicts, movements, histories, all outcomes, linked-role restrictions, safe linked-identity/cancellation refusal, no existing workshop-state mutation and RC10000.
- Separate service-role transaction: RPC create succeeded with actual grants; rolled back.
- Concurrent test in a disposable unexposed schema: two simultaneous identical creates produced one RC and one duplicate response; competing edits produced one success and one stale-revision rejection. Schema was removed.
- Typical print rendered using WeasyPrint as one A4 page; PNG visually inspected. Long optional observations intentionally flow to additional pages instead of being truncated.
- `git diff --check`: passed.

## Deployment and release acceptance

The migration was applied to the existing Supabase project `pjknotnjkufadqavcmii`. `workshop-api` version 58 is ACTIVE, preserving its established custom staff authentication and `verify_jwt: false` setting. Live grants, RLS and eight seeded insurance companies were verified.

`tests/reception-live.mjs` passed read-only deployed checks using dedicated temporary Manager, Supervisor, Employee and designated Reception identities: access, denied spoofed actors, denied undesignated staff, master/list reads, malformed/guest requests, direct REST denial, and existing revision/live-status endpoints. It creates no reception/customer records. QA accounts and their reception designation are now inactive and all QA sessions revoked; dormant QA rows remain. The RC sequence was verified unused, so the first real checklist remains RC0001.

The initial source commit passed the Reception verification, Android debug build, unsigned APK/full regression, and Estimate GitHub Actions jobs. Chromium at 390px was visually inspected with the actual inherited application styles; no horizontal overflow. The release candidate makes the insurance selector full width on narrow screens for readability.

Direct `deno check` could not download the JSR dependency manifest. Local Gradle/Android SDK and physical Android/Safari devices are unavailable. GitHub Actions supplies Android compilation/signing checks. Native Print/Share PDF bridge calls have automated coverage, but physical Android PDF sharing and Safari device acceptance cannot be claimed from this environment. Web sharing uses the browser's Print/Save as PDF followed by manual sharing.

Release procedure: commit the candidate with `[verify-only]` (PC publication suppressed), obtain a successful signed acceptance run for that source, then approve that exact source/version through `release-request.json`. Verify signed APK publication, latest-version metadata and Pages deployment before reporting release success. No changes target `main`.

Phase 2 remains separate: insurance approval, RC-linked estimates/preliminary parts, atomic JC creation/linkage, authoritative shared identity propagation, JC location badges and preservation-safe Manager cancellation. Phase 3 receivables/LPO/payments is not implemented.
