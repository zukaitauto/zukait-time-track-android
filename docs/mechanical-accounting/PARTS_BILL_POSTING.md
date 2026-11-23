# Parts bill posting — inactive development candidate

Extends the existing accountant_bill_preview/post/list path and shared Accountant receipt namespace. No new ledger, user account, production migration or activation. Install the disposable accountant-parts-receipt.sql helper after accountant-bill-posting.sql in fixtures. The new parts_enabled control defaults false; service_role cannot change it. Existing Paint enabling does not enable Parts.

## Authority and scope

An explicit SPARE_PART_LINE supplier/source association is required. Displayed vendor labels do not establish identity. The SQL helper locks the exact normalized part row that the existing V215 event projection locks, including final-price and commercial events which may leave normalized/workshop revision unchanged. It then reads at most 201 exact-entity events via an entity/time/ID index and refuses histories over 200 events or 1 MB. No workshop history or project-wide replay is read.

The helper follows existing channel revision rules for final prices, commercial updates and correction snapshots. Explicit price clearing remains unknown; it cannot fall back to an older final price. It checks event identity, chronology, list/JC, quantities and dates against the locked source. Equal event timestamps are review-required because the existing JS projection has no authoritative tie ordering. Unknown events or legacy missing receipt quantities/dates fail closed. Current returned records and return/cancellation/reorder histories require review pending credit/allocation work.

Only physically recorded received quantities count, using exact numeric OMR mills. RECEIVED can qualify with a valid recorded cost: current Supervisor verification requires full receipt, while a Manager correction can record the price of a partial receipt. An ordered/unreceived item cannot qualify. The helper does not infer receipt from ordered quantity, vendor name, arrival acceptance or final price alone. Final prices above the existing limit, excess decimal precision, zero/unknown costs and normalized/event quantity disagreements require review.

The non-authorizing digest covers normalized state plus bounded events, so a price-only event invalidates reviewed intent without workshop CAS movement. The writer recomputes under locks; no client-supplied amounts or event snapshots are trusted. Sources are locked in deterministic type/ID order. The existing session, supplier, open period, invoice attestation, shared UUID replay, audit rollback, private ACLs and immutable bill controls apply unchanged. Cost/receipt dates must not follow the accounting date.

## Limits before activation

This remains one bill component per source ID. Subsequent receipts against an already-billed part are explicitly blocked, never billed twice or silently included. Receipt-line allocation, partial/multiple invoices, return credits and wrong-bill reversal must replace that restriction before activation. Outstanding balances still require opening cutover/history reconciliation. No Accountant UI consumes this candidate; no production enablement is authorized.

## Tests

The existing mechanical-persistence runner includes the actual Parts handler/SQL tests. Synthetic fixtures cover full and partial receipts, real event projection and JS price parity, final-price changes without normalized revision movement, correction/cleared price, unknown/unreceived rejection, exact retry, duplicate source, audit failure rollback, bounded event scope, private invoker/activation ACL and unchanged workshop/history/live/cash/expense records. Native PostgreSQL mode additionally overlaps a real price-event transaction against posting and overlaps identical UUID posting requests. Do not claim native concurrency qualification until that run passes on the changed commit. Physical Android and accounting-screen acceptance remain outstanding.
