# Insurance Phase 2: preliminary parts preparation

Branch: `architecture-v2`. This is the first controlled Phase 2 increment, not the completed approval/Job Card workflow. V304 remains the published version. No release metadata changes or persistent backend deployment are included.

## Audit findings

- Reception has a protected RPC and independent RC numbering.
- Estimates are standalone entries in `workshop_state.data.estimates`; they already allocate official estimate numbers without a Job Card.
- Job creation, technician assignments and their operational history remain in shared workshop state, with V2 projections/event streams.
- Spare Parts allocates its list only after validating the Job Card in workshop state; its events project into `workshop_v2_spare_part_state`.
- Whole-state saves use historical snapshots, server rebasing, preservation rules and an atomic expected-revision RPC. Linking an RC requires integration with this authority, not a second disconnected Job Card record.
- The existing whole-state commit RPC updates employee live status as well as state/history. A future RC/JC transaction must preserve that behavior and protect RC-controlled vehicle data from stale whole-state saves.

## Implemented preparation

A separate `workshop_reception_preliminary_parts` table stores one list per RC, with stable UUID item identities, name, optional part number and positive whole-number quantity. It stores no prices, purchases or income and consumes no operational PL number.

The reception detail view exposes Preliminary Parts only when the server GET response includes support for it. Manager and Supervisor can add/remove/save items while the case is open and unlinked. Designated Reception Staff can view them. Closed cases retain a read-only list. Linked cases refuse preparatory edits until the additional-approval/transfer path is implemented.

`SAVE_PARTS` uses the RC row lock/revision, a required reason, request UUID locking/deduplication and the existing append-only audit/command history. It rejects duplicate item IDs, equivalent name/part-number pairs, invalid quantities, oversized lists and extra fields such as purchase amounts. A failed response retains the form and request identity for safe retry.

The migration retains Phase 1 transitions by renaming the verified INVOKER function to `zukait_reception_phase1_command` and adding an INVOKER dispatcher under the existing endpoint name. Both functions remain restricted to `service_role`; direct anon/authenticated access is denied. The new table has RLS and no public policies, consistent with custom authenticated server access. No delete grant is provided to the service role.

## Verification

- Phase 1 UI tests, preliminary-list DOM tests and edge handler tests passed.
- All 133 existing regression programs, JavaScript syntax/inline-script checks, production asset checks and diff whitespace checks passed.
- SQL migration/assertions ran against the existing schema in one transaction followed by rollback. Checked Manager/Supervisor writes, Employee/designated staff restrictions, actual service-role grants, retries/conflicting request identities, stale revision rejection, duplicate items, malformed inputs, audit snapshots, read-only linked/closed cases and Phase 1 GET/CLOSE delegation.
- Assertions verified no changes to workshop state/revision, operational parts/events, or the RC sequence. Post-test query confirmed the migration/function rename was rolled back and no reception fixtures remain.
- SQL tests use negative sequence fixture values and never call the reception CREATE command; rollback therefore does not burn real checklist numbers.

Security advisors continue to report the existing service-only RLS-without-policy informational findings and the pre-existing unrelated spare-part trigger execution warning. This change does not modify that trigger. Reference: https://supabase.com/docs/guides/database/database-linter?lint=0008_rls_enabled_no_policy.

## Remaining Phase 2 work

RC-linked estimates and recorded insurance approval; atomic approved Job Card creation/linkage and server enforcement across legacy creation paths; authoritative shared vehicle corrections and JC location badges; approval of preliminary items and duplicate-safe transfer through normal server parts allocation/events; additional approvals; preservation-safe Manager cancellation after reviewing active work and outstanding parts.

Keep this migration unactivated until the next integrated Phase 2 acceptance step. Candidate commits use `[verify-only]` to suppress PC publication. No changes target `main`.
