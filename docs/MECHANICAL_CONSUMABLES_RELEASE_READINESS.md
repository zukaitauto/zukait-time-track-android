# ZUKAIT — Mechanical Consumables release readiness
**Status: HOLD. Development only. Do not merge, publish or enable SQL/feature flags yet.**

## Tested in isolated PostgreSQL / Android-browser mocks

- [x] Material + Brand identities reuse the existing Master
- [x] Manager-only opening stock, with duplicate-opening protection
- [x] Final issuing of multiple brand lines in one transaction
- [x] Return to the original issue and brand at the original locked cost
- [x] Job Card gross / return credit / net cost, independent of list pagination
- [x] Existing JC costs stay locked when later purchases change stock value
- [x] Connection retry uses an idempotent request receipt
- [x] Feature flags default off and no data flows while disabled
- [x] Old Painting Consumables behavior protected by separate tests

## Additional security gate (automated, isolated only)

\`tests/consumables-stock-db-roles.mjs\` must pass before a release.
It verifies **direct Postgres role permissions**, not only JavaScript menu hiding:

- Anonymous and authenticated roles cannot SELECT/INSERT/UPDATE/DELETE
  private Stock tables or EXECUTE the stock RPCs.
- Every exposed Stock table has RLS enabled.
- Only service_role can run privileged Stock RPCs.
- The Workshop API service-role transaction can issue on an authorized
  Mechanical JC using valid Mechanical Supervisor staff credentials.
- Bodyshop Supervisor, Employee and revoked staff sessions are denied.
- Production staff auth and Mechanical JC schema GRANTs must separately
  be checked; the isolated test explicitly simulates those prerequisites.

## Hard HOLD conditions before live use

1. **Physical opening stock**: Manager approves an actual count and purchase
   cost for EACH material+brand+unit, including sealed packages and coolant
   container sizes. No inferred or fabricated opening quantities.
2. **Verified recoverable backup**: fresh backup, integrity verification and
   isolated restore rehearsal of the CURRENT production revision, including
   custom staff authentication, Mechanical JC tables and relevant functions.
   Do not assume a prior partially exported history archive is complete.
3. **Production-like permission acceptance**: test authenticated Manager,
   Mechanical Supervisor and Bodyshop Supervisor (explicit cross-role
   denial) using an isolated restored database. No production record edits.
4. **Android/Web device acceptance**: JC → issue → return → total, invalid
   material, low stock, loss of network, retried receipt and reopened screen
   with the same pending request. Ensure Painting and Reception still work.
5. **IO/connection health**: no release or heavyweight backfill while the
   production Supabase database is disconnecting or EBS I/O balance is low.
   The stock rollout must not introduce workshop-state snapshots.
6. **Staged migrations and rollback**: check exact current schema and grants
   on restored PG17, apply compact foundation and scoped RPCs in dependency
   order; new feature flags remain OFF until acceptance. Roll back by
   disabling features first, not deleting stock movement/audit history.
7. **PR review**: resolve merge conflicts and required checks for Stock PR
   #61 and Mechanical PR #62 before any merge. Do not automatically merge
   unfinished release changes with Android v401.
8. **Actual JC reconciliation**: compare Mechanical net consumables cost
   with an independently calculated example from physically counted and
   issued stock. Confirm Accounting excludes or labels unimplemented totals.

## Feature flags — default false / fail closed

Server:
- \`ZUKAIT_STOCK_ENABLED\`
- \`ZUKAIT_STOCK_WRITES_ENABLED\`
- \`ZUKAIT_MECHANICAL_STOCK_ENABLED\`
- \`ZUKAIT_STOCK_MASTER_LINK_ENABLED\`

Client: \`window.ZUKAIT_MECHANICAL_STOCK_ENABLED\`,
\`window.ZUKAIT_STOCK_MASTER_LINK_ENABLED\`.

**Do not turn on these flags merely because CI is green.**

## Minimal release decision

If *any* hard HOLD item lacks verified evidence, the safe status remains
**NOT READY FOR PUBLICATION**. Re-run CI and role checks after any changes.

Production Supabase, inventory, staff accounts and Job Cards are unchanged
by creating this document and the isolated test file.
