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

**Older saved Materials and Brands: one-time controlled review.** The Manager
opens **Stock Balance → One-time: Review Older Materials**. The system shows
up to 20 existing priced material/brand pairs per page from the already-saved
Master; nothing is changed when this list opens. The Manager explicitly chooses
Mechanical, Painting or Both for a particular pair and taps **Link Material**.
Paint-category materials can only be linked to Painting. No bulk auto-assign
occurs, and a link never creates physical stock, changes a purchase price,
alters historic JC costs or invents an opening balance. Multiple brands under
one material share the canonical material ID while keeping distinct stock.

`CONSUMABLES_STOCK_LEGACY_PREVIEW.sql` is a service-role-only, Manager-
authenticated, 20-result paginated read of the CURRENT master. The separate
existing `zukait_stock_link_master` function verifies the saved master again
and applies only the chosen key mapping. Both functions are disabled by
default at the API. The review screen is a **one-time Manager setup tool**;
Mechanics and Mechanical Supervisors never see it.

**Existing historical Master pairs require a one-time, audited baseline
mapping** before general availability. The automatic link covers subsequent
successful Manager edits; it does not invent a department for old Consumable
materials, backfill purchases or reset historical stock.

## Performance guarantees

- One tiny queued Stock-link request per edited material+brand; an uncertain result may retry idempotently, using the same IDs and origin.
- Source validation reads ONLY `workshop_state.data->consumables` once for
  a Manager edit; no history tables or full workshop snapshots sent to client.
- Links are upserts by existing IDs; no material/brand duplication.
- Opening Stock may populate a linked zero balance once; repeated opening
  with a new request is rejected.
- Other daily work and technician actions never trigger catalog linking.

## Release acceptance for older materials

- Review existing materials (including active/inactive, Paint-category and
  shared Consumable examples) on an isolated restored database, not on live
  production.
- Verify no new physical stock, reservations, purchases, valuations, audit
  movements or Job Card costs appear from linking.
- Confirm units of each brand are correct, verify one-time opening quantities
  against a physical count, and do not mix US/imperial gallon labels.
- Verify authorized Manager can preview/map; Mechanical Supervisor and
  Bodyshop Supervisor cannot use the one-time mapping API.
- Include linked materials in Mechanical CATALOG only after explicit
  classification and legitimate opening stock, never inferred from history.
- Deploy only through the separate approved stock release; keep all flags off
  until full cross-role and phone/web acceptance.

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
