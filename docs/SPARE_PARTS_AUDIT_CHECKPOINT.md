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
