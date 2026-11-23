# ZUKAIT production reliability and Disk I/O incident evidence — 15 November 2026

**Classification: READ-ONLY diagnostic checkpoint; production optimization HOLD.** This is evidence for deciding when *not* to add load. It is not evidence of a verified EBS credit balance, a confirmed root cause, or a production configuration change.

## Project and database baseline

Project: `pjknotnjkufadqavcmii` (Supabase PostgreSQL 17).
At **2026-11-15 13:02:36 UTC** (17:02:36 Oman), metadata-only SQL returned:

| Measurement | Value |
| --- | ---: |
| Supabase project health status | `ACTIVE_HEALTHY` |
| Health-advisor notices | 0 |
| Database allocation (`pg_database_size`) | 5,871,520,915 bytes |
| Legacy history relation (`pg_total_relation_size`) | 5,827,297,280 bytes |
| Database sessions | 10 |
| Active sessions | 1 |
| Waiting locks | 0 |
| Database cumulative deadlocks | 0 |
| `pg_stat_database.temp_bytes` (cumulative; stats reset unknown) | 290,380,724 bytes |
| `pg_stat_wal.wal_bytes` (since 11:06:56 UTC reset) | 70,004,409 bytes |
| `zukait_history` compact schema | ABSENT |

The PostgreSQL process start time was **2026-11-15 11:06:56.162987 UTC** (**15:06:56 Oman**), confirmed by `pg_postmaster_start_time()`. This is evidence of a database restart, **not proof of who or what initiated it**.

The history allocated relation is approximately 99.2% of the database allocation. **Neither `pg_database_size` nor `pg_stat_wal.wal_bytes` measures free physical disk space, live WAL footprint, available EBS burst credits or future I/O headroom.** Do not infer available free disk from these metrics.

## Unified log summaries — last 24 hours at 13:02–13:04 UTC

The logs query defaulted to the **preceding 24 hours**; the aggregate sources can describe overlapping requests, not distinct failure events.

| Source | Logged total events | HTTP 5xx events |
| --- | ---: | ---: |
| `function_edge_logs` | 30,533 (second query) | 361 |
| `edge_logs` | 26,207 | 83 |

**Function 5xx breakdown**:
- `workshop-api`: **354 HTTP 503** and **4 HTTP 546**.
- `staff-auth`: **2 HTTP 504** and **1 HTTP 500**.
- Function error counts reflect log events, not a proven number of unique failed requests.

**Gateway 5xx breakdown**:
- HTTP 521: 33 events.
- HTTP 522: 31 events.
- HTTP 525: 11 events.
- HTTP 520: 6 events.
- HTTP 500: 2 events.

**PostgreSQL log severity**: 575 `LOG`, 28 `FATAL`, 23 `ERROR` events.
- `FATAL`: SQLSTATE `57P01` (admin shutdown) 14; `57P03` (cannot connect now) 13; `28P01` (invalid password) 1.
- `ERROR`: `57014` (query canceled) 21; `42601` (syntax error) 2.
- Do not conclude a production bug solely from the 2 syntax errors or infer project restart intent from `57P01`; only the SQLSTATE and counts were inspected.

**Temporal concentration of Edge Function HTTP 5xx events**:
- 2026-11-15 **06:00 UTC**: 116 events; **07:00 UTC**: 129; **08:00 UTC**: 11. For Oman add four hours.
- 2026-11-15 04:00 UTC: 54; 11:00 UTC: 14.
- Events in the prior evening also occurred. Earlier failures and PostgreSQL interruptions are real despite an `ACTIVE_HEALTHY` project state when inspected.

## Post-restart validation window

An explicit **2026-11-15 11:07:00–13:04:00 UTC** window (15:07–17:04 Oman) showed:

| Source | Total logged events | HTTP 5xx | HTTP 4xx |
| --- | ---: | ---: | ---: |
| `edge_logs` | 3,284 | **4** | 0 |
| `function_edge_logs` | 3,872 | **3** | 5 |

All three Edge Function HTTP 5xx events in that window were `workshop-api` HTTP 503. In the same interval, the `postgres_logs` grouped `ERROR`, `FATAL`, or `PANIC` query returned **zero matching events**.

**Interpretation**: Error activity substantially decreased after the last observed restart, but errors did not reach zero; these figures cannot certify all live employees are synchronized, and the cause of the earlier interruption remains **unproven**.

## Operational safety decision

1. **NO** additional restart in response to historical logs alone.
2. **NO** change to production history retention, capture mode, database schema, Edge Function deployments, indexing, large exports, `VACUUM FULL`, or bulk JSON scans.
3. Current encrypted Z: recovery evidence has successfully backed up and locally restored core/history/private schemas (with separately dated audit relationship exception), backed up seven public Storage files, and backed up nine deployed Edge source functions. No runtime secrets or holistic platform recovery have been demonstrated.
4. **Need physical capacity evidence**: minimum recent Supabase Disk I/O balance / burst credit exhaustion and actual database disk usage/free capacity (including WAL) in Dashboard infrastructure and observability. Supabase Support previously diagnosed exhausted EBS I/O balance; this log analysis alone neither confirms nor rules out a recurrence.
5. Review the historical 503 concentration, PostgreSQL restart timeline and canceled queries with Supabase Support if repeated. Provide **aggregate** evidence rather than posting private log contents or credentials to GitHub.
6. Only after confirming stable workshop usage, adequate physical headroom, a coherent recovery point and separate owner approval, requalify any minimal history optimization against the live `workshop-api` v123 bundle.

## Read-only SQL used

```sql
SELECT now() AS sampled_at,
       pg_database_size(current_database()) AS db_bytes,
       pg_total_relation_size('public.workshop_state_history'::regclass) AS history_bytes,
       pg_postmaster_start_time() AS postgres_started_at_utc,
       (SELECT count(*) FROM pg_stat_activity WHERE datname=current_database()) AS sessions,
       (SELECT count(*) FROM pg_locks WHERE NOT granted) AS waiting_locks;
```

Unified logs were grouped only by log source, HTTP status, function ID, SQLSTATE and time bucket. No source record contents, personal data, query bodies, passwords or tokens were exported to this report.

**Production state changed by this investigation: NONE.**
