# Separate Mechanical Supervisor role — inactive development candidate

Owner explicitly requested a new Mechanical Supervisor role, without access to the bodyshop Supervisor dashboard. The exact stored/auth/client role is `Mechanical Supervisor`, separate from `Supervisor`. SUP003/Jibin profile now uses this new role and canonical department `Mechanic`. Manager Create User offers the role, forces that department in both client and server, and retains Manager authorization, private password hashing, uniqueness and mandatory first-password-change rules. No account was created or converted.

## Isolation

Verified login/restore redirects the role to mechanical_supervisor.html before legacy full-state cloud initialization. The dedicated host verifies the current custom session and exact role, imports only Mechanical workspace components and explicitly activated PDF/signature/tracking/report/delivery components, and never loads supervisor_stable.js/cloud_sync.js or their bodyshop dashboard. Wrong-role sessions are denied rather than redirected into a more privileged dashboard. All client and server Mechanical flags remain off by default; an inactive Mechanical account sees an activation notice, never a bodyshop fallback.

The actual workshop-api Edge handler denies every non-mechanical_ action for the verified role before ordinary dispatch: full-state load/save, bodyshop QC, Reception, Accountant, generic Parts/event writes and management actions. Tampering with local role/menu does not alter server authorization. Existing Mechanical server planners, private invoker SQL, scoped readers and client components accept the distinct role alongside their existing permitted roles; explicit per-account capabilities/document/signature grants and source/revision/session checks remain required. SUP003 identity is still required for Mechanical QC and own signatures. SUP001 painting/final identities and SUP002 sequencing are unchanged. Mechanical QC overview excludes unregistered bodyshop-only jobs for the new role and never grants painting/final actions.

Existing ordinary Supervisor/Manager permissions are not globally widened or renamed. Legacy cloud host paths need no new-role permissions because the new role uses its dedicated host. Older clients lacking the new login route must fail closed and require update; no automatic conversion to generic Supervisor is allowed.

Per-account pending Mechanical command/tracking/delivery receipts and device identity survive session cache cleanup. Cached business snapshots are cleared. Pending recovery still belongs to the current authenticated account, and current server permissions are required before replay. The dedicated host clears displayed records on account change.

## Schema and rollout

experiments/mechanical-supervisor-role.sql is a disposable additive constraint candidate preserving the six known existing role values and adding the new one. It creates/converts no user and enables no flags/grants. It was exercised with the Mechanical fixture schema. It is NOT a generated/applied production migration; current live constraints must be rechecked and a normal exact-source migration packet generated before approval. All changed experiments remain disposable candidates, not edits to applied migrations.

Production rollout must coordinate the role constraint, staff-auth/workshop-api deployment, all Mechanical SQL changes and new web/Android assets before creating SUP003 as Mechanical Supervisor. Existing standing approval and physical/old-client acceptance gates still apply. Do not select generic Supervisor or create a live account as a workaround. Main is untouched.

## Verification

Local tests passed:32 configured Mechanical Node/PGlite/Chromium commands; actual Manager form role/department selection; actual staff-auth Manager creation/login/first-change with synthetic credentials; actual Edge non-Mechanical action denial; private SQL QC/document/signature/report paths using SUP003's new role; Mechanical-only overview/painting/final denial; separate-host current session, wrong-role/default-off, account switch, no full-state/bodyshop assets, four widths; and exact Mechanical retry retention through session privacy cleanup. Existing Supervisor fixtures remain in the regression suite. Browser/API fixtures are synthetic; no physical Android or production activation is claimed. Exact-head native PostgreSQL17/compatibility CI must be reviewed separately.
