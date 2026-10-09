# Spare-parts trigger privilege review

Branch: architecture-v2. Pending migration: `20261009153713_reception_trigger_privileges.sql`. Nothing is deployed. V304 / versionCode 267 and workshop-api 58 remain live.

## Finding and change

The live advisor reports anonymous and authenticated execution of `public.zukait_v2_project_spare_part_event()`. Catalog inspection confirms it returns `trigger`, is SECURITY DEFINER, has `search_path=public`, and is attached as the enabled `workshop_v2_spare_part_state_guard` trigger on `workshop_v2_events`. No direct calls exist in client or Edge Function code. This is a trigger helper, not a public RPC contract; a trigger return type also prevents ordinary invocation outside a trigger. The grants are unnecessary even though the advisor's generic RPC description does not establish an exploitable RPC.

The pending migration revokes EXECUTE from PUBLIC, anon and authenticated while retaining service_role execution. It does not change the function body, trigger, search path, RLS, event validation, financial snapshots or parts state machine. Other functions retain their established grants.

## Verification on 2026-10-09

Three independent BEGIN/ROLLBACK transactions applied all eight pending migrations and ran:

- `reception-create-job.sql` + `reception-vehicle-authority.sql` + `reception-trigger-privileges.sql`.
- `reception-create-job.sql` + `reception-additional.sql` + `reception-trigger-privileges.sql`.
- `reception-cancellation-fixture.sql` + `reception-cancellation.sql` + `reception-trigger-privileges.sql`.

All passed. They exercise normal event-triggered parts transfer, approved quantities, retries, stale corrections, direct projection protection, cancellation and retained costs. New privilege assertions verify anonymous/authenticated denial, service execution and the enabled event trigger. Creation tests assert unchanged live RC, quotation and PL sequences; fixtures use explicit QA identifiers rather than allocating business numbers.

Post-rollback inspection confirmed no pending transfer/cancellation tables, zero RC-QA fixtures and restoration of the original live grant. The live advisor warning consequently remains until the tested migration is activated; do not describe it as already fixed in production.

## Activation

This is the eighth pending migration. Activate it with the complete ordered Phase 2 bundle after isolated concurrent-database, Android WebView and physical Safari acceptance. The existing Chromium/WebKit viewport checks use mocked API fixtures and do not complete those gates. No Phase 3 or release changes are included.

Reference: https://www.postgresql.org/docs/current/sql-createtrigger.html
