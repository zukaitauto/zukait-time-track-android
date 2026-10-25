# Manager monthly Cash / Insurance performance

QA candidate on `architecture-v2`. No production deployment, release approval, database/ledger mutation or schema migration is part of this change.

## Owner-confirmed definitions

- Cash: a valid final Cash invoice counts in full as received, once, on its invoice date. Do not add deposits or later receipt entries again. Draft amounts and missing invoice dates do not become dated receipts.
- Insurance: LPO document amount, grouped by LPO received date. This does not imply that the insurer has paid.
- Net **job** profit/loss: the invoice/LPO amount minus recorded labour, actual consumables, net paint, received net parts and sublet costs. Profit percentage is profit divided by invoice/LPO amount. Zero revenue has no percentage. Workshop overheads and tax adjustments are not included in this direct-job calculation.
- Missing/unconfirmed costs stay pending. They do not become zero or confirmed profit. A company summary or graph remains pending if one of its included jobs has incomplete costs.
- Month boundaries use the existing Oman-date policy. Future dated documents are excluded. Historical archived jobs remain reportable; deleted/cancelled jobs do not.

## User interface

Two cards, Cash and Insurance, join Manager Dashboard → Workshop Performance. They show the current month's respective document totals, independent of the pre-existing Today/This Month operational toggle.

Each opens a monthly list with serial number, invoice/LPO date, JC number, vehicle/model year, insurance company, amount, job cost, net job profit/loss and profit percentage. Profit is green, loss red, and pending costs amber. The Insurance list filters by company. List/Graph selection provides company comparisons (Insurance) or job comparisons (Cash), with weighted margins rather than a simple average of job percentages. Lists scroll horizontally on phones rather than clipping fields or serial numbers.

## Data and safety

- New Manager-only, read-only `accountant_report` report `manager_profit` reuses the existing verified Accountant cost engine and adds sublets. Other Accountant reports retain their current calculations and contracts.
- Server permission checks run before the database read. No new cash entry, invoice, LPO, accounting adjustment or workshop mutation is submitted.
- Browser financial caches are memory-only, scoped to current identity/token. Offline data is not rendered. Late responses and changed accounts are rejected. Paginated reads require matching workshop/finance revisions; a changing snapshot is retried rather than mixed.
- Existing Accountant APIs and the existing `zukait_accountant_context` read provide the data. The new server file `accountant/profit_performance.js` must accompany `accountant/api.js` in the approved backend bundle. This report does not work against older servers; the UI shows server-update-required rather than invented zero totals.
- Main Android assets and Pages reference the new script through the existing shared asset packaging. Publication and release metadata are unchanged.

## Validation

`tests/manager-profit-performance.mjs` covers real financial cost reuse, Cash receipt deduplication, LPO versus payment dates/amounts, three-decimal OMR calculations, sublets, missing costs, zero/negative margins, historic dates, permissions, pagination, company/month filtering, graph aggregation, escaping, offline access and account-switch races.

`tests/manager-profit-responsive.mjs` exercises actual Chromium rendering at 320/390/768/1280px, colored profit/loss, serial numbers, filters, graphs and horizontal table scrolling. Screenshots are included in Reception QA artifacts. Existing financial/authentication/CI checks remain enabled.

Before release: complete the existing QA workflows, verify on a physical Android phone using authorized test accounts, and approve a specific release including the matching backend. Do not deploy the entire repository backend over a drifted production bundle; reconcile the exact approved delta under the existing publication rules.
