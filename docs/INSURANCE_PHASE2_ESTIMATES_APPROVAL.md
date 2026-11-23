# Insurance Phase 2: RC estimates and approval recording

Branch: `architecture-v2`. This increment follows the preliminary-parts preparation commit. Both Phase 2 migrations remain unactivated; V304 remains the staff release. Do not activate these transitions until approved RC-to-Job-Card creation and legacy creation-path enforcement are integrated and tested.

## Estimate integration

Reception exposes an Estimates & Approval workspace when its server GET response supports it. Manager/Supervisor can prepare a new quotation through the existing Estimate module. Vehicle/customer/insurance information is fetched from the server RC and prefilled; identity inputs are read-only in this preparation mode. Existing standalone/Job Card estimates and calculations retain their established behavior.

A failed official number allocation retains its request key for retry. The existing sync queue saves the quotation. Linking requires the quotation to actually exist in server `workshop_state.data.estimates`, with its ID/number matching the official server allocation table. Local save messages are not accepted as server proof. Existing matching standalone quotations can also be linked. A quotation cannot belong to two RCs; conflicting links fail safely, including concurrent insertion through a conditional unique-key upsert.

Linking compares vehicle/customer/claim details with the RC, rejects an estimate already attached to a Job Card, and records a server snapshot and identity snapshot. Refreshing a revised quotation appends audit history while retaining the link ID and immutable previous approval evidence.

## Approval authority and evidence

Manager/Supervisor record the quotation, approval reference, Oman approval date, OMR amount (maximum three decimal places), reason and explicitly selected approved part quantities. Unselected items are not approved. Quantities must be whole numbers within the preliminary requested quantity; duplicates or unrelated IDs are rejected. Labour-only approval can have no selected parts.

Approval snapshots retain the exact server quotation, preliminary list, approved subset and RC identity, with actor and server recording time. A changed quotation or RC identity must be refreshed/relinked before approval. Approval sets the RC status to Approved but never moves VWC to VIW, creates a Job Card/operational PL, or records garage income.

Manager alone can return an unlinked case to Waiting for Approval with a required reason. Original approval rows remain immutable. New approvals append records rather than overwriting amounts. GET flags an approval for review if its quotation, preliminary list or shared identity changes; tools/fuel/observations do not invalidate vehicle identity. Future Job Card creation must revalidate the snapshot in its locked transaction; this GET flag alone is not authorization.

Closed cases and linked Job Cards refuse approval/link mutations. Additional approvals after JC creation are deliberately not enabled until integration with the operational parts workflow is ready. Designated Reception Staff can view the workspace/history, but cannot prepare/link/approve/revoke.

## Database and compatibility

Migration `20261009075901_reception_estimate_approval.sql` follows `20261009074037_reception_preliminary_parts.sql`. It adds `workshop_reception_estimates`, append-only `workshop_reception_approvals`, a pure INVOKER identity helper, and an INVOKER dispatcher under the existing RPC endpoint. Prior Phase 1 and preliminary-part commands remain delegated to their verified implementations.

Tables have RLS, no anon/authenticated grants and no service-role delete grants. Approval rows have no service-role update grant. RPC/helper execution is service-only, with the existing edge session verification unchanged. Writes use active SQL role checks, required reasons, request UUID locks/deduplication, RC row locks/revisions and append-only audit. Lock order for the future linked transaction is RC first, then workshop state.

## Verification and limitations

- DOM/runtime checks cover server prefill, read-only identity, stable allocation/retry keys, approved selection/partial quantities, three-decimal display, preserved history, stale-source warnings and read-only reception access.
- Both pending migrations and SQL assertions ran in one rollback transaction against the existing schema, including actual service-role execution. Tested official server quotation checks, cross-RC link refusal, role restrictions, stale revisions, retry deduplication, changed source rejection, partial approval, malformed/future dates, decimal precision, audit history, Manager revocation and closed/linked refusal.
- Fixture RC/estimate numbers were inserted explicitly with negative sequence values; neither business numbering sequence was consumed. Temporary estimates were added to shared state only inside the test transaction and rolled back. No operational part/event transactions were created; post-test checks confirmed no reception fixtures or persistent schema activation.
- The full existing regression suite (135 invocations across 134 distinct programs), JavaScript/asset checks and reception edge tests passed. Chromium at 390px and 1280px showed no horizontal overflow with inherited application styles; checkbox/quantity enablement passed and the mobile form was visually inspected. GitHub Actions verifies the Android candidate. No physical Android/Safari acceptance is claimed.

Remaining Phase 2: atomic approved RC-to-JC creation/linkage; enforcement across legacy/manual creation paths; authoritative cross-module identity correction and linked VIW/VWC badges; duplicate-safe approved parts transfer through normal allocation/events; additional approvals; preservation-safe Manager cancellation after reviewing active work and outstanding parts. Phase 3 remains separate.
