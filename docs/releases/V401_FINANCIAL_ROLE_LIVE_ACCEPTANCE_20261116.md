# ZUKAIT V401 — Live financial and role acceptance assessment

Date: 2026-11-16. Production project: `pjknotnjkufadqavcmii`.
Scope: read-only production verification. **No production workshop data, audit record, staff account, or session was changed.**

## Financial report: October 2026

| Metric | Owner-approved 2026-11-15 baseline | Production 2026-11-16 recalculation | Variance |
| --- | ---: | ---: | ---: |
| Cash + Insurance jobs | 45 | 45 (28 Cash + 17 Insurance) | 0 |
| Invoice / received LPO amounts (OMR) | 11,007.000 | 11,007.000 | 0.000 |
| Total job costs incl. labour/sublet (OMR) | 5,088.128 | 5,088.608 | +0.480 |
| Profit (OMR) | 5,918.872 | 5,918.392 | -0.480 |
| Partial-cost jobs | 1 | 1 | 0 |

Source: production `workshop_state` revision **17197**, finance revision **0**, 45 selected October Cash/Insurance jobs, 608 relevant employee sessions and 1,275 authoritative spare-part events. The report was recomputed with the actual `finance_rules.js`, `profit_performance.js`, `spare_projection.js`, and `accounts_parts_cost.js` logic against a read-only **October-cohort projection** of that state and events, evaluated with October 2026 filter. This was a direct code-level recomputation, **not** a fresh authenticated Manager HTTP report session.

An independent source-side SQL revenue check found the same 45 records and 11,007.000 OMR. A prior authenticated Manager report match was documented on 2026-11-15, but that is not a substitute for current reconciliation.

Outstanding: identify why current recomputed job costs exceed the approved prior report by **0.480 OMR**, with no forced zero, silent adjustment or edited Job Card. Production source inspection found no October-cohort sessions newly created or manually/Manager-time corrected since 2026-11-15 and no corrected/repriced October actual consumables records in that window. Twelve newer spare-part events were examined; none referenced an October-cohort Job Card. That narrows but does not resolve the difference. Exact historical per-Job-Card approved XML values are not yet available for a row-by-row diff.

**Financial gate: FAIL / RECONCILIATION PENDING.** Retain `evidence.liveCostReconciliation=false`.

## Database role and permission checks

- Live Accountant context read using an active Accountant record: **PASS**, returns a JSON financial context and workshop revision 17197.
- Context read using active Supervisor, Receptionist or Employee records: **DENIED**, each returns `accountant_forbidden` in production.
- Sensitive functions `zukait_accountant_context`, `zukait_accountant_read_snapshot`, `zukait_accountant_post`, `zukait_manager_accountants`, `zukait_mechanical_inspection_read/save`, `zukait_vehicle_lookup_candidates`, `zukait_vehicle_verify_match`, and `zukait_reception_command`: both `anon` and `authenticated` PostgreSQL roles have **no EXECUTE privilege**; service role alone has EXECUTE.
- Tables `staff_credentials`, `staff_sessions`, `workshop_state`, `workshop_accounting_entries`, `workshop_accountant_commands`, `workshop_v2_events`, `zukait_mechanical.inspection_*`, and `zukait_vehicle.physical_vehicles/vehicle_visits`: RLS enabled and no direct SELECT privilege for `anon` or `authenticated`.
- Count-only staff inventory: **33 total**, **25 active**, **8 inactive**. This does **not** prove password hashes/session tokens remained unchanged.
- Existing exact-source Accountant isolated QA run [43856800029](https://github.com/zukaitauto/zukait-time-track-android/actions/runs/43856800029) passed, including its live **invalid-session denial** tests. This verifies negative access; not positive authenticated actor acceptance.
- Supabase Health advisor: **0 lints**. Security advisor: informational `rls_enabled_no_policy` notice (77 findings); [linter reference](https://supabase.com/docs/guides/database/database-linter?lint=0008_rls_enabled_no_policy). Deny-by-default tables used through the service role may intentionally have no public policies; review is separate from permission checks.

## Not performed / release decision

No real staff credentials or bearer tokens were accessed. Therefore live **authenticated staff-session HTTP** checks for Manager, Accountant, Supervisor, Receptionist and Mechanical Supervisor and live Mechanical inspection READ/SAVE cannot be marked completed here. A SQL role simulation using an actor ID is not equivalent to staff login. Device acceptance, source-cost row reconciliation and full backup/rollback tests remain pending.

**Role gate: PARTIAL** (database checks pass; authenticated staff-session acceptance not run).
**Staff publication: HELD** — retain `approvedForStaff=false`, `evidence.serverPermissions=false`, `evidence.credentialPreservation=false`, `evidence.liveCostReconciliation=false`; keep V400 staff version current.
