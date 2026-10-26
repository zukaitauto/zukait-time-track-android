# V375 Mechanical integration candidate — 26 October 2026

Owner authorized remaining Mechanical qualification in the current chat. The latest clarification supersedes the earlier mixed-QC reply: **Mechanical and bodyshop use separate job cards; mixed cards are not supported.** Jibin/SUP003 retains Mechanical-only QC. Existing bodyshop SUP002 painting/SUP001 final checks remain unchanged.

Baseline is published V374 plus architecture-v2 test maintenance at485f889e5f858231ec6589dce580d895ef567875. Draft development source200c8362d1159e14b7e292b10d987b4c574357c3 is reconciled into an isolated architecture-v2 checkout. The invoice/QC conflict retains the V374 invoice draft ownership/version guards and adds only the Mechanical overview initialization. Existing Cash/Insurance, direct arrival, account privacy and historical-time fixes are retained.

The original Windows master specification, execution prompt and foundation contract are now available to this workspace. They are planning references; later direct owner decisions (description-only Mechanical checklists, distinct Mechanical Supervisor role and separate cards) supersede earlier proposals. This integration does not represent completion of the wider Accountant/payroll phases. Their inherited draft extensions remain independently disabled and install no Accountant schema.

## Separation and identity protection

Mechanical registration rejects a card with active bodyshop or unknown-department assignments. SQL independently checks staff departments. Registered MC identity cannot disappear or silently follow a renamed JC in an old/full-state save. The database guard rejects cross-department assignments even before delivery and remains installed when command/UI flags are rolled back. It does not move work, rename historical records or delete data. Manager correction of a registered JC requires a separately designed audited rebinding operation; the ordinary rename must fail closed.

Mixed-card QC/readiness/delivery is rejected regardless of the old nullable mixed-policy setting, including true/false settings and forged route requests. Owner policy is not a new permission bypass. Ordinary bodyshop jobs retain their existing QC sequence and authorities.

Production preflight on26 October: Mechanical schema absent, both candidate migrations unapplied and SUP003 absent. Consequently the unapplied inactive foundation bundle is updated together with its13 source segments; no applied migration is edited. All new tables remain private/RLS; schema, role, command/UI/PDF/signature/report/delivery flags and capabilities remain inactive until a separately approved deployment.

## Verified locally

-34 contract/UI commands passed against the combined source.
- PGlite existing-data upgrade/persistence suite passed.
- Actual PostgreSQL17.6.1.166 isolated loopback existing-data upgrade, atomicity, concurrency/revocation, append-only/ACL and old-client authority tests passed, including separate-card and registered-JC rejection without state/history changes.
- Normal standard candidate/publication denial tests passed; V375/code338 remains unapproved. Public updater stays V374/code337 and its physically tested APK.

Native fresh-install also passed using the same PostgreSQL17.6.1.166 disposable environment. Exact-commit GitHub browser/native compatibility, physical Android touch/background/process/network/share/print, QA activation and coordinated deployment qualification must be recorded separately. A passing local test does not claim physical or production acceptance.

No production migration, deployment, account creation or business-data write was performed by this integration. No existing release approval is reused. Native test databases contain synthetic records only and are deleted by the runner; the temporary container is removed after qualification.
