# Phase 2: insurance Job Card creation guards

Source increment only. Migration `20261009084321_reception_job_creation_guards.sql`
depends on both earlier, pending Phase 2 migrations. None is deployed yet.

Two service-only, security-invoker functions and two BEFORE triggers prevent new
insurance jobs from entering through legacy `JOB_CREATED` events or full workshop
state saves without an approved, linked reception. Cash/credit jobs cannot be
converted to insurance to bypass the gate. Existing insurance jobs remain compatible
with normal operational saves; changing their quotations does not stop repairs.

The creation check requires matching RC/job linkage, an open case, approved status,
the latest approval, unchanged authoritative vehicle identity, unchanged preliminary
parts and exactly one unchanged quotation in server state. Neither a client badge
nor an approval row alone is sufficient. No time, parts, financial, QC, delivery or
cancellation behavior is changed. No release/version metadata changes.

Verification uses `tests/reception-job-guards.sql` with all pending migrations inside
one transaction ending in ROLLBACK. It checks the actual service-role path, denied
events/snapshots, missing/wrong linkage, waiting/cancelled cases, changed identity,
parts and quotations, duplicate quotations, successful linked creation and subsequent
operational saves. Explicit fixture numbers avoid business sequence consumption.

These guards intentionally fail closed for new insurance jobs until the atomic RC
creation command and frontend are implemented. **Do not deploy this increment on its
own.** Next: create the Job Card and transfer approved items atomically using existing
state history, live-status projection, server parts allocation and event projections;
test concurrent retries, global vehicle corrections and VWC/VIW views before activation.
