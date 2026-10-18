# Accountant development implementation

Branch: architecture-v2. Base checkpoint: 4c9648d3d4c375c48b581429dc26eb855097a860.
Production main and production Supabase are outside this implementation's deployment scope.

## Delivered behavior

The isolated Accountant page exposes nine modules: JC financial search/detail, actual consumables, received paint, confirmed spare parts, read-only leave, cash journal, insurance LPO, outstanding balances and monthly comparisons. Six summary cards open reports. Filters, paging, PDF and Excel-compatible SpreadsheetML exports use server-derived reports. OMR values use three decimal places. Mobile layouts retain readable labels and horizontally scrollable tables.

Manager User Management includes Accountant Accounts: create, temporary password/reset, login alias change, activation/deactivation and paged account audit. Immutable staff ID preserves historical references when login changes. Password hashing reuses staff authentication. First-login password change is mandatory; sensitive account changes revoke sessions. No password is persisted in browser storage or audit payloads.

Accountant requests route through an explicit server allowlist before workshop handlers. Accountant cannot manage users, change assignments/time, approve QC/delivery/leave or configure workshop settings. RLS-enabled accounting tables have no anon/authenticated grants; privileged RPCs additionally verify actor roles. Accountant financial commands require session verification, validated payloads, a request UUID, snapshot/finance revisions and correction reasons.

The append-only journal records receipts, cash expenses, reversals/replacements, allocated-cost adjustments and invoice corrections. Commands preserve old/new amounts, actor, reason, timestamp and linked JC. Exact retry receipts prevent double posting after a lost response. Conflicting corrections fail rather than silently overwrite. Invoice corrections update the authoritative invoice and linked LPO document amount atomically; document collection is not cash receipt.

## Financial sources and boundaries

- Consumables: locked, nonvoided actual usage with historical unitPriceSnapshot; suggested/issued quantities are not expense.
- Paint: received orders only, returns deducted; NIL zero. Missing/unconfirmed values remain Pending.
- Parts: existing event projection, confirmed per-unit purchaseAmount times quantity; returned state removed from allocated cost. Pending amounts remain separate. Source event IDs are replayed once.
- Labour: configured rate and merged closed actual sessions within normal Oman shifts; Friday/holidays/overtime excluded using existing rules. ID001 excluded except explicitly linked preliminary transfers. Missing rate or open sessions remain Pending.
- Revenue: verified finalInvoiceAmount plus invoiceDate. Vehicle cash amounts and delivered counts are not receipts.
- Cash: verified journal CASH_IN less reversals. Partial receipts reduce outstanding. Earlier unpaid invoices carry forward; receipts after an as-of date do not reduce that date's outstanding.
- Insurance LPO: authoritative insuranceLpo document; LPO receipt alone never creates payment. Collection uses verified associated journal receipts.
- Estimated gross profit: invoice less allocated JC costs; not net profit. Cash Out is not added again to overlapping allocated costs. Missing source values are not invented as zero.
- Financial adjustments overlay allocated costs without altering technician time or material operational records. Monthly source totals are restated using current corrected authoritative records. VAT is not separately modeled by available source records and must not be represented as tax-exclusive net profit.
- Journal commands serialize against each other and workshop snapshot revision. External parts events are projected sources, not locked by the journal RPC; additive cost adjustments preserve their own audit trail.

## Deployment and release gates

QA only: omqgkqknbdcnotabffek. Initial ledger migration and forward LPO audit migration applied. staff-auth version 3 and workshop-api version 7 deployed for QA acceptance. Existing JWT configuration remains disabled because these functions verify their own staff sessions.

Synthetic QA accounts/jobs and append-only audit/journal fixtures were used; synthetic accounts were deactivated and sessions revoked. Interrupted receipt testing was reversed with an audit reason. Existing jobs and nonfixture workshop data were hash-compared and unchanged. Do not delete fixture journal history.

No production deployment or production schema change occurred. Before any release: complete CI/browser/Android acceptance, owner review of financial mapping (especially VAT/source completeness), QA real-device testing, backup/rollback verification, and explicit approval for production migrations/functions and any production application publication. Do not merge or push main as part of this task.

## Verification

Automated tests cover actuals/returns/prices/labour and unknown-source behavior; PostgreSQL append-only/RLS/grants, immutable IDs, retries, conflicts and corrections; actual staff-auth and Accountant APIs; Manager/accountant DOM behavior; export payloads and account-switch clearing. Existing Reception regression passed locally. Broad shared regression reached the native Java check; local javac is unavailable, so CI installs Java17. Local Chromium cannot launch in this sandbox; branch-only CI installs Chromium and checks 320/375/768/1280 layouts. Android CI compiles a debug artifact only, not a production release.

