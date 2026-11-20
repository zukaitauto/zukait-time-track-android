# ZUKAIT — Mechanical Consumables: final on issue

## Approved Mechanical workflow (2026-11-20)

Unlike Painting Consumables, **Mechanical Consumables does NOT use Suggested/Issued followed by Actual finalisation**.

Mechanical menu has these five sections:
- **Issued Materials** — choose a Mechanical Job Card, material, brand and quantity; confirm one final issue.
- **Additional Materials** — any later issue is a **new final issue** on the same Mechanical Job Card.
- **Return Materials** — reverse unused quantities against the original final issue, preserving the original record and issuing a separate audited cost credit.
- **Search Material List** — browse mechanical issues and the shared Materials/Brand Master.
- **Total Consumables** — sum final issued material costs per Mechanical Job Card.

Remove the separate **Actual Materials** entry. Never create a waiting-for-actual queue for Mechanical Consumables.

## Transaction invariants for the future secure integration

1. Verify the Mechanical Job Card on the server and its department; **do not accept a Painting Job Card**. Use Manager and authorized Mechanical Supervisor role checks from the trusted staff session (the general Painting Supervisor must not automatically get Mechanical write access).
2. Each confirmed Mechanical issue is **FINAL** in one atomic transaction: decrease **physical stock** and hence available quantity immediately for the selected material + brand; record the issue's exact quantity and its **weighted-average unit cost at issue time**.
3. Do **not** reserve first or require a later Actual Materials confirmation. No separate reservation or second deduction; `reserved` does not change from a Mechanical issue.
4. Additional issues use a separate request ID, cost snapshot and movement. They do not overwrite earlier issues or reprice them.
5. Retry with the **same** request ID must return the original receipt and never deduct again. Two simultaneous Mechanical/Bodyshop requests must serialize on the **same material+brand stock balance** and cannot overdraw availability. Recheck current authorized role on every write.
6. Return or correction after final issue is a **separate, audited reversal** with reason and authority. Never silently edit an issued line, erase a movement or change an earlier final issue's locked unit price.
7. Stock history stores **small, append-only movement records**, not whole Job Cards, copies of all materials, or `workshop_state` snapshots. Monthly reports should use bounded database aggregation.
8. Keep **Painting Consumables** unchanged: suggestions reserve and lock cost, final Actual confirms usage; Mechanical uses immediate final issue. Both share the same stock balance per material+brand.
9. No historical Mechanical Job Cards should auto-deduct when the stock feature first goes live. Verify opening balances/cutover.

## Material, brand and units

- Different oil grades are different existing material master entries: **Engine Oil 5W-30**, **Engine Oil 20W-40**, **Engine Oil 5W-40**; measured and issued in **litres**.
- **WD-40** is issued by **Piece** (one can). The specific can size should be identified in the material name when different sizes are stocked.
- For **Coolant sold in gallon containers**, issue sealed containers as **Piece** with an explicit pack-size label (e.g., Coolant — 1 gallon container). The current master accepts only Liter, kg and Piece. Do not assume all gallons are equal; any eventual conversion to litres requires a specified US/imperial gallon volume and controlled unit handling.
- **One material / grade may have multiple brands** (CAPSI, MILACO, and others, as actually entered into the existing master). Select the material first, then choose any of its existing brands. Do **not** create separate material records for different brands. Each material+brand pair maintains its own available quantity and weighted-average purchase cost.
- The same Mechanical Job Card may issue two different brands of the same item as distinct lines. Only the exact selected brands and quantities deduct from stock, once, when issuing succeeds. Do not silently substitute another brand.
- Confirm multiple issue lines together as **one atomic batch** (all save or none), with individual brand/grade cost snapshots and one server-confirmed receipt; retries must not double deduct. Each return must refer back to its original brand-specific issue line.
- Material/brand names and prices are **not** copied into a duplicate master or full Job Card snapshot. Retain compact IDs, quantities and locked prices in the stock journal.

## Material and brand creation — same as Painting

- In Mechanical Consumables, **Manager → Brands & Price** opens the EXISTING shared Consumables Master editor; **Manager → Search Material / Price History** opens the EXISTING shared price-history screen. No new material master, brand table or duplicate history is created.
- Reuse exactly the Painting master fields: Material Name, Brand Name, Unit (Liter, kg, Piece), Category, Price per Unit (OMR), Effective From; required reason for initial/new price period and history/audit safeguards.
- A material such as Engine Oil 5W-30 exists only ONCE in the material master, while Brand A and Brand B have distinct material+brand price histories and independent stock balances when stock integration is enabled.
- The current material Unit and Category cannot silently change when a new brand or effective-date price is entered. Reused material names and brand names remain canonical.
- Mechanical master screens use a Mechanical back button; Painting master screens retain Painting navigation, including after edit/cancel/search.
- Manager-only, matching the existing Painting permission model. Other Supervisors may issue materials after Mechanical authorization is developed, but cannot create, reprice or edit master records from this screen.
- The existing master update uses the ERP's current master synchronization. No additional Supabase material storage is introduced by this UI navigation.
- Example master entries are **guidance only**: do not seed Engine Oil, WD-40, coolant, brands, prices or stock quantities in production without actual workshop input.

## Development status

The existing Mechanical tile is enabled in draft PR #62, and its **five UI pages and read-only material/brand selection** are wired. Current Mechanical issue screens must **fail closed**: they do not yet persist issues or deduct stock. The shared stock PR #61 needs a separate idempotent, atomic **MECHANICAL_ISSUE** command and a role-scoped Mechanical Job Card authority check before turning saves on. The current SQL/RPC supports Painting-style reservations and finalisation, **not Mechanical direct issue**.

No live Supabase migration or changes to existing workshop material, stock or Job Card data are included in PR #62.
