# V344 updater recovery

Owner reported that V343 downloaded to 100% but did not open the Android installer on all dashboards. The reference screenshot identifies the installed app as V340 and shows a queued-change/server-unreachable warning.

Read-only production logs confirmed PGRST002/schema-cache and connection errors around 09:49 Oman time on 19 October 2026. PostgREST logged successful schema-cache loading at 09:49:23. Database inspection at 09:50:59 found 17 of 60 connections and no database restart. No production restart, data mutation or schema change was performed. The existing pre-install sync gate correctly refuses installation without fresh successful synchronization; the old update UI ignored SYNCING/SYNC_REQUIRED/PERMISSION_REQUIRED messages and left the initial installer-opening label displayed.

Changes:

- Show native sync, permission and installation states; re-enable retry when blocked and when a completed download is restored.
- Start the standard APK intent directly with its existing FileProvider/ClipData/read grant. Do not reject a valid Android installer solely because Android 11+ package-visibility restrictions hide it from resolveActivity.
- Preserve the PackageInstaller fallback for a real intent-launch exception, but stop recursive retries after failed/cancelled sessions or missing confirmation intents. Keep the download for an explicit retry.
- Complete the Accountant download-progress/ready/install callback flow. Use the existing native bridge; do not download repeatedly instead of installing the completed file.
- Accountant pre-install safety checks require a verified session, successful read-only financial API confirmation, no pending financial request, no active financial operation and no open entry/correction/password form. The workshop sync guard remains unchanged for workshop dashboards. Missing/failed financial verification never bypasses it.

Verification includes runtime execution of the actual native-injected pre-install script (workshop and Accountant), both-role DOM/API/PostgreSQL download/install state tests, diagnostic/retry UI tests, and native handoff/source safety checks. Java compilation and Android/browser/PDF checks run in CI. Physical-device installation cannot be claimed from these checks.

The fix cannot replace native code already running in V340. If that installed updater remains blocked, download the signed release APK in the browser and open it from Downloads after resolving queued changes. Do not uninstall the app or clear its storage. Future updater runs use the corrected native code after manual upgrade. Backend/financial rules and production records are unchanged.
