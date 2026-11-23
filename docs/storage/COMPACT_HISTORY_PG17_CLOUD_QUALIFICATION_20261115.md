# ZUKAIT compact history — cloud PostgreSQL 17 qualification (15 Nov 2026)

Status: **Synthetic database tests PASSED. Production history optimization NOT deployed.**

## GitHub verification

- Workflow: https://github.com/zukaitauto/zukait-time-track-android/actions/runs/43736415969
- Commit: 5e21af9626b3066c32c4b04bdefb975209a79d6b
- GitHub Actions result: COMPLETED / SUCCESS.
- Node.js 24; pinned npm dependencies; isolated disposable PostgreSQL 17 service in GitHub Actions.
- Legacy-by-default compatible history-reader test: PASS.
- Offline v124 backup staging fail-closed safeguards: PASS.
- Twelve synthetic compact-history SQL test groups on PGlite: PASS.
- Same twelve SQL groups on PostgreSQL 17: PASS.

The SQL cases cover compact/dual capture, legacy/compact readers, array patches, reconstruction integrity, Reception/Mechanical history, rollback modes, real-save fixtures and redundant seed guards. No production access or real customer data was used by these CI tests.

## Production read-only baseline

At 2026-11-15 16:35:37 UTC, production project pjknotnjkufadqavcmii:
- Database allocated: 5,892,959,379 bytes.
- Legacy history allocated: 5,848,670,208 bytes.
- Compact configuration table absent: true.
- Waiting locks: zero at sampling.
- Project metadata: ACTIVE_HEALTHY.

Allocated relation sizes are not free physical disk space or available EBS I/O burst credits.

## Remaining mandatory gates

1. Obtain minimum recent Disk I/O burst balance, free physical disk and WAL headroom from Supabase dashboard before additional live database writes.
2. Verify a current, coherent public/private database recovery point and representative app recovery; existing PC backups taken at different moments had documented local-only Vehicle audit reference mismatches, while all six references exist in live production.
3. Make an encrypted-PC copy of exact currently deployed workshop-api source v124, with checksum verification, when operator PC access is available; the previous source backup is v123.
4. Reverify the live Edge version and complete exact rollback before any reader deployment; later versions require requalification.
5. In separate gated steps: install compact infrastructure with LEGACY mode, deploy compatible reader, observe bounded DUAL safely, then consider COMPACT after integrity and I/O checks.
6. Old history deletion, backfill, VACUUM FULL and disk reclamation require a separate recovery and approval plan.

Conclusion: native PostgreSQL 17 test qualification is complete, but production compaction and legacy history size reduction are not complete. This CI workflow used no production credentials and did not migrate, delete or rewrite any live records.

## 16 November 2026 addendum — forward compression and live reliability

- Isolated GitHub Actions run [43809306947](https://github.com/zukaitauto/zukait-time-track-android/actions/runs/43809306947) **PASSED** at commit `bdaf51317e6761ec929d55712547d79f0dfd2858`: previous twelve PGlite compact-history groups, twelve native PostgreSQL 17 groups, offline staging safeguards, and the new native-only forward LZ4 compatibility fixture.
- The LZ4 fixture confirms that enabling LZ4 for **future** JSONB TOAST values leaves prior PGLZ storage unchanged and JSONB contents equivalent. This is an isolated synthetic check, not permission to rewrite any existing archive.
- Production read-only observation at **2026-11-16 05:14:20 UTC**: database allocation `5,921,287,315` bytes, legacy history allocated `5,881,241,600` bytes, `16,577` archived rows, current revision `17,148`, 0 waiting locks and no compact configuration table. Actual current and four recent archived JSONB values showed `pg_column_compression(data)='lz4'`, stored size approximately 1,366,269–1,367,298 bytes each. Earlier PGLZ samples were about 2.29 MB, **not the same exact JSON payload**, so the comparison is observational, not a controlled compression benchmark.
- PostgreSQL process started at **2026-11-16 04:15:47 UTC** (08:15:47 Oman). The precise cause/initiator of the restart was **not established**.
- In bounded unified logs for **2026-11-16 03:45:00–05:20:00 UTC**, PostgreSQL logged 4 FATAL `57P03` (cannot connect now), 2 ERROR `57014` (query canceled) and 1 `08006` log event. The same log window had 16 `function_edge_logs` HTTP 503 events and 4 `edge_logs` HTTP 521 events. Log entries from separate sources need not equal unique failed requests. There were no current health-advisor findings at sampling. Prior Supabase Support attributed an earlier outage to exhausted EBS I/O balance, but that alone does not prove this restart had the same cause.
- **Safety decision remains HOLD**: despite passing regression tests and LZ4 now being used by fresh snapshots, do not enable DUAL/COMPACT, run table rewrites or delete history before verifying physical disk/WAL headroom, minimum recent EBS I/O balance, and a coherent full recovery point. The encrypted Windows Z: v124 exact-source backup and offline staging remain outstanding while the operator is away from the PC.
