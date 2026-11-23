# Per-staff Job Card labour history

Manager and Supervisor can click a staff name in a Job Card's Labour detail view to open that person's session history for the same job.

Each active work period shows Date, Start, Pause / End, Status and Hours in a single table row. Times use Asia/Muscat and a 12-hour clock. Pause/resume arrays split periods and exclude waiting gaps; separate paused/finished session records remain separate rows. The report includes completed preliminary work transferred to this job, excludes work transferred elsewhere and cancelled/voided/deleted records, and deduplicates repeated session IDs. Invalid or future timestamps are excluded with a visible warning. Running time is frozen at the displayed report time. Total hours are shown at the bottom; no costing, assignments, time records or other source data are edited.

Print uses the existing native print bridge or shared browser print preview. PDF/Share uses the existing validated report PDF exporter. Send as card creates PNG images with the selected staff's job details, session rows and full total. Histories longer than 24 periods paginate into separate image cards; Android shares the selected card, while supporting web browsers can share all cards. Web fallback downloads images. Preview navigation revokes replaced object URLs.

Manager/Supervisor checks protect opening, printing and sharing. Accountant, Receptionist, Purchaser and Technician do not gain access to this view. Existing financial Labour amounts remain unchanged.

Verification:

- `node tests/labour-history.mjs`: staff/job isolation, pause/resume, preliminary links, cancelled rows, duplicate IDs, invalid/running time, no mutation, escaping, role denials, native Print and PDF delegation.
- `node tests/labour-history-responsive.mjs`: 320/390/768/1280px layout, actual nonempty PDF generation, PNG payload, native share delegation, pagination and back navigation using isolated fixtures.
- Existing 360 detail, Profit/Loss and Workshop Overview regression tests.

Development only until the existing coordinated release process publishes a verified version. Physical-device sharing acceptance is separate from browser/native-bridge contract checks.

## Time review summaries and delivered navigation

The screen, PDF and each PNG card show Suggested Time (blue), Total Actual Time (green) and Exceeded Time (red; green when within time). Metrics reuse Workshop Overview's existing authoritative assignment calculations. Approved additional time is already part of suggested time and is not added again. Actual/exceeded totals are normal duty only, excluding overtime; the separate recorded-session total retains raw pause-excluded session hours. Missing metrics remain Pending.

Manager Delivered Vehicle Time Review has an Open Time Review button beside its existing Review action and in the confirmation detail. It opens the same staff screen with the exact selected assignment and current review signature. Repeat work, other staff, transferred preliminary work and ambiguously owned legacy sessions do not leak into an assignment review. Stale/reviewed signatures cannot open a fresh review. System-reconciled/recovery periods retain warnings in UI, PDF and PNG. Back returns to the original confirmation detail; no new confirmation or source mutation occurs. Supervisor retains ordinary staff reports but cannot open Manager-only delivered reviews.

`tests/staff-time-review.mjs` verifies actual button navigation, exact totals, extra-time handling, assignment scope, integrity attention, stale signatures, back and role isolation. The responsive export suite checks the new summary cards at all four sizes.
