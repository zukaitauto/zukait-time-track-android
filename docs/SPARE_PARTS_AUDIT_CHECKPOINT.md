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


### Returned quantity report correction — 2026-10-08
- Report rows omitted returnedQty although the report summary read that field. Returned quantity therefore displayed zero.
- Report rows now expose the nonnegative recorded returned quantity. Added fresh-client Return/cancellation regression with quantity 3 and invoice total 7.32.
- Direct actual-module rendering verified Returned Qty 3 and recorded amount 0. Full CI remains pending for this correction.
- Physical-device acceptance and the remaining module audit are still outstanding; no release metadata was changed.


## Consolidated automated audit checkpoint — 2026-10-08

Validated implementation: c2e85c18de7ece664cbc0ff8499bea873d4b95fd, architecture-v2 only.
Live workshop-api: version 56. Release metadata remains V300 / versionCode 263.

### Verified evidence
- GitHub APK job 113405144206 ran scripts/ci-full-regression.sh successfully. Entry regression: 47 tests, 47 passed, 0 failed, 0 skipped.
- Android architecture-v2 build, APK build, Estimate Module Check and PC Pages deployment all succeeded for the validated implementation.
- Entry coverage includes invoice validation and permissions; Manager Return and cancellation; replacement cycles; deletion; correction and quotation races; receipt quantities; offline queue replay and conflict quarantine; report quantity totals, Oman dates and pagination; returned quantity summary; immediate invoice read-after-write; Supervisor invoice response privacy.
- Existing full-regression checks cover Spare Parts workflow, server/durable authority, edit/delete, state guards, return/cancel, pending/arrival dashboards, expense filters, employee financial privacy and report integration.
- Previously passed rollback-only SQL fixtures are enumerated in earlier sections and repository tests/spare-*.sql; this checkpoint does not claim those were rerun in this final review.
- Final live integrity query: 0 AUDIT-* fixture events, 0 invalid receipt/ordered quantities, 0 missing projection last_event_id.
- User confirmed Shine's Supervisor account displays 0 Pending after the live fix. This verifies the reported invoice reappearance issue, not physical-device concurrency.

### Final findings resolved
- Operational Spare Parts reads bypass both the first-page short cache and pre-write in-flight report reuse.
- Supervisor report responses preserve finalPrice, purchaseAmount, purchaseRecordedAt and purchaseAmountRevision so saved invoices survive refresh. Quotation/supplier fields stay hidden; Employee invoice fields stay hidden.
- Returned Qty report summary receives the recorded returnedQty.
- Partial/capped history cannot replace cached history; successful multi-page history updates the cache.

### Remaining release gates
The automated invoice/Return and follow-up audit checkpoint is complete. This is not certification of every module feature or actual simultaneous device execution.
1. On two physical phones and a disposable test part, verify invoice-first/stale Return, Return-first/stale invoice, cancellation, replacement cycle and offline reconnect. Compare amounts, receipt quantities and report totals after refresh on both.
2. Test Android Print/PDF/Share and back navigation on the release candidate.
3. After acceptance, select the next version after already-released V300, sign the APK with the existing release key and verify update installation over V300 preserves data and authentication.
4. Publish the new version only after those results are recorded. Unsigned CI artifacts are build evidence, not an install-ready signed release.

No main changes, real employee work mutations or release version bump were made by this audit closeout.


## Arrival rejection feature — 2026-10-08
- Supervisor and Manager now have a red Reject button beside Confirm Arrived. A reason is required.
- Rejection uses the existing RECEIVED -> ORDERED status transition; receipt quantities clear in both hydration and live projection, returning the full ordered quantity to Parts Pending. This is not a financial Return.
- Purchaser receives an Arrival Rejected notification containing JC/part/reason from the committed status event. Offline notification waits for sync.
- Live API version 57 grants the narrowly scoped Supervisor transition, requires reviewer reasons and limits Purchaser notification targeting to rejection.
- Direct workflow/API/notification checks passed. Rollback-only live SQL verified receipt reset, re-receipt/confirmation and both stale-decision orderings. Zero fixture events remain.
- New regression coverage checks both reviewer roles, reason validation, queued state, fresh-client pending quantity and role-targeted notification.
- CI initially exposed cache-version format and a source assertion tied to the old targetRole expression; these contracts were updated without weakening received-event targeting. Full new-feature CI still needs verification.
- Previous automated closeout was for c2e85c18, before this feature. Device acceptance now also includes rejection and confirmation races.


### Arrival rejection automated verification complete — 2026-10-08
Validated source: effe40f51a7c8a0a96d5548a21d1ba1141eaba06.
- APK run 37806316578 / job 113411411943 completed successfully: full functional regression, release APK build, unsigned APK upload and signing-tools upload.
- Entry regression now has 50 cases. The full regression step passed.
- Android architecture-v2 build and PC Pages deployment completed successfully for the same source.
- Live API re-read confirmed the scoped Supervisor rejection permission and required reasons for Supervisor/Manager.
- Automated rejection checkpoint is complete; pending physical acceptance includes red-button operation on both review roles, Purchaser notification, stale confirm/reject decisions and offline reconnect.
- Build artifacts remain unsigned. V300 metadata is unchanged; no new staff release was published.
