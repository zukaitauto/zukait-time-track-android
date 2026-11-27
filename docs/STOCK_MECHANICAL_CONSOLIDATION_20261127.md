# Stock + Mechanical consolidation gate — 2026-11-27

## Scope and baseline
- Branch: `integration/stock-mechanical-consolidation-20261127`, created from `architecture-v2` at `8d0e40a10b4da664d86dd2a790d6bcd3eea26a62`.
- Sources: #61 Stock backend, #62 Mechanical Consumables, #63 combined integration, #84 atomic Paint save, #86 mobile/count-state, #95 counted-stock projection.
- This branch is **audit-only at this checkpoint**. No application, SQL, API, or inventory behavior has been changed. No migrations, feature flags, production deploy, or release.
- #63 is an integration source, **not a drop-in replacement** for current `architecture-v2`.

## Concrete drift detected (GitHub blob comparisons)
| File | Current architecture-v2 size | Old combined #63 size | Decision |
| --- | ---: | ---: | --- |
| `app/src/main/assets/consumables_stock_ui.js` | 129,529 chars | 22,568 chars | Do not overwrite; inspect current stock UX and count-state changes |
| `app/src/main/assets/mechanical_consumables_ui.js` | 26,667 chars | 18,242 chars | Do not overwrite; preserve current Mechanical issuing semantics |
| `supabase/functions/workshop-api/extensions/consumables_stock_api.js` | 21,759 chars | 11,891 chars | Do not overwrite; preserve current API and authorization fixes |

These differences establish major drift, not automatically missing functionality. Copying #63 wholesale could regress newer stock, opening-stock visibility, and scoped role handling.

## Authority map — retain a single implementation per behavior
1. **Material/brand identity:** current shared material+brand master; no Mechanical-specific duplicate master.
2. **Stock balances and movement:** one authoritative ledger and atomic server-side transactions; distinguish physical, reserved and available; retain existing opening-stock count-status projection.
3. **Paint consumables:** Suggested/Issued/Actual and finalised records remain distinct; only confirmed Actual consumes stock, with idempotent save/rollback.
4. **Mechanical consumables:** issued means final; audited returns reverse only the eligible original issue; no Paint-style finalisation.
5. **Pricing:** Oman effective-date history and existing JC cost snapshots; do not silently reprice historical JCs.
6. **Access:** Manager and Accountant have explicit stock-scoped privileges; Supervisor only authorized actions; never global Manager impersonation.
7. **Safety:** no blind write retries; stable request IDs, stock locks, audit and backup/restore gate.

## Integration tasks (not yet implemented)
- [ ] Diff current branch against #63 by exported function/API route and SQL RPC name; identify missing features vs superseded legacy.
- [ ] Map #84 atomic Actual, #86 count-state and #95 counted projection to the same canonical ledger contract; eliminate only confirmed duplicate handlers.
- [ ] Build tests for opening stock, shared Paint/Mechanical materials, issued vs Actual, return, valuation, stale role/session, idempotency and two-device conflicts.
- [ ] Run CI against exact integrated commit and review changed API/SQL permissions.
- [ ] Isolated backup/restore and production-like role acceptance before any migration.
- [ ] Physical Android/web acceptance and protected release gate.

## Release decision
**HOLD**. #61/#62/#63 have reported merge conflicts; current production code is significantly newer than #63. Do not close source PRs until exact parity is proved and tested.

## Function-level comparison — 2026-11-27
Compared exact file contents on `architecture-v2` and the old combined #63 branch:
- `consumables_stock_ui.js`: no old named function missing from current file; current file adds stock session ownership, opening-stock picker, balance/status, history/report and preview helpers. **Keep current file; no wholesale replacement.**
- `mechanical_consumables_ui.js`: all old named functions except a generic local `id` helper appear in current file; current file adds pending-issue identity and retry handling. **Keep current file.**
- `consumables_stock_api.js`: no named top-level function missing, but this does **not** prove route/RPC parity; compare command names and auth rules separately.
- Old #63 contains three separate host files absent from current branch: `mechanical_consumables_host.js`, `mechanical_consumables_returns_host.js`, `mechanical_consumables_totals_host.js`. Current Mechanical UI already advertises issued/returns/totals and contains its own issue flow. **Do not copy old hosts without confirming actual command/return/totals parity; otherwise duplicate UI and retries.**
- Current Mechanical UI gates stock requests on `ZUKAIT_MECHANICAL_STOCK_ENABLED===true` and Manager/Mechanical Supervisor roles. Preserve that gate until production-safe release acceptance.

### Next focused verification
- [ ] Trace current `mechanical_consumables_ui.js` issued/returns/totals handlers to backend `stockRequest` commands and compare against #63 host flows.
- [ ] Verify current `consumables_stock_api.js` dispatch has equivalent MECHANICAL issue/return/total semantics and scoped denial.
- [ ] Add exact-contract regression tests before moving any code.
