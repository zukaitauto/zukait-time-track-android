# ZUKAIT — Mechanical Consumables: final on issue

## Approved Mechanical workflow (2026-11-20)

Unlike Painting Consumables, **Mechanical Consumables does NOT use Suggested/Issued followed by Actual finalisation**.

Mechanical menu has only these four sections:
- **Issued Materials** — choose a Mechanical Job Card, material, brand and quantity; confirm one final issue.
- **Additional Materials** — any later issue is a **new final issue** on the same Mechanical Job Card.
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

## Development status

The existing Mechanical tile is enabled in draft PR #62, and its **four UI pages and read-only master lookup** are wired. Current Mechanical issue screens must **fail closed**: they do not yet persist issues or deduct stock. The shared stock PR #61 needs a separate idempotent, atomic **MECHANICAL_ISSUE** command and a role-scoped Mechanical Job Card authority check before turning saves on. The current SQL/RPC supports Painting-style reservations and finalisation, **not Mechanical direct issue**.

No live Supabase migration or changes to existing workshop material, stock or Job Card data are included in PR #62.
