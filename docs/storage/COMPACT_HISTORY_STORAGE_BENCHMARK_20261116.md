# ZUKAIT isolated compact-history storage benchmark — 16 November 2026

**Result:** PASS, synthetic workload only. No production database migration, retention change, table rewrite or deletion was made.

## Exact test provenance

- GitHub Actions: https://github.com/zukaitauto/zukait-time-track-android/actions/runs/43811383941
- Tested source commit: `f458121fad25509bc21bc8d74c6a01b64105ac85`.
- Workflow result: completed/success.
- Test source: `tests/compact-history-storage-benchmark-native.mjs`.
- Isolated native PostgreSQL 17 database created temporarily inside GitHub Actions, then dropped.
- Synthetic state: 300 invented job entries, 80 invented assignments, 60 invented work sessions, 16 invented users; no real employees, customers or job-card identifiers.
- The same 24 revisions alter one job's progress and one session's stop value for each mode.
- Test modes: `legacy`, `dual`, `compact`.
- Sample reconstruction checks passed for revisions 1, 2, 8, 16, 24 and 25 in both dual and compact modes, including compatibility reads.
- LZ4 regression and all 12 preexisting compact-history suites passed in the same workflow.

## Test output

| Measurement | Legacy | Dual | Compact |
| --- | ---: | ---: | ---: |
| Legacy snapshots written | 24 | 24 | 0 |
| Compact revisions written (including baseline checkpoint) | 0 | 25 | 25 |
| Legacy JSONB stored-column bytes | 2,970,221 | 2,970,221 | 0 |
| Compact JSONB/patch stored-column bytes | 0 | 143,116 | 143,131 |
| Legacy relation allocated bytes | 3,162,112 | 3,162,112 | 16,384 |
| Compact relation allocated bytes | 24,576 | 253,952 | 253,952 |
| Elapsed time on CI runner (ms) | 276 | 378 | 305 |

In this **specific synthetic small-change case**, compact logical stored-column bytes were approximately **95% lower** than legacy. Combining both tables' allocations, compact used about 270,336 bytes vs legacy 3,186,688 bytes. These figures include table/index/storage overhead, are sensitive to fixture properties and are not a live customer-data estimate. Elapsed times represent a single uncalibrated test on GitHub hardware and should not be used to promise latency improvement.

The dual mode stored both full and compact history; it **increases storage and I/O** during observation. It must not be left on indefinitely without resource headroom.

## Production safety gates remain OPEN

- A read-only production SQL health/size sample attempted during this test timed out. No retry or heavy read was attempted.
- Supabase health advisors reported no notices, and current deployed `workshop-api` was still v124 at the time of that check. Those signals do not prove physical disk capacity or healthy Disk I/O credits.
- Physical free disk/WAL headroom and the minimum recent EBS Disk I/O balance remain unknown through the available connector.
- The complete, coherent restore path and exact current encrypted-PC Edge source backup/rollback remain unverified.
- The proposed compact-history infrastructure is NOT installed and history has NOT been purged.

**Decision:** Continue isolated qualification and recoverability checks; do not enable production DUAL/COMPACT, issue a mass snapshot export, perform heavy history rewrites, or restart the database.

The synthetic benchmark demonstrates that compaction is promising for changes affecting a few job/session records; larger reorders/rewrites may have very different compression efficiency. Measure representative patterns before making a business projection.
