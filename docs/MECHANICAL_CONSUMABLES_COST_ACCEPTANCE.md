# Mechanical Consumables — opening stock and Job Card costing acceptance

**Stage only. Not merged or deployed. No live Supabase queries or data edits.**

## Daily Supervisor screen

Open **Mechanical Consumables → Total Consumables**, enter a Mechanical
Job Card, then tap **Show Total**. The read-only report displays:

- **Total issued:** sum of the ORIGINAL locked issue costs, including
  Additional Materials
- **Returned unused:** sum of audited returns valued against their
  ORIGINAL issued line/brand/locked unit cost
- **Net consumables cost = Total issued − Returned unused**
- A compact 20-line page showing material, brand, issued quantity,
  returned quantity, and net cost per original issue line

This report is not a full Job Card profitability calculation. It does
not include labour, sublet, parts purchases or invoice revenue.

## Stage-only database contract

`CONSUMABLES_STOCK_MECHANICAL_TOTALS.sql` adds one role-checked,
read-only `zukait_stock_mechanical_job_totals` RPC. It rejects
Bodyshop Supervisors, revoked credentials, malformed/non-Mechanical JCs,
and unbounded pages. The Workshop API `MECHANICAL_TOTALS` operation
is independently gated behind the disabled Mechanical Stock flag.
It aggregates all original Mechanical issue lines for the requested JC,
rather than summing only the current displayed page. No full workshop
snapshot or price-master re-read.

Requires compact Stock foundation, Mechanical Issue and Return staged
SQL. The report never changes a Job Card, stock, or audit record.

## Isolated example acceptance

1. Manager records controlled opening stock for each material+brand
   (e.g. Engine Oil 5W-30 Brand A 20 L × OMR 5.000; Brand B 10 L ×
   OMR 7.000; WD-40 4 pieces × OMR 3.000).
2. Confirm an attempted issue before opening is denied and a second
   opening is denied. Opening must use a **physical stock count**
   authorized by Manager; the system must never invent this count.
3. Mechanic issues 4 L of oil Brand A, 2 L oil Brand B and 1 WD-40:
   gross **OMR 37.000**.
4. Return 1 L Brand A at its original OMR 5.000/L and one WD-40 at
   OMR 3.000/piece: returned **OMR 8.000**, net **OMR 29.000**.
5. Record a later purchase for Brand A at a different unit price.
   Verify this same Job Card's historic gross/return/net do **not**
   change.
6. Issue more oil to the same JC; only the new line locks the new
   weighted-average stock cost. A return against that new line must
   use its own locked cost.
7. Confirm 20-item pagination does not change the JC total, and that
   cross-role or revoked sessions cannot obtain Mechanical totals.

Automated isolated PostgreSQL test:
`tests/consumables-stock-mechanical-totals-sql.mjs`.

## Before a production-like test release

- Run **verified backup/isolated restore**, not a direct live migration.
- Verify existing stock counts, units, brands, package sizes and
  department mapping with the Manager before accepting opening balances.
- Test Android, web, real Mechanical Supervisor and Manager credentials,
  explicit Bodyshop denial, timeout/retry, and correct original issue IDs.
- Reconcile with workshop JC reporting using read-only inspection; no
  historical auto-deduction, opening stock inference, or automatic
  recalculation of completed JCs.
- Ensure live connection health and IO are stable. Leave feature flags
  disabled until authorized release acceptance.

**Current status:** staged code and isolated synthetic database tests
only. No production changes.
