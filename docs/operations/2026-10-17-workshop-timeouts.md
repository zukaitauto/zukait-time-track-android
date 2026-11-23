# Workshop snapshot timeout repair

Applied to project pjknotnjkufadqavcmii via recorded database migration
20261017133706_optimize_workshop_snapshot_trigger_arrays on 17 October 2026.

## Evidence

- Workshop API version 68 was active; request logs contained PostgreSQL 57014
  statement timeouts, HTTP 500/503 responses, and successful requests.
- Snapshot at diagnosis: 1,630,458 bytes JSON, 78 jobs, 1,114 sessions,
  four linked receptions. No blocking backend was observed in the inspected sample.
- A rollback-only `UPDATE workshop_state SET data=data` exceeded five seconds
  in the Reception identity trigger. After optimizing that trigger alone, the
  same test exceeded eight seconds in the live-status function.
- The identity trigger repeatedly rebuilt the entire snapshot inside its
  Reception loop. The worker-status function repeatedly extracted arrays from
  the large snapshot inside its employee loop.

## Repair

Cache job/estimate arrays in the identity trigger, retain the same validations
and projections, and install the final arrays after the loop. Cache users,
sessions, assignments and jobs once in the worker-status function. Function
signatures, invoker security, grants, table policies and business rules unchanged.
No rows deleted, business data reset, or timeout limits increased.

## Verification

- Candidate transaction: complete update including all triggers, 1,416.880 ms;
  rolled back.
- Compared baseline and candidate on isolated temporary tables using the live
  snapshot: identical job/estimate identity and live worker-status outputs.
- Missing linked jobs and estimates still rejected with the original errors.
- After deployment: complete rollback-only update including all triggers,
  341.902 ms.
- First observed post-deployment window: 36 POST requests returned HTTP 200,
  nine OPTIONS returned HTTP 200; no non-200 response in that sample.
- Local `node tests/reception-vehicle-authority.mjs` passed.
- Security advisor review completed; no authorization changes were made.

Regression SQL: tests/workshop-snapshot-trigger-performance.sql. Run with psql
on representative staging data; it creates isolated probe tables and rolls back
function replacement and all temporary data. The app UI changes remain pending
release; this database repair takes effect without installing a new app.

This confirms the observed bottlenecks and initial recovery, not that every
device's queued changes have already reached the server.