Live QA HTTP acceptance passed Manager account creation, temporary-password restriction, password change, restricted workshop/user-management denials, JC search/detail, exact receipt retry, stale conflict, partial payment, audited correction/reversal, login rename and session revocation/deactivation. Live QA tests use generated fixture credentials; no credential values are committed.

## Final CI evidence (2026-10-18)

[Accountant acceptance run 39095453786](https://github.com/zukaitauto/zukait-time-track-android/actions/runs/39095453786) passed both jobs on 162f5b25ddef9df39743f61040c02910369e27a7: JavaScript validation, full shared regression including native Java lifecycle, Reception regression, Chromium at 320/375/768/1280 and Android debug compilation. The prior responsive run found a 320px native date/month field overflow, now fixed by allowing grid/flex children to shrink. The initial Android acceptance workflow attempted an obsolete SDK tools package; it now uses the runner SDK and installs only the required platform/build tools. Existing Android architecture-v2 and APK verification builds also passed on the initial implementation commit.

A legacy Reception preview workflow automatically triggered when its own file changed. Its pinned historical source lacked Accountant assets, so preparation failed before deployment. It is now manual-only, with regression coverage for the publication boundary; historical preview packaging does not attempt to copy files absent from its pinned source. No Pages deployment took place.

QA recheck: all three synthetic staff accounts inactive; all three Accountant journal/account-audit/command tables have RLS enabled and no anon/authenticated CRUD privilege. QA-only deployed workshop-api version7 bundle SHA256: 35f9e5960191f878978210e7e33bb4b159b467362212eef13c20e5b4bfc1cf38. Subsequent forward source changes and final acceptance are recorded in the branch commit history.

Release readiness: browser automation and Android compilation are verified. Physical Android device acceptance, actual PDF sharing/printing, Excel application opening and business acceptance against representative QA invoices remain release gates; payload generation/escaping/numeric precision are automated. Production migrations/functions and application publication still require explicit owner approval after those gates. No production schema, production records or main commits were changed.

Final QA source update: workshop-api version8, bundle SHA256 b73ca0a5508ea8c2e7a7225d59a40d117de4ede04b0809850278ceeddc0654bb. LPO report now includes latest collection date derived only from verified, unreversed receipts. Final financial, actual auth/API, PostgreSQL and DOM/export tests were rerun successfully after this change.

## Manager dashboard access

Manager now has Accounts in the second column beside Reception. It opens the financial workspace using the existing verified Manager session; a Back to Manager dashboard action preserves that session. The server already explicitly permits Manager for scoped Accountant reporting/commands. Other operational roles remain denied. Accountant account administration remains a separate Manager-only User Management action. DOM/API tests exercise both Manager and Accountant financial flows; responsive CI runs both roles. This change is development-only on architecture-v2 and does not publish the live app.

## Physical-phone QA package

`accountant-phone-qa.yml` builds a separate `com.zukait.timetrack.acceptance` application and a QA web asset bundle using the established isolated preparation script. It rewrites all client backend references to omqgkqknbdcnotabffek, verifies Accountant/account-management/authentication endpoints, and disables the native production updater. It cannot replace the installed production application. The artifact contains no passwords or server credentials, and is not a production release. Its manifest records source identity; it does not apply migrations or certify physical acceptance. A dedicated QA login is required; production staff credentials must not be reused for testing.

## Owner-authorized live-app testing release preparation — V337

The owner approved activating the Accountant backend and publishing Accounts inside the existing Manager module with “PROCEED” after an explicit production approval question. Physical acceptance remains NOT_RUN; testing is requested inside the live app. This approval does not activate unrelated Phase 2 features.

The production compatibility check found four pre-existing staff IDs outside the new-account alias format. Staff authentication now preserves legacy immutable login IDs (including punctuation) while Accountant account management still enforces strict unique alias validation. A real auth/API regression covers this case before deployment.

V337 has a dedicated Accountant release scope with explicit owner authorization, exact-source signed/Reception/Accountant workflow provenance, backend file/hash/version evidence, credential preservation, financial QA and rollback evidence. The coordinated publisher remains manual-dispatch and retains its source-drift, signed certificate, accepted APK bytes, public Pages and updater-parity gates. The approval dispatcher only invokes that publisher after matching an explicit approved activation record; it cannot publish directly or run on main. Historical V336 UI approval cannot authorize V337. Existing job-type correction remains installed independently.

## Accountant production backend activation — owner-authorized live testing

Applied Accountant ledger and LPO-audit migrations to production after owner approval. Staff credential count stayed 28 and the preservation checksum stayed identical before/after. No Accountant accounts or fake financial transactions were created in production. staff-auth version7 and workshop-api version71 were deployed; every uploaded file was read back and matched the reviewed source. Bundle SHA256 values: staff-auth `4029737a89f1fe5edb4b8c53f78def741d49b58136bb3cd6c6775ae74e841f45`; workshop-api `3952968e96a2b96e4afc9ef3876b90a8382b52f1eb8489e5ea6a59002641ee8d`. Pre-deployment complete function bundles were captured locally for rollback.

Production Supabase default service-role grants were broader than isolated fixture defaults. The forward `accountant_append_only_grants` migration was tested and applied to QA and production: journal/command/account-audit tables now explicitly allow service SELECT/INSERT only, with UPDATE/DELETE/TRUNCATE denied. BEFORE TRUNCATE triggers also protect owner-level truncation. RLS and ordinary-client denial remain enabled. All three live tables were read-only verified to have no service mutation privileges and both mutation/truncation triggers. Automated tests attempt owner truncation against isolated PostgreSQL only.

The V337 acceptance workflow now also checks the deployed production HTTP endpoints with a nonexistent session. These requests must be rejected; they contain no real staff credentials and cannot post financial records. Production authenticated functional testing remains the owner's live-app acceptance step. Existing V336 updater metadata is retained until successful coordinated V337 publication. No main changes are authorized.

The least-privilege check additionally executes POST/CORRECT/REVERSE with `SET ROLE service_role` in isolated PostgreSQL. The forward `accountant_append_only_corrections` migration removes an unnecessary FOR UPDATE on immutable journal source rows; the existing journal advisory transaction lock still serializes all corrections. This permits service-role corrections using SELECT/INSERT only, without restoring UPDATE grants. The exact forward migration passed isolated tests and was applied to QA and production before publishing the UI. No real production journal transaction was posted for this test.

## Follow-up audit after V338

Scope: Accountant client navigation, existing-user administration, financial-entry revision provenance, exports, and the existing server permission/append-only tests. No production writes or schema changes were made.

Fixed four findings:
- Removing the standalone Accountant Accounts button made maintenance inaccessible from normal User Management. Authoritative Accountant rows now appear in Existing Users, with a per-row Manage account action, role/status/search filtering, and verified Manager/session checks. The removed standalone button stays removed.
- A delayed financial-detail response could replace a newer job selection or reopen details after navigation. Detail requests now have a selection generation; navigation also closes stale correction targets.
- The search-only initial screen discarded the report revision needed by Cash Entry. Snapshot and finance revisions are retained independently of result visibility/export availability.
- Exporting after editing filters used the draft inputs instead of the displayed report filters. Exports now use the captured applied filters and existing revision checks.

Local verification: both-role DOM/API/PostgreSQL dashboard tests, Manager account management DOM/PostgreSQL, actual auth/API permissions and first-login restrictions, ledger correction/reversal/idempotency/grants tests, and JavaScript syntax checks. Added explicit late-response, module-navigation, initial-screen Cash Entry revision, normal Existing Users maintenance, and draft-filter export regressions. Physical-device acceptance remains unperformed. This audit does not itself publish a new version.

## Financial-entry and account-switch follow-up audit — V340 candidate

Cash correction now preserves the original transaction date instead of silently replacing it with today's date. The date remains explicitly editable. Pending financial requests stay recoverable under their original account key, while session invalidation/logout removes the pending notice from the visible page. Financial submissions recheck account identity on entry and after failed requests. The shared request handler also rechecks identity on network failure.

Starting a report load clears the previous result and disables financial entry/exports until verified revisions arrive. Stale row actions are ignored. In-flight exports reject report navigation rather than producing a file after the user selects a different module.

Both-role DOM/API/PostgreSQL regressions cover historical correction dates, unchanged correction amounts, interrupted-payment retry retention without cross-account display, and delayed export cancellation. Actual auth/API permission and append-only ledger tests remain passing locally. No backend, schema or production data changes are part of this pass. V340 publication is disabled until verified and explicitly released.

## Accountant administration navigation/retry audit — included in V340

Delayed account-list responses now apply only to the original modal and latest list request. Confirmed account changes no longer reopen a modal after the Manager navigates elsewhere. Retry commands (which may contain a temporary password in memory) are scoped to the initiating Manager identity and session token; a new identity/session clears the old in-memory retry instead of carrying its credentials or blocking a new request. No passwords are persisted to browser storage.

Isolated DOM/PostgreSQL tests cover leaving during list loading, leaving during password-reset acknowledgement, a server-committed creation with a lost response, and starting a different creation after session renewal without sending the stale token. Existing rename/activation/first-login/session-revocation/ledger permission tests remain unchanged. No backend deployment or production mutation is required. These fixes join the pending V340 financial-entry fixes; V339 remains the live release.

## Accounts module dashboard — included in V340

Accounts now opens a Reception-style home with six linked financial summary tiles and nine coloured module cards. Selecting a card opens the existing report workspace; filters, tables, entry and correction forms stay out of the home view. Back to Accounts Dashboard closes entry/correction details and reloads the unfiltered summary. Module cards use readable dark text, distinct pastel colours, compact icon badges and a responsive two-column phone/three-column desktop layout. Reduced-motion settings are respected.

The financial APIs, permissions and calculations are unchanged. DOM tests click every module card, verify home/workspace visibility and exercise Back navigation. Both-role Chromium tests capture home and report screens at 320/375/768/1280 pixels. Existing financial-entry, retry, export and account-switch regressions remain included. These UI changes join the unreleased V340 audit fixes.

## V340 final coordinated acceptance

The owner requested publication after the Accounts redesign. The final candidate includes the V340 financial-entry and administration audit fixes plus the Reception-style module home and 320-pixel header-wrap correction. All signed APK, Accountant, Reception and Android checks must reference this final candidate before publication approval is recorded. No backend deployment or production database writes are required. Physical-device/business acceptance remains NOT_RUN.

## V341: Accountant account menu, JC 360 expense lines and Cash invoice receipt policy

The Accountant role header now follows the Supervisor identity/network/menu pattern. The menu contains Refresh Reports, App Update/About, Change Password, Logout and Android Exit App. Android update checks use the existing native checkForUpdates / v72UpdateCheckResult / openUpdatePage flow and signed updater; web shows Reload Web App. The network badge reports device connectivity, not server synchronization. Password changes reuse staff authentication, rotate sessions and retain tokens in native secure storage. An optional session-bound password-change path resolves the current login alias from the immutable authenticated staff ID and rejects changing another account; the existing first-login password flow remains intact.

JC 360 includes expandable Consumables, Spare Parts and Paint item tables, using the same scoped authoritative expense rows as the reports. Pending costs remain pending. Returned amounts and net costs remain visible.

Owner explicitly confirmed that existing and new Cash invoices mean money received. A verified Cash final invoice now confirms receipt on its invoice date. Earlier posted receipts are deposits deducted from the invoice-derived balance. Later receipts reconcile the already-confirmed invoice amount before any excess is counted. Cash reports expose posted and counted amounts separately; this avoids duplicate counting across reports/months while preserving overpayments. Credit/insurance still use recorded receipts. Missing/invalid invoices do not create receipt values. Invoice-derived rows link to the JC and invoice author/history, are marked as invoice sources, and cannot be edited/reversed as ledger UUIDs; corrections use the invoice workflow. This is a read-only financial projection: no historical invoice/ledger rows are rewritten and no bulk fake transactions are inserted.

Isolated tests cover both roles, account-menu controls/native callbacks, secure password-token rotation, renamed-login password change, cross-account denial, itemized JC scope, receipts/deposits/late duplicates/month totals/overpayments, existing permission boundaries and append-only correction history. QA deployment only: staff-auth v5 (dfac91c48aa7969d67f9f6a6ee8613fbf7090862261cc262adb34730794fc532), workshop-api v10 (6ba1f8634dbc73c279d8bc58a4218ea0eb27bce1312dccdb5b5c7a20777956d2). Every deployed file was read back and matched. Existing custom session authentication and verify_jwt configuration are preserved. Production remains V340 with prior backend versions until a separately verified release; V341 publication is disabled pending production backend verification. No production records or schemas were changed.

## Workshop week correction — included in V341

Owner confirmed the workshop week is Saturday through Thursday night, with Friday a holiday. The Manager Actual Worked Hours cards and technician detail reports now share explicit Asia/Muscat calendar bounds: Saturday 00:00 through Friday 00:00 exclusive. On Friday, the previous Saturday–Thursday total remains visible; Saturday starts the next week. Monday no longer resets the weekly total. Today and month bounds use the same Oman calendar helper. Existing normal-duty calculations and saved sessions are unchanged.

A runtime regression verifies Saturday/Sunday hours remain in Monday's weekly card while the new Monday daily total is zero, ID001 stays excluded, card/detail totals match, Friday retains the week, and month/year transitions work. The test is exercised under UTC, Asia/Kolkata and America/New_York process timezones. Legacy fallback period calculations use the same Saturday–Thursday rule. No production session records were modified.
