# ZUKAIT V401 backend compatibility — FINAL DEPLOYMENT UPDATE

**Updated: 2026-11-16.** API compatibility deployed, **staff V401 remains held**.
This update supersedes the historical 'VIN not activated' and 'Mechanical API absent' findings in the archived investigation below.

## Verified production state
- Supabase project `pjknotnjkufadqavcmii`: `workshop-api` **v125 ACTIVE**; SHA-256 `41e5fdde202f44facd4aaff2387c0d0eea706c02b1094e5418742a65734078de`.
- Exact live v124 source was preserved outside the four scoped additive route/import and whitelist blocks; **all 42 existing non-entrypoint source files** remained byte-identical on v125 readback. Seven audited Mechanical Inspection server modules added, total 50 files. `verify_jwt=false` kept to preserve the existing custom session auth model; new actions require the established authenticated staff session and per-role checks.
- Staged exact-v124 overlay: `releases/v401-v124-compat/workshop-api/index.ts`. Exact pre-overlay v124 entrypoint: `releases/v401-v124-compat/workshop-api/rollback-v124-index.ts`. Emergency Vehicle Master trigger disable: `scripts/rollback-v401-vehicle-master-capture.sql`. This is not evidence of a full off-platform backup of all Supabase resources.
- Isolated compatibility workflow passed: [run 43837861641](https://github.com/zukaitauto/zukait-time-track-android/actions/runs/43837861641).
- Live v125 invalid-session smoke tests for `vehicle_master_candidates`, `vehicle_master_verify` and `mechanical_inspection` passed: [run 43838547750](https://github.com/zukaitauto/zukait-time-track-android/actions/runs/43838547750). These tests verify denial of unauthenticated requests, not authenticated business workflows.

## Vehicle Master integration
- Applied atomic six-script safe-identity migrations under `v401_vehicle_master_safe_identity_v124`: private physical vehicles/visits/ownership, VIN candidate lookup and exact VIN match, capture and linked Job Card reconciliation triggers. No archived Job Card, customer, insurance or history records rewritten; plate alone never establishes physical identity. RLS enabled on new tables, direct public RPC execution denied.
- Applied bounded `v401_verified_format_vin_intake_backfill`, source: `docs/releases/V401_VERIFIED_FORMAT_VIN_INTAKE_BACKFILL.sql`. Exactly **43 historical Reception intakes** had distinct syntactically valid 17-character VINs. These were added as 43 physical vehicles and 43 Reception visit references, with 0 duplicate VIN keys, 0 orphan visits. Existing 46 Reception records remain untouched; blank VINs are not forcibly linked.
- Direct SQL lookup verification: `32621-m` and `32621 M` normalize to `32621M`; direct VIN match positive for all 43 registered intakes and zero for a nonmatching VIN. This validates the private RPC logic, not physical VIN authenticity.

## Mechanical Inspection integration
- Database foundation `mechanical_inspection_secure_v401` and job-type guard `mechanical_inspection_linked_job_type_guard_v401` previously applied. Private tables and authorized read/save RPCs verified; direct anon/authenticated access denied. The source overlay now exposes the `mechanical_inspection` route on v125 with the existing authenticated session and dedicated Mechanical role/checklist checks.
- **Feature gating retained:** `ZUKAIT_MECHANICAL_INSPECTION_ENABLED` must be explicitly enabled after authenticated device and audit checks. This flag's current value was not verified by the available management API. No test Mechanical Inspection data was written to production.

## NOT YET VERIFIED — keeps V401 held
- Live Manager/Reception/Mechanical authenticated behavior, including real VIN confirmation and real Mechanical Inspection READ/SAVE, after this v125 rollout.
- Physical Android V401 installation, end-to-end synced Job Card test, staff permission boundaries with actual login sessions, full coherent backup/restore and operational rollback of the complete application.
- Current-source drift: the signed V401 candidate and publication metadata are pinned to an older source. V401 cannot be published without separate source/CI reconciliation.
- No compact-history optimisation, history deletion, service restart, or staff APK/Web publish occurred as part of this backend change.

---

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
