# Parts Expenses: recorded amounts only

The Accounts Spare Parts Expenses API already required a received quantity and
excluded returned parts, but still included received parts whose purchase price
was missing. Those rows rendered with blank/Pending amounts in details and groups.

Add the existing authoritative `milli(net_cost_omr) !== null` check to the expense
page's receipt filter, before totals, counts and pagination. Explicit recorded zero
remains known; quotation-only, blank and missing prices are excluded. Partial
receipts retain only their confirmed received cost. Existing date/return/receipt
rules are unchanged. Entering a real price makes the row eligible automatically.

The same report endpoint supplies detailed, grouped, export and focused expense
popup views, so no frontend asset/APK update is required. The full JC360/profit/
audit projection still retains unpriced parts and pending-cost warnings; source
parts remain visible in operational purchasing. No records are deleted or rewritten.
The full financialReport and purchase/return calculations are unchanged.

Regression test reproduces the original seven-versus-three rows, then verifies
Manager/Accountant parity, explicit zero, missing/blank/invalid/quotation prices,
partial receipts, returns/unreceived exclusion, dates, complete totals with one-row
pages, deduplicated export/group inputs, focused popup data, price correction,
original JC360 pending sources and immutable financial projections. Both-role
DOM/API/export tests and existing costs/profit/Cash/read-sharing tests also pass.

Owner-approved production deployment completed on 12 November 2026 as backend
v120, from tested commit 854cf229fc66553bb6b6d85f4ec50630add68ecc. Only
accountant/api.js changed from verified v119; all 42 other files and configuration
were preserved, including enabled read sharing. All 43 files were read back exactly.
No database migration, record change or new app/web release was performed.
Database health and invalid-session denial checks passed. Authenticated UI acceptance
of the new filter awaits the owner reopening the report. Exact rollback source v119
is retained locally. See PARTS_PRICED_EXPENSES_DEPLOYMENT.json for provenance.
