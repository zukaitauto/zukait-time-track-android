# PR #86 — Stock search and count-state rollout gates

**Status: REVIEW ONLY — do not merge/publish or run SQL on production yet.**

## Tested UI fixes
- A tap on a Material + Brand result binds its exact IDs. If two records share the same display text, typing alone does not choose either. The Save path preserves the selected IDs.
- Loading the next Stock LIST page retains the unsaved entry type, quantity, pricing method, amount, physical-count confirmation and reason.
- Stock Balance separates recorded items (`initialised=true`), linked placeholders (`false`), and older responses with no count metadata (unknown).
- Unknown or unrecorded rows show no fabricated zero, average cost, or out-of-stock badge; summary out/low counts include only ledger-initialised items. Reports from an older backend are labelled server-reported and cannot certify the opening count.

## What count-state means
`initialised` means a recorded opening, purchase or audited stock movement has established the ledger record. It **does not prove that somebody physically recounted the inventory today**. Historic rows with a nonzero balance or qualifying movement can be backfilled only after review. Never infer physical quantity from prices in the legacy Material Master.

## Backend deployment separation — OFF BY DEFAULT
- The API has `countStatusEnabled` default false and the environment flag `ZUKAIT_STOCK_COUNT_STATUS_READS_ENABLED` must remain **unset** until the column is available.
- Staged schema: `supabase/staged/CONSUMABLES_STOCK_COUNT_STATUS_V416.sql`, **not applied**.
- Before enabling: rehearse an isolated restore from a verified PC backup; review existing movement-ledger histories; stage and test the matching `OPENING`, `PURCHASE` and `ADJUST` RPC updates that set `initialised=true` transactionally (still held separately in PR #84).
- Check default-off API compatibility and Manager/Supervisor isolation; verify a new zero placeholder, genuine post-movement zero, purchased item, adjustment, and retained historical cost in a disposable database.
- Only enable after production health, Disk I/O and workshop connectivity are verified in a short owner-approved off-hours rollout. No bulk Master import or backdating.
- An earlier server without the metadata will display status **unverified**, not a confirmed zero. Therefore PR #86 must NOT be advertised as complete production count-state until schema, RPC and API are accepted together.
- Automatic Paint Job Card Actual deductions are outside this change and remain disabled (PR #84).
- Existing Job Cards, physical stock, reserved quantities, weighted cost, effective-dated material prices and workshop history are not modified by this branch.

## Verification
Run `npm run test:consumables:stock`, `node tests/consumables-stock-live-readiness.mjs`, browser acceptance `tests/consumables-stock-search-toolbar-mobile.mjs`, preview-only safety and connection outage safety, signed Android/Reception acceptance from **the exact final commit**. PR #86 remains a draft until all gates pass.
