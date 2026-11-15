# ZUKAIT lightweight query optimization — 15 November 2026

**Status: CODE CANDIDATE ON `architecture-v2`; NOT DEPLOYED.** No production DDL, SQL migration, index, release, Edge deployment, change to history retention, or restart performed in this investigation.

## Verified production checks

- Supabase project `pjknotnjkufadqavcmii` reported `ACTIVE_HEALTHY` without health advisor lints.
- The PostgreSQL 17 instance has `pg_stat_statements` installed in the `extensions` schema. Statement stats reset: **2026-11-15 11:06:56 UTC**; `dealloc=0`.
- PostgreSQL I/O counters from `pg_stat_io` reset at **11:06:56 UTC**; client-backend reads **1,215**, client-backend writes **0**, sampled I/O waiters **0**, lock waiters **0** at **13:14:58 UTC**. These values are **not** EBS Disk I/O burst balance or physical disk free space. Do not interpret zero writes for one backend type as absence of WAL or physical disk writes.
- Database allocated `5,871,520,915` bytes, legacy `workshop_state_history` relation allocated `5,827,297,280` bytes (includes TOAST/index/reusable allocation). Both are **allocated bytes**, not removable bytes.
- Supabase performance advisor found **47 missing covering indexes for foreign keys** (informational). This is not evidence of a specific measured hotspot; creating indexes would consume storage and I/O, so **none were added**. Official remediation reference: https://supabase.com/docs/guides/database/database-linter?lint=0001_unindexed_foreign_keys

### Actual expensive operations (post-reset cumulative stats)

| SQL route | Calls | Total exec time | Mean | Max | Temp blocks written |
| --- | ---: | ---: | ---: | ---: | ---: |
| `public.zukait_commit_workshop_state_v2` | 10 | 39,333.9 ms | 3,933.4 ms | 6,740.9 ms | 12,648 (98.8 MiB) |
| `public.zukait_accountant_context` | 16 | 9,871.8 ms | 617.0 ms | 1,017.5 ms | 21,530 (168.2 MiB) |
| `public.zukait_manager_full_job_edit` | 1 | 3,204.5 ms | 3,204.5 ms | 3,204.5 ms | 1,265 (9.9 MiB) |
| Full `workshop_state` read (one PostgREST shape) | 47 | 14,669.2 ms | 312.1 ms | 635.6 ms | 0 |
| Full `workshop_state` read (another shape) | 34 | 13,271.2 ms | 390.3 ms | 991.6 ms | 0 |

The full-state write is the most expensive measured route, and the table's repeated full-history JSON backup is the architectural storage pressure. **Neither is fixed by the small projection patch below**. Accountant context returned the snapshot and aggregated events/journal, with high temp writes. Its execution plan on `workshop_v2_events` contains a sequential scan plus sort; it is not proof that one additional index will improve the complete RPC. No query was executed with `EXPLAIN ANALYZE` on production, and no costly history data scan was performed.

## Candidate change: reduce two unnecessarily broad read responses

Committed code: `supabase/functions/workshop-api/index.ts` on `architecture-v2`. Branch SHA with candidate and new regression: `7143f6f705eb242e517d414ca3271f4745814403`.

- **Insurance Manager dashboard**: read only `jobs:data->jobs` instead of the entire `workshop_state.data` JSON. `insuranceProjection` consumes the jobs section and separately loaded Reception/Insurance tables. Manager permission checks, filters, amount calculations, and all write actions remain unchanged.
- **Receptionist delivery list (read only)**: read only `jobs:data->jobs,assign:data->assign,sessions:data->sessions`. `receptionistDeliveryList` and `qcStatus` depend on those exact three arrays; remaining state fields are not required for list output. The separate `receptionist_deliver` mutation still reads `revision,data` and retains full CAS, QC checks, audit, and retry semantics.
- Uses the same PostgREST JSON projection field syntax already used elsewhere in the repository. This narrows network/result JSON; it **still reads the underlying JSON value on PostgreSQL**, so it is **not** a fix for full-history writes or a guaranteed physical disk-I/O reduction.

## Test and release controls

- Added `tests/read-only-projection-io.mjs` with synthetic fixtures: compares projected and full-state Insurance rows/counts and Reception QC/delivery readiness, checks no financial/extra state is needed, and asserts exact route selectors, permissions and full-state mutation CAS remain.
- Included that test in `scripts/ci-full-regression.sh` following the existing Insurance management API test.
- **Verified CI**: GitHub Actions workflow [Build Zukait Time Track APK, run 43718761420](https://github.com/zukaitauto/zukait-time-track-android/actions/runs/43718761420) completed successfully against the exact candidate commit `7143f6f705eb242e517d414ca3271f4745814403`. The job's functional smoke-test logs explicitly contain `PASS: scoped read-only workshop-state projections preserve insurance and QC results; write CAS and permissions unchanged.`. Source changes and test were independently read back from the branch. This is synthetic/CI evidence, not production measurement of reduced traffic or a published release.
- **No production deployment approval**: a later release must compare the exact deployed `workshop-api` v123 bundle and keep unrelated pending changes out. Requalify all behavior before separately authorizing an exact minimal patch.

## Capacity gate: cannot certify

Connected Supabase project metadata and SQL/extension interfaces do **not** expose remaining EBS I/O burst credits or physical available disk space. `pg_database_size`, `pg_stat_io`, `pg_stat_wal`, `pg_stat_statements`, and status `ACTIVE_HEALTHY` are not substitutes. These values require the authorized Supabase dashboard/physical infrastructure metric provider. The earlier Support case described exhausted EBS IO balance and recent November 15 503/restart errors; optimizing without this information could exacerbate outages.

**Production status: HOLD** compact history, dual-write mode, schema/index creation, vacuum-full, bulk exports, and any restart. Preserve all verified Z: archives and existing history. No user-facing UI/functionality changes have been published.

## Verification update

At the final readback the architecture-v2 build, inactive Mechanical/Accountant contracts, Connection outage safety and functional smoke-test workflow completed successfully for candidate commit `7143f6f705eb242e517d414ca3271f4745814403`. No deployment action was invoked.
