# Shared Material Master → Compact Stock catalog

**Staged, not deployed.** Runs only after the Manager's existing Material/Brand
price entry was saved successfully to the authoritative workshop state.

## Daily use

The Manager enters material name, brand, unit, category, price and effective date
using the **existing** Painting or Mechanical Material Master screen. No extra
master creation screen and no separate stock setup click are required.

After the workshop save is ACKNOWLEDGED, a tiny per-Manager queue projects
only the material ID, brand ID and originating department to Stock Management.
A server-side Manager-only API verifies those IDs and the existence of their
material/brand price period in the already-saved master. The server is the sole
source of names, units, active flags and categories. It creates small key rows
and a **zero** physical-stock balance for the brand. It does NOT create stock,
reserve materials, alter prices, revalue historical JCs or copy whole master
rows to a second database.

Mechanical-created materials are classified Mechanical; Painting-created
materials are Painting. Adding the same existing material from both
departments makes its scope Both. A Paint-category material cannot be linked
from Mechanical. Existing balances and weighted-average valuation are
preserved; unit changes with existing stock are rejected.

The queue survives reconnects, is scoped to the Manager's session identity,
and never links a record whose workshop-state save failed. It retries
idempotently after confirmation, without unbounded network polling.
Normal workshop saving remains unchanged.

## Flags, deployment and acceptance gate

Both server flags default **false**:
- `ZUKAIT_STOCK_ENABLED`
- `ZUKAIT_STOCK_MASTER_LINK_ENABLED`

The client flag `window.ZUKAIT_STOCK_MASTER_LINK_ENABLED` is also opt-in.
Before any rollout, install and verify the staged compact Stock schema
**plus** `CONSUMABLES_STOCK_MASTER_LINK.sql` on an isolated database and confirm
service_role RPC grants and no anon/authenticated access. Confirm that the
server and client flags are turned on **only** after migration, backup,
rollback and authenticated Manager/supervisor cross-role tests. Do not enable
Mechanical issuing until the independent Mechanical stock feature flags and
opening stock acceptance are complete.

**Existing historical Master pairs require a one-time, audited baseline
mapping** before general availability. The automatic link covers subsequent
successful Manager edits; it does not invent a department for old Consumable
materials, backfill purchases or reset historical stock.

## Performance guarantees

- At most one tiny Stock-link RPC per successfully edited material+brand.
- Source validation reads ONLY `workshop_state.data->consumables` once for
  a Manager edit; no history tables or full workshop snapshots sent to client.
- Links are upserts by existing IDs; no material/brand duplication.
- Opening Stock may populate a linked zero balance once; repeated opening
  with a new request is rejected.
- Other daily work and technician actions never trigger catalog linking.

## Tested

`tests/consumables-stock-master-link-sql.mjs`: Manager role and saved-master
checks, two brands per material, repeated links, zero balances, physical
stock preservation, cost preservation, unit and department safety, revocation,
exactly-one opening stock, and no link-generated inventory movements.

`tests/consumables-stock-api.mjs`: Manager-only API, extra-field rejection,
feature flags and dedicated private RPC invocation.

`tests/mechanical-consumables-master-sync.mjs`: confirmed-save barrier,
compact queue, timeout/non-confirmation retry and user isolation.

**Production remains unchanged.**
