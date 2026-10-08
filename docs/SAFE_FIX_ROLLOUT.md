# Workshop safety fixes — review and rollout
Base: main at 13a91ac06c62b03d5a343a5c518cbc01df49211f.
Status: code changes prepared for review; not deployed.

## What changed
- Preserve edits during asynchronous saves, rebases and pulls; retry transient save failures.
- Keep rejected snapshots and offline action logs on the device for reconciliation.
- Merge Job Cards by their existing no field; retain concurrent additions to audit/holiday lists.
- Validate employee session ownership, assignment relationship, timestamps, state transitions and overlaps. Historical rows that are unchanged are not revalidated or rewritten.
- Accept ownership-checked append-only offline and leave notifications.
- Apply Supervisor permissions to snapshot saves, including supported assignment, additional-time, reopen/repeat, vehicle correction and material workflows. User/price-master/time-correction changes remain Manager-only. Existing audit rows cannot be erased.
- Share the holiday-aware normal-duty calculation with incentives; format request/voice time in H:MM while retaining H.MM input.
- Fix the undefined V2 event caller, authorize event roles/employee ownership and retain events on temporary server failures.
- Add a separate read-only operational report cursor RPC; retain the existing RPC and tables.
- Build/test the triggering commit; run all discovered regression tests and ship all runtime dependencies to PC Pages.

## Data and workflow preservation
No production database calls or deployments were performed. No stored hours, users, assignments, prices, incentive results or audit history were repaired/recalculated. This patch retains local storage keys, legacy snapshot field names, duty windows, Friday/public-holiday rules, ID001 Start/Stop behavior and the V2 authority default-off setting.
Manager's existing correction tools remain available. Any existing inconsistent data requires its own audited review; this patch does not silently clean it up.

New permission checks may reveal previously accepted invalid/stale device snapshots. The new client retains those snapshots for review rather than deleting them. Stage server permissions against representative records and the deployed clients before rollout. Offline timestamps still come from devices; assignment/range/overlap checks reduce invalid submissions but cannot prove a past device action occurred.

## Verification
Run with Node 24:
```sh
bash scripts/ci-validate-js.sh
bash scripts/ci-full-regression.sh
bash scripts/ci-check-production-assets.sh
```
Local run: all 71 regression files passed, including four new runtime suites. 42 JavaScript assets and 15 inline scripts parsed; all 37 HTML script dependencies were checked.
The local checkout was reconstructed using the text-only GitHub connector. Three unchanged WEBP assets could not be downloaded. Local asset validation used --source-only; CI on a real checkout must run the full binary asset gate.
Android compilation, browser/device UI testing and execution of the new SQL RPC against Postgres were not performed in this environment. Existing Node tests and mocked API tests do not replace these checks.

## Staging sequence before production rollout
1. Take a verified backend backup and device-cache export using existing operational tools. Preserve unsynced device changes.
2. Use an isolated staging backend and copied/anonymized records. Do not point test devices at production.
3. If V2 reporting is installed in staging, apply supabase/REVIEW_SAFE_REPORT_CURSOR.sql before testing the API. It creates only a new SELECT function with service-role access; it performs no table writes and does not replace the old report function. Leave V2 authority off.
4. Test the patched API and PC/Android clients together: Start/Pause/Resume/Finish, ID001 switching/duty end, leave, assignments/additional time, reopen/repeat, vehicle edits, material issue/finalization/correction, concurrent jobs and offline reconnect. Include mixed old/new client versions and real cache shapes. Compare all historical record counts/values before and after.
5. Verify SQL pagination with multiple full pages and equal timestamps; check permissions using each actual staff role.
6. Let draft PR CI compile the Android artifact and run the complete asset gate. Test the artifact on isolated devices; determine release version/signing through the existing approved release process.
7. Roll out only after staging passes and release source is approved. Pages deployment and the signed-release approval workflow remain separate from this draft patch.

## Rollback
Revert the code patch and redeploy the previous application/API source if needed. The old report RPC is unchanged and remains usable; the new read-only function can stay installed during rollback. Do not reset local storage or drop tables. Export any retained pending snapshots before reconciliation. No data migration rollback is required.
