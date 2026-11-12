# Accountant context I/O qualification — 12 November 2026

Status: **qualified I/O trade-off for review; NOT applied to production**.
No staff release, database index, migration, history deletion or business record update
was performed. The whole-database optimization program remains incomplete.

Live baseline inspected on pjknotnjkufadqavcmii: context definition MD5
`5cb0e04223f9f3e517ece00eb11fa8a3`, owner postgres, security invoker,
search_path public, execute restricted to postgres and service_role.
Existing event_id primary key confirmed from live index definitions. A later lightweight
metadata read timed out, so further measurements stayed isolated.

A rewrite that merely moved ordering before JSON construction did not demonstrate
an improvement. An additional partial ordering index also failed to reduce spill
in the qualified inline-payload fixture. Both were rejected; neither was installed live.

The final candidate sorts only event IDs/timestamps, uses the existing primary key
for lateral payload lookup, and explicitly retains the original timestamp/event-ID
ordering. OFFSET 0 prevents flattening the per-key lookup before narrow sorting.
The function signature, role checks, statement-level snapshot, full state, full ledger,
all matching events, finance revision and financial calculations remain unchanged.
No new production index or cache is needed.

Qualified candidate source: `13501c085c12c318d83b82b09871bafe670788dd`.
Native PostgreSQL 17 run: https://github.com/zukaitauto/zukait-time-track-android/actions/runs/43165164992
Candidate definition MD5: `ecb40a1fbf2a4929416960a1bca31786`.
The isolated baseline definition hash matches the inspected live baseline.

Five warmed samples per variant, work_mem 3500kB, synthetic event payloads around
1.5KB, existing production-equivalent event indexes plus existing primary key:

| Events | Baseline median ms | Candidate median ms | Baseline temp blocks | Candidate temp blocks |
|---|---:|---:|---:|---:|
| 2,000 | 30.134 | 35.778 | 0 | 0 |
| 10,000 | 190.759 | 218.178 | 2,044 | 0 |

This eliminates about 16.7 MB of temporary writes per large synthetic call but adds
about 14.4% elapsed time at 10k (18.7% at 2k). It is **not an overall latency improvement**.
These are synthetic figures, not measured production savings. Peak RAM, physical Disk
IO budget, billed network traffic and restart prevention were not established.
The full context is still assembled; this does not reduce API call counts, network
payload size or history storage, and it must not be presented as full optimization.

Correctness passed: empty contexts, original arrays/fields, chronological order and
ID ties/null timestamps, missing snapshot, inactive/unknown/password-change actors,
Manager/Accountant access, anon/authenticated denial, service role access, unchanged
owner/invoker/search_path/ACL, immutable input, and ten successful financial reports.
PGlite checks and existing finance/append-only-ledger suites passed locally. Native
PG17 benchmark/correctness passed; source Accountant isolated acceptance, Mechanical/Accountant contracts, outage safety and Android architecture build also passed. Signed acceptance and general APK build were still running at this checkpoint.

Review-only apply/rollback packets are `outputs/accountant-context/apply.sql` and
`rollback.sql`. They verify the exact expected definition, owner, invoker, search_path
and permissions before/after replacement, require the existing unique event-ID index for apply, and use short lock/statement timeouts. The
rollback rejects a changed live candidate. They are not migration-history files.
If approved, generate a migration using the Supabase CLI, re-read the exact live
baseline, apply this one-function change, verify definition/permissions, then measure
normal authorized reads against comparable reset-valid counter intervals.

Recommendation: decide explicitly whether the lower temporary I/O justifies the
CPU/latency overhead. Do not apply automatically to an unstable instance. Remaining
work includes bounded/filter-aware context retrieval or correctly invalidated reuse,
compact-history qualification/cutover, and infrastructure/billing restart diagnosis.
