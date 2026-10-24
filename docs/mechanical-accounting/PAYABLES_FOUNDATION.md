# Supplier / recorded-bill balances — inactive domain foundation

This is the first P4 calculation boundary, not a usable supplier dashboard, posting API, approved migration or production rollout. `accountant/extensions/payables_rules.js` is not imported by the existing API/UI. It reuses the existing Accountant journal as a read-only settlement source; it creates no second cash journal, auth path, ledger or financial write endpoint.

## Identity and source truth

Supplier IDs are independent of display names and remain the shared identity across departments. Two suppliers may have the same name. Exact explicit source-type/source-ID links resolve a supplier; fuzzy name matching, automatic merges and historical backfill are absent. Inactive suppliers retain historical balances. New supplier/alias edits need their own future audited, authorized persistence.

Approved bills carry an explicit supplier, invoice reference, accounting transaction date, optional due date, amount in integer OMR mills (or null/Pending) and reviewed source references. Amounts are not inferred from Paint/Parts/Consumables costs, purchase orders, LPO collections or Cash customer invoices. Same supplier/invoice reference (trimmed/case-insensitive, punctuation retained) and reused purchase sources fail closed. Partial invoicing spanning a purchase source needs finer reviewed receipt/source identity before activation; this candidate must not silently assume one PO equals one supplier invoice.

DRAFT bills/credits are not liabilities. Approved credits have their own transaction date, explicit same-supplier bill allocations and separate unapplied balance. Physical returns do not automatically prove a supplier credit. No tax or credit-policy assumption is encoded.

## Settlement and as-of arithmetic

Settlement links reference existing CASH_OUT journal entries, never synthetic entries. Allocations cannot exceed the source payment, credit or bill; cross-supplier links fail. A reviewed supplier advance can remain unapplied to any bill. Customer CASH_IN, invoice-derived receipts and LPO collection are not supplier settlement. Settlement is not a second recognized expense: projection returns `expenseEffect: NONE_READ_ONLY` and never mutates entries/costs.

The as-of date is an explicit inclusive Oman accounting day. Credit/allocation/payment dates must precede the cutoff. Existing journal reversals restore debt only on/after their transaction date. This is transaction-date reporting using current approved records, not a reconstruction of historical knowledge/approval time. Backdated approvals, correction/replacement/void event semantics and period locks need the later append-only persistence contract.

Decimal strings are parsed directly into exact integer mills; no float multiplication or silent rounding. Totals use BigInt with safe-integer overflow rejection. Null bill amounts stay Pending. Recorded net can be negative (known supplier credit/advance), while bill allocation cannot become negative.

**Total supplier outstanding is always Pending in this phase.** Opening balances, unlinked historical purchases and unmatched payments are not certified. `recordedNetMills` means only approved recorded bills minus approved credits and explicitly linked existing-journal payments. A zero recorded balance never claims a supplier owes/is owed nothing. Signed opening cutover/control totals and source overlap review remain unconfigured; no historical opening amounts are guessed.

## Bounds, permissions and continuation

Trusted scoped context limits: 2000 suppliers/bills/credits,5000 explicit source/settlement links,10000 existing journal rows; at most100 source references or allocations per document. Invalid/duplicate/overflow/ambiguous inputs fail closed; no historical workshop JSON scan, live query, exports or network calls occur. Context is immutable. This pure function is not an authorization boundary: future routes/readers must apply existing Accountant/Manager auth, record/field permissions, active session/current role, independent default-off gates, bounded projections and source revisions before access.

Owner permits Accountant to perform new financial approvals/actions now; later policy is configurable. Existing ordinary rights remain. Future financial writes must remain online-only and extend existing append-only receipts/journal with server fingerprints, exact UUID retry, revision checks, atomic metadata/ledger linkage, lost-ack/account-switch protection, and approved date/period/credit rules. No Manager-only or no-self-approval rule is introduced.

Next: audited supplier/source-link and bill/credit contracts, disposable SQL schema/transaction/concurrency/read/ACL qualification, then gated integration into the current nine-module Accountant workspace. Opening approvals, supplier settlements/account attribution, bank reconciliation, expense allocations and payroll remain later phases. Production still requires separate exact-source/environment approval. Full transferred Windows specification files remain unavailable; this boundary follows direct owner decisions and the handoff summary without claiming full-file incorporation.
