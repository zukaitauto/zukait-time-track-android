# Phase 2: atomic approved RC to Job Card

Source only; not deployed or released. Migration `20261009090923_reception_create_job.sql`
depends on the three earlier pending Phase 2 migrations. Use the full integration
acceptance gate before activating them. V304 stays live.

Manager/Supervisor can submit CREATE_JOB with RC number, expected RC revision,
request UUID, a manually entered Job Card number and mandatory reason. Server
authentication supplies the actor. The command locks the RC then shared workshop
state, checks status, uniqueness and all current approval source snapshots. New
jobs use the established manual numbering convention; ID001 is reserved.

One transaction links the RC, appends an unassigned insurance job using authoritative
RC vehicle/customer fields, archives workshop state, advances its revision and emits
the normal JOB_CREATED projection. The existing state trigger refreshes live employee
status from unchanged sessions. No sessions, assignments, purchases, consumables,
estimates, expenses, income, QC or delivery records are modified. VIW/VWC is retained.

For approved parts only, the command calls the normal PL allocator and emits normal
SPARE_PART_LIST_CREATED / SPARE_PART_LISTED events targeting Purchaser. Approved
quantities, rather than draft quantities, are transferred. A new service-only RLS
table `workshop_reception_part_transfers` records immutable source-item/approval/PL/
operational-part mappings; unique constraints prevent repeat transfer. Labour-only
approvals allocate no PL. Reception audit and request cache commit with all writes.
Projection failures roll everything back. Business sequences may have gaps after
failed allocation, as in the established allocator; allocated numbers are not reused.

The UI form appears only when the server returns job_creation.can_create. It retains
the same request UUID after a lost response and pulls normal workshop state only
after server confirmation. Pending local work remains protected by existing cloud
sync. A failed pull does not recreate the job; normal synchronization retries it.

Verification: transaction rollback SQL covers service-role permissions, waiting and
stale approvals, corrupted duplicate-part projection rollback, partial approved
quantity, revision advancement, retry/conflicting request, second-creation denial,
existing job projection collision, Supervisor labour-only creation, unchanged VIW/
VWC, preserved employee live work and unrelated workshop data. Explicit empty test
PL allocations exercise the existing allocator without consuming live business
numbers. DOM tests cover server gating, lost responses, normalization, confirmed
linkage and failed-pull recovery. Real simultaneous-device acceptance is still pending.

Remaining before Phase 2 activation: enforce shared RC vehicle corrections through
all job projections and stale saves; expose movement/location in linked Job Card
views; additional approvals; Manager cancellation review preserving work/expenses;
full integrated concurrency and physical-device acceptance. No standalone deployment.
