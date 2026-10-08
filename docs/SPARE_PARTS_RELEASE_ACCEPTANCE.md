# Spare Parts release acceptance record

Prepared 2026-10-08. Branch: architecture-v2 only.
Validated implementation: c2e85c18de7ece664cbc0ff8499bea873d4b95fd.
Current published release: V300, versionCode 263.
Candidate version: unassigned until acceptance passes.

## Verified before device acceptance
- 47/47 entry regression tests and full CI regression passed.
- Android/APK builds and PC deployment passed.
- Live API version 56 preserves Supervisor invoice fields while hiding commercial fields.
- Shine confirmed 0 Invoice Pending after refreshing.
- Live integrity check: zero audit fixture events, invalid quantities and missing projection event references.
- Existing signing workflow checks package com.zukait.timetrack, version metadata and permanent certificate SHA-256:
  63886438214503d468f053b44afe34baf008019f674e065a09b14ae8bf451af0.
- Signing secrets were not accessed or independently verified during this review.

## Device setup
Use two phones running the audited implementation, with Supervisor and Manager accounts.
Use a disposable Parts List with a fully received, Supervisor-verified part, quantity 3.
Enter invoice unit amount 2.440 OMR; expected line total 7.320 OMR.
Record device/app versions and test PL/JC numbers. Avoid changing real employee work.

| Check | Action | Expected result | Result/evidence |
| --- | --- | --- | --- |
| Supervisor save | Save 2.440, immediately reopen Invoice Entry, refresh again | 0 pending for the test part; amount remains 2.440 | Pending |
| Invoice first | Keep Manager's old view open; save invoice on Supervisor; attempt stale Return on Manager | Conflict refresh; reviewed Return succeeds; both show Returned and amount total 0 | Pending |
| Return first | Return on Manager; attempt invoice from stale Supervisor view | Invoice rejected; refresh shows Returned; total 0 | Pending |
| Cancel Return | Cancel the current Return on Manager; refresh both phones | Prior eligible status, quantity and invoice restored; total 7.320 | Pending |
| Replacement cycle | Return, Re-enquire, order, fully receive, verify and invoice again | New invoice accepted; only active-cycle amount counted | Pending |
| Offline replay | Queue invoice offline; Return or edit on other phone; reconnect | Stale event quarantined, current server state shown; unrelated queue continues | Pending |
| Reports | Compare dashboards, Spare Parts report and Job Card costs after each step | Totals agree; Returned Qty 3 on Return and 0 after cancellation | Pending |
| Output | Open report Print/PDF and Share; use Back/Close; cancel native share | Correct totals and document; navigation returns safely | Pending |

## Signed update acceptance
After the table passes, select the next available version and an Android versionCode greater than 263.
Prepare a signed candidate using the permanent key; do not publish staff update metadata yet.
Install it over V300 without uninstalling. Confirm signature-compatible upgrade, retained data, authentication and the Supervisor save check.
Record installed versionName/versionCode, certificate, test device and result here.

Signed candidate: Pending.
V300 upgrade installation: Pending.
Final release authorization/evidence: Pending.

## Publication boundary
The existing Publish Approved Signed APK workflow creates and publishes the public release and matching update metadata in one run. It is not a candidate-only signing workflow.
Do not dispatch it as a way to obtain a pre-acceptance candidate.
Only after device and upgrade acceptance, update the version and release-request.json to the reviewed source and approved version, verify CI, then run publication on architecture-v2.
Do not modify main or reuse V300's release approval for new source.
