# Spare Parts audit checkpoint — 2026-10-08

Branch: architecture-v2. Validated implementation commit: 2a4f8171dc4f8494871ca39164dc918100e5c140.

## Final Invoice Amount vs Manager Return

Completed fixes:
- A rejected invoice or Return refreshes the rejected part from authoritative history while preserving other pending parts.
- Manager Return checks the current financial snapshot under the database row lock. Stale snapshots receive a recoverable conflict.
- Cancel Return sends only permitted restoration fields.
- Invoice revision checks exclude the newly inserted event itself.
- Replacement purchase cycles retain the invoice revision high watermark while clearing the active invoice amount on Return.
- The live active-state projection and guard are installed; projection tables have RLS enabled. API version 54 includes the corresponding conflict handling.

## Evidence

- 16 entry regression cases passed, including separate simulated clients sharing authoritative history.
- Relevant expense, cancellation, edit/delete, durability and privacy checks passed.
- Rollback-only live database fixtures verified invoice revisions, stale/fresh Return, Cancel Return and replacement-cycle invoicing. No fixture records remain.
- Android architecture-v2, APK and PC Pages workflows succeeded for the implementation commit.
- Local full regression stopped at the native-dialog check because javac is unavailable. GitHub validation succeeded with its JDK.

Reproducible database checks:
- tests/spare-invoice-return-guard.sql
- tests/spare-replacement-invoice-cycle.sql

## Remaining acceptance

Physical two-phone acceptance has not been performed. On a disposable test part:
1. Open the same verified part on two phones.
2. Save an invoice on one phone, then attempt Return with the stale financial snapshot on the other. Confirm refresh and retry.
3. Return first, then attempt an invoice on the stale phone. Confirm rejection and authoritative Returned state.
4. Cancel Return and confirm restored fields and totals on both phones.
5. Return, re-enquire, order, receive, verify and invoice a replacement. Confirm the new invoice is accepted and only its active amount is counted.

This closes the automated/backend invoice–Return checkpoint; it does not certify the entire Spare Parts module or physical-device concurrency.


## Follow-up coverage — 2026-10-08

- Missing/deleted active-state rows now reject late invoice and arrival-acceptance events in the live database guard.
- Simultaneous invoice event-ID conflicts refresh the losing client to the accepted amount before manual retry.
- 22 entry tests now cover both invoice/deletion orderings and actual offline queue flushing after a competing invoice, deletion or Manager Return.
- A rejected queued invoice is quarantined; unrelated queued parts continue syncing.
- Implementation builds through ab60db4a succeeded. Physical two-phone acceptance remains pending.

## Cancel Return follow-up

- The live guard now requires a current Returned state, an increasing cancellation revision, and a matching before-revision when supplied.
- A late cancellation cannot overwrite a newer invoice or cancel a later Return cycle.
- The client refreshes authoritative state when competing Managers generate the same cancellation event ID.
- 25 entry tests passed, including online and queued stale cancellation recovery.
- Live rollback tests cover late cancellation and old-cycle cancellation; valid current-cycle cancellation still succeeds.
- Android, APK and PC Pages builds succeeded for 3db62891. Physical two-phone acceptance remains outstanding.

## Invoice/correction follow-up

- Manager and Supervisor corrections compare the before-status and purchase amount against authoritative history under the part row lock.
- Updated invoice clients send expectedPurchaseAmount. The live guard rejects a mismatch against a winning correction.
- API version 55 supports this optional field and rejects invalid values. Legacy invoices remain supported and require a client update for expected-amount protection.
- 28 entry tests passed, covering correction recovery, reviewed invoice retry and payload compatibility.
- All three workflows succeeded for implementation/test commit 386db8aa; APK functional smoke tests passed.
- Additional navigation, Manager edit, job-type, employee privacy and idle-time checks passed.
- The entire Spare Parts module is not certified complete. Physical two-phone acceptance remains pending.

## Receipt follow-up

- Live rollback checks reject partial verification, excess quantities and stale batch revisions; complete receipts can be verified.
- Competing receipt event-ID conflicts refresh the losing Purchaser to authoritative quantity.
- Network-queued transitions retain pending state and block additional transitions until reconciled.
- Successful reconnect clears pending markers; rejected queued receipts are quarantined and refresh quantity without automatic replay.
- 32 entry tests passed, including receipt retry and partial-verification checks on a fresh Supervisor client.
- All three workflows succeeded for cf5eec6a. These are simulated clients and rollback database checks; physical two-phone acceptance remains pending.

## Quotation and identity follow-up

- Quantity/name/part-number corrections compare supplied before-values against the locked active projection.
- Quotation events cannot alter the authoritative invoice amount or commit against Returned/deleted parts.
- Competing quotation event-ID collisions refresh the accepted amount and supplier before retry.
- 37 entry tests passed, including queued quotation replay and client recovery after Return/deletion.
- Live rollback tests verify quotation/invoice races and quotation eligibility after Re-enquire.
- New Android release remains deferred until the remaining audit and physical-device acceptance are complete. V300 was already released; assign the next version only after checking the current remote version.

## Listing/deletion follow-up

- Deleted parts reject late corrections and status events; both editor roles refresh deletion after rejection.
- Repeated listing events cannot reset an existing part's receipt state.
- Deleted part IDs cannot be reused. A replacement with a new ID remains supported.
- Conflicting inserts no longer update an existing projection row.
- Exact commit-function retries remain idempotent and preserve verified receipts.
- Five listing/deletion/replacement rollback checks passed together after 6d919646.
- Latest local entry suite before workspace disconnection had 39 passing cases. Subsequent changes were verified through live rollback tests; GitHub workflows provide full regression validation.
- Release is deferred until audit completion. Physical-device acceptance remains outstanding.


### Report totals and history completeness — 2026-10-08
- Report rows and monthly spend now multiply invoice unit amount by ordered quantity; Return excludes the amount and cancellation restores it.
- Server event timestamps now retain the Oman purchase month through Return and cancellation.
- Manager report pagination now preserves the existing cache if a cursor remains after the 20-page limit. Partial history must never replace the cache. The report identifies this as local-fallback.
- Added actual-module regression coverage for quantity totals, Oman month boundary, and capped report cache preservation. The capped-path direct execution passed (20 pages; cached total 7.32 retained). Full CI validation remains pending for this commit.
- Physical two-phone acceptance and release signing remain pending; no new version is released by this checkpoint.


### Pagination acceptance follow-up — 2026-10-08
- Commit 712b369 passed GitHub functional smoke tests, production-asset checks, Android release build and PC deployment; APK artifact publication was still finishing when checked.
- Actual-module direct execution passed complete two-page history and three later-page failures (network error, server-required and malformed rows). Complete history updates totals; failed partial history leaves cached invoice totals intact.
- Entry regression suite now contains 44 cases, including these pagination paths. Full CI for this follow-up must pass before treating those added tests as CI-verified.
- Current repository release metadata remains V300 / versionCode 263. Do not assign the next version until remaining module audit and physical-device acceptance are complete.
