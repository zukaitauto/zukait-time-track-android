# Existing production archive conversion — 25 November 2026
Read-only catalog and indexed revision metadata checked in production.
- Production uses private.workshop_archive_conversion_pilot plus reversible manager/job/time deltas; older zukait_history foundation not installed. Do not install a competing capture system.
- Database allocation 5,367,000,211 bytes; legacy history allocation 4,864,958,464 bytes (~91%). Not physical free space or EBS budget.
- 1,496 converted revisions; 1,474 original snapshots remain in existing scope <=17683 (1,471 older, zero interior, 3 newer); 121 newer full snapshots outside scope. Recent 39 prior revisions: 14 full snapshots, 25 reversible delta records, no missing coverage by presence check. This is not a restore proof.
- Cron workshop_archive_conversion_17683 inactive. Last recorded run canceled Nov 21 16:19 Oman; preceding runs took about 20–26 seconds. Do not reactivate the minute schedule.
- Staged candidate: at most four originals per transaction; verify every reconstructed record via production-compatible reader before commit. Process older side descending and newer side ascending so later batches are not stranded inside the archive range. Keep exact cutoff, metadata, existing lock, rollback and stop behavior.
- Before production: obtain current verified recovery/backup including private archive/deltas, inspect disk I/O headroom, check exact live source/ACL and maintenance window. No full scans or VACUUM FULL during work hours. Existing conversion retains logical revisions but removes redundant full copies after reconstruction; this PR does not authorize deletion or production writes.
- Verify current and historical reconstruction; finish bounded conversion then qualify additional write paths and scope extension. No paid resources requested.

## Verified repeated state fields (25 November 2026)
Read-only production comparison of consecutive revisions 18056, 18057 and 18058 confirmed JSON equality of `jobEdits` and `consumables` across both adjacent pairs; the overall snapshot differed. This establishes avoidable repetition, not a measured disk-reclamation estimate.

Latest revision 18058 expanded JSON measurements: `jobEdits` ~8,666,691 bytes (9,412 array entries); `consumables` ~1,097,624 bytes, dominated by audit (~442,635), actuals (~394,472), and issues (~220,794). These are logical JSON component sizes, **not** per-snapshot physical storage or immediately reclaimable bytes.

### Safe implementation requirements
- Preserve exact JSON value and ordering for `jobEdits` and `consumables`, including nested audit, issue, actual, price-effective-date, and material/brand records. No trimming or deletion.
- Reuse the existing reversible checkpoint/delta archive and production reader; do not create a parallel history system or remove fields from the current workshop state API.
- Verify reconstruction equality of full payload and both fields on every converted revision; test unchanged, appended, modified, removed, and empty arrays, nested object changes, and transitions across batch/checkpoint boundaries.
- Do not activate cron or execute production conversion until isolated rollback rehearsal, complete recovery backup (including private archive), and I/O headroom checks pass. The staged four-revision function is not published.
- Validate all history consumers and historical job-cost calculations before release; conversion must preserve manager, accountant, painting and mechanical workflows.
