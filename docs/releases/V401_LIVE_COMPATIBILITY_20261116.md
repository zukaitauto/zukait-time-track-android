# ZUKAIT V401 — scoped live compatibility record (2026-11-16)

Project: `pjknotnjkufadqavcmii` (production); branch: `architecture-v2`.
Staff release status: **HELD**. Published client remains V400.

## Verified source identity
- Live `workshop-api`: v124, bundle SHA-256 `ebd48e18da452008048a67902a346b9b3ad67e9f85124aa48aaa2dae7e134f3e`.
- V401 signed candidate source is commit `99059a2f6036e90384f2379e09d5141495a9928a`; the release request still refers to an earlier backend v123. **Do not deploy candidate `index.ts` over v124**: it would remove v124 changes.
- Live `accountant/finance_rules.js`, `accountant/profit_performance.js`, `accountant/api.js`, `accountant/context_reader.js`, `job_edit_rules.js`, `time_management_rules.js`, and `reception_dashboard_rules.js` matched the V401 candidate when checked. `index.ts` differs; its v124 read coalescing and other changes must be retained.

## Checklist Work Description — production DB updated and verified
- Applied isolated migration `reception_linked_checklist_work_description_v401` (Supabase migration version `20261116085253`).
- Transactional, 3-second lock timeout, 30-second statement timeout; no history deletion or rows migrated.
- Readback of `pg_get_functiondef` confirmed exactly one guarded `workDescription` injection in each of:
  1. `public.zukait_reception_vehicle_command(text,jsonb)` (approved Insurance)
  2. `public.zukait_reception_cash_base_command(text,jsonb)` (external Insurance)
  3. `public.zukait_reception_command(text,jsonb)` (Cash/Credit)
- A strict inverse/rollback file is committed at `scripts/rollback-v401-reception-work-description.sql`; it is **not automatically executed**.
- Real authenticated Job Card creation acceptance is **NOT RUN** to avoid writing trial customer data to production.

## Mechanical Inspection — DB foundation installed; API still held
- Applied `mechanical_inspection_secure_v401` and `mechanical_inspection_linked_job_type_guard_v401` using short transaction/lock timeouts.
- Readback confirmed private `zukait_mechanical.inspection_details`, `inspection_receipts`, `inspection_audit` and public `zukait_mechanical_inspection_read` / `zukait_mechanical_inspection_save` RPCs.
- All three tables have RLS enabled; anon/authenticated have no direct SELECT/EXECUTE; service_role access retained. Existing inspection row count was 0.
- The current v124 `workshop-api/index.ts` has **no `mechanical_inspection` dispatch**. The source-side handler and separate adapter modules exist in V401 GitHub but have not been layered onto and redeployed as a minimal v124 patch.
- **Do not enable** `ZUKAIT_MECHANICAL_INSPECTION_ENABLED` or publish the Mechanical Inspection UI until an exact-v124-source patch, safe off-platform backup/rollback, and real authenticated tests have passed.

## VIN / Vehicle Master — NOT activated
- Production has three pre-existing private customer-role audit tables in `zukait_vehicle`, but **not** `physical_vehicles`, `vehicle_visits`, `zukait_vehicle_lookup_candidates`, or `zukait_vehicle_verify_match`.
- The V401 branch contains staged Vehicle Master foundation, identity-safety, lookup-candidate and full-VIN verification migrations, and v401 client/server handlers.
- Applying these migrations creates/changes production triggers on Reception and Job Card records; not a safe isolated endpoint-only change.
- Keep VIN matching fail-closed: do not link by registration plate alone or return customer/claim/invoice information in candidates.
- Vehicle Master migration sequencing, production backup/rollback, role testing and v124-compatible API overlay remain **pending**.

## Scope and release boundary
- No Web/APK published, no Edge Function deployed, no Supabase restart, no compact-history migration or history deletion.
- These two isolated SQL deployments **do not approve V401 for staff**.
- Next gate is a minimal v124-based Edge Function compatibility patch with exact-source rollback and authenticated Manager/Reception/Mechanical role tests; Vehicle Master requires a separate controlled schema/trigger gate. 
