# ZUKAIT Consumables Stock — implementation and release gate

**Status (2026-11-20): stock domain core, compact staged SQL/RPC, feature-flagged API, fifth Stock menu and five clickable UI screens committed. SQL and UI tests passed in isolated GitHub CI. Stock is NOT linked to existing Suggested/Actual Materials server transactions and is NOT deployed or enabled in the live database.**
This is a staged change based on `architecture-v2`. Do not deploy the standalone core as if it were a complete stock module.

## Approved workshop workflow

- The existing Consumables Material and Brand master remains authoritative. Stock identity is **material ID + brand ID**, not just the material name.
- Existing items appear for **one-time opening stock** entry; only Manager can set opening balances.
- New material and brand records continue to be created in the existing Consumables master; no second stock catalog.
- Liquid quantities are manually converted from tins/drums and entered directly in **litres**. Existing `kg` and `Piece` units remain supported for nonliquids.
- Manager or Supervisor adds purchased stock, entering quantity and either **total purchase price** or **price per unit**. Store both calculated purchase cost and the weighted average by brand.
- A supervisor's suggestion reserves available stock immediately and **locks the current average unit cost** for the reserved quantity. New suggestions and increments use their own locked cost layers; decreased quantities release the latest reservation layers first.
- Final Actual Materials consumption removes only the actual used quantity from physical stock, releases unused reservations, and does **not double deduct**.
- Cancelled suggestions release quantities. Finalised material returns post an explicit cost credit and quantity addition, preserving the original event.
- All stock writes need audit entries, actor ID, request ID, and a confirmed server receipt. Manager-only physical count adjustments require a reason; a count below reserved stock is forbidden.
- When stock is exhausted, the next purchase establishes the new average cost. Past finalised Job Card material costs must not be repriced.
- The fifth Consumables menu tile opens **Stock Management**. Default screen **Stock Balance**, with **Add Stock, Stock History, Stock Adjustment, Stock Reports** all clickable; Supervisor can also see brand availability during suggestions.

## Why stock must be separate from existing workshop-state snapshots

The existing `consumables.js` holds `materials`, `brands`, `prices`, `issues`, and `actuals` under the workshop-state model. Adding an unbounded stock ledger there would enlarge already expensive workshop-state revisions and create lost-update risk between two phones. **Do not save the new `movements` / `requests` arrays to `workshop_state`.**

Use dedicated narrow database tables: one balance row per material/brand, append-only stock movements, request receipts, and durable reservation/price layers. Make each purchase, reservation, change, finalise, return, or adjustment a **single atomic server transaction**, locking the affected balance row (`SELECT ... FOR UPDATE`). A retry with the same request ID returns the original result; conflicting reused IDs fail. No client may directly write the balance.

The `consumables_stock_core.js` implementation is a pure rules reference for development/testing. It is **not** a concurrent persistence layer.

## Existing authentication integration

The Workshop API authenticates `x-zukait-session` against `staff_sessions` and `staff_credentials` and uses a service-role Supabase client. The pre-existing `CONSUMABLES_V1_SECURE_FOUNDATION.sql` expects Supabase Auth `auth.uid()` and app-metadata roles and cannot be assumed compatible with these custom staff sessions.

A new stock API route must resolve the actor from the verified server session, enforce Manager/Supervisor permissions on every request, and restrict sensitive corrections to Manager. Use a dedicated server RPC with table privileges/RLS designed for that trust boundary. Never accept an actor ID or role from the client as authority. Verify material/brand IDs against the live existing material master.

## Integration and release gates (remaining)

1. Convert the staged SQL and RPC into an official Supabase migration using the CLI, verify in an isolated PG17 environment and seed compact master keys. **Do not apply to production until a restore rehearsal and targeted load test pass.**
2. The feature-flagged Workshop API route is staged and tested; confirm real staff permissions, idempotency and tiny response limits against an isolated server before enabling either flag.
3. Five clickable Stock screens are staged. Complete live read/write UX and physical device acceptance; offline saves must fail closed rather than display stale success.
4. Integrate new Suggested/Issued and Actual Materials workflow transactions at the server boundary. In particular, `finishActual` currently selects the material-master price by `actualAt`; the new stock pathway must instead apply locked suggestion cost layers for **new** stock-controlled JCs, without changing existing historical prices.
5. Cutover: import/verify existing material/brand IDs; record **physical opening balances at activation time**; do not retroactively deduct old JCs or reserve old suggestions. Handle an existing ongoing JC explicitly at cutover.
6. Regression: concurrent reservations, cancelled/changed suggestions, duplicate save/retry, intermittent connectivity, zero-stock reprice, multiple brands, kg/Piece units, purchase total price, partial finalisation, returns and audit.
7. Role checks: authenticated Employee, Purchaser, Receptionist, Accountant and Mechanical Supervisor cannot open stock-write endpoints; only Manager can adjust/initialise.
8. Verify low-I/O idle/read behavior, backup, rollback, Android acceptance, web acceptance and finance totals. No branch merge/publishing while these are pending.

## Focused tests

`node tests/consumables-stock-core.mjs`

The standalone pure core is also self-tested against the same weighted-average, idempotency and reservation/return cases. Production database and live workshop records remain untouched.
