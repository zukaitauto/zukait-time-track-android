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
   container sizes. No inferred or fabricated opening quantities. The staged
   Manager screen uses BLANK quantity/cost fields and requires a physical-count
   checkbox plus a short audit reason before opening. The database independently
   rejects missing confirmation, missing reason, zero/invalid count and
   fractional pieces. The confirmation records what the Manager attested;
   it is not evidence a physical count has actually happened.
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

## Offline PC backup readiness preflight — prepared, not executed on your PC

The development branch includes a **read-only** helper:
\`scripts/preflight-mechanical-stock-backup-readonly.ps1\`.

It inspects the previously named encrypted Z: two-part backup session
(\`Z:\Zukait-20261025\ZUKAIT-TWO-PART-20261118-085525-05bc29\` by default).

- Validates project identity, current manifest status and revision inventory.
- Checks 50-row history-chunk order, names, row counts, file sizes and SHA-256.
- Reports saved / expected / remaining history chunks and next missing chunk.
- Never reads production database credentials, calls Supabase, exports history,
  updates a backup file, restores, deletes, or creates a local database.
- \`-Quick\` reads only structure/metadata; it **never** certifies hashes.
- Even when every file hash matches, it reports
  \`BACKUP_FILE_HASHES_PASSED__ISOLATED_RESTORE_NOT_VERIFIED\`.
  This is NOT a completed local restore nor full Supabase backup.

With the encrypted Z: drive unlocked on the PC and the development checkout
available, one command runs the default full local check:

\`\`\`powershell
powershell.exe -NoProfile -ExecutionPolicy Bypass -File ".\scripts\preflight-mechanical-stock-backup-readonly.ps1"
\`\`\`

Do **not** begin a production history export or stock migration from this
preflight. If the history set is incomplete, finish backup only after workshop
operations are stable, during an appropriate approved safety window. The
existing \`backup-zukait-two-part.ps1 -Phase Verify\` and
\`restore-zukait-two-part-isolated.ps1\` are distinct, explicitly controlled
steps and are not launched automatically.

An in-memory/synthetic GitHub CI test checks incomplete history, correct
completion classification, corrupted chunks and wrong project references.
Synthetic CI fixtures never establish that the real Z: backup is intact.

## Current field evidence — NOT YET VERIFIED

- [ ] Actual physical counts entered by a Manager for each material + brand
- [ ] Each brand's opening valuation verified against purchase invoices/counts
- [ ] A current PC backup SHA-256 and archive-read test completed
- [ ] An isolated restore of that current backup, with staff/JCs and functions
- [ ] Real Android and Web acceptance with Manager / Mechanical Supervisor
- [ ] Production connection and EBS I/O stability verified before any rollout

None of the above may be marked complete using synthetic test fixtures.
No live Supabase query or PC backup operation has been run in this PR.

## Minimal release decision

If *any* hard HOLD item lacks verified evidence, the safe status remains
**NOT READY FOR PUBLICATION**. Re-run CI and role checks after any changes.

Production Supabase, inventory, staff accounts and Job Cards are unchanged
by creating this document and the isolated test file.
