# V415 Paint Stock — Atomic Actual Materials rollout (NOT DEPLOYED)

## Scope

This work is staged on PR #84 only. Production V414 remains unchanged. Do **not** run the SQL or enable the feature without the owner's release approval, a verified backup and isolated restoration, production-server readiness checks, a low-load maintenance window and acceptance tests.

When activated **after** the existing Stock schema + `initialised` migration, the new function `zukait_commit_workshop_paint_stock_v1` wraps the existing revision-CAS workshop save. It atomically applies quantity deltas from **locked, non-voided Painting Actual Materials** to the Stock ledger in the same database transaction. If the stock write fails, the workshop save and every stock movement roll back together. A duplicate or stale workshop save cannot issue stock twice.

- Newly finished Actual: one stock issue at the ledger's weighted inventory cost (not the effective-dated Job Card selling/cost price).
- Manager quantity correction: positive delta issues more; negative delta returns at the original applied inventory cost.
- Manager reopen or void: no longer locked, so any previously applied quantity returns to inventory.
- Re-finalise: issues the new locked quantity after a reopened record was returned.
- Price-only adjustment: no quantity change; no stock movement, preserving historical inventory valuation.
- Stock can't go below already reserved stock. Piece quantities must be whole, other quantities at most 4 decimal places.
- **Existing untracked historical Actuals are never automatically backdated.** Changing one without an audited baseline yields `HISTORICAL_ACTUAL_BASELINE_REQUIRED`. Existing unapplied rows may remain unchanged while unrelated JCs are processed.
- Existing explicit Paint reservations (including already-finalised reservations) are refused with `PAINT_RESERVATION_FINALISATION_REQUIRED`; the separate reservation-lot finalisation workflow must be integrated before both workflows may be active together.
- Full workshop JSON history is **not** duplicated in the tiny Stock tables. The new `zukait_stock_paint_applied` table stores only JC/material/brand quantities and locked inventory cost. Audit movements carry the committed revision-based request ID.

## Files

- Staged SQL: `supabase/staged/CONSUMABLES_STOCK_PAINT_ATOMIC_SAVE.sql`.
- Stage-only count-state schema: `supabase/staged/CONSUMABLES_STOCK_BALANCE_COUNT_STATUS.sql`.
- Gate: `ZUKAIT_STOCK_PAINT_ATOMIC_ENABLED=true` in the Workshop API is **OFF by default**. It cannot operate without the existing Stock enabled, write enabled, and Master link flags.
- Regression: `tests/consumables-stock-paint-atomic-save.mjs`; executed as part of `npm run test:consumables:stock`.

## Release gates — all mandatory

1. Verify the current PC backup and rehearse restore *in isolation*. Confirm app connectivity and I/O balance before any rollout.
2. Reconcile pre-activation actuals against the physical counted starting stock. Do not invent or bulk backdate prior issues. Obtain explicit Manager sign-off for each exception.
3. Install complete Stock schema (not just this SQL), `initialised` count-state migration and the atomic wrapper to the **isolated** PostgreSQL test database first. Perform rights/RLS checks; authenticated users must not directly call the wrapper or access the application table.
4. Verify rollback and retry under concurrent devices, backdated manager corrections, no-op and price-only saves, shortage and reserved-stock conflicts, staff session revocation, and a disconnected phone.
5. Benchmark revision-CAS saves and stock movements under realistic historical Actual count. Reject activation if latency, RAM, or Disk I/O deteriorates.
6. Complete manual reservation/Actual lot lifecycle integration if using Paint reservation buttons; this stage refuses outstanding reservations rather than double-deducting.
7. Rehearse in a separate test environment, pass the full Reception + Stock regression, verify exact-source signed APK and web visuals. Only then consider an owner-approved production maintenance activation.
8. Review returned `ok`/error semantics and guarantee clear client UI: a local lock is **not** server confirmation. If a stock commit fails, pending local data and workshop revision remain retryable.
9. Leave `ZUKAIT_STOCK_PAINT_ATOMIC_ENABLED` **unset** during V415 UI-only publication; do not deploy the wrapper just to publish visual changes.

## Rollback

Disable the atomic flag first; do not drop ledger/application tables or rewrite historical costs while stock usage exists. Reconcile any previously applied job quantities against the Stock ledger, using movement IDs and the saved revision. Rolling back the server function after production issues without reconciling outstanding stock is not safe.
