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
