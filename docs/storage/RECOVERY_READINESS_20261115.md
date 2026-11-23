# ZUKAIT recovery-readiness checkpoint — 15 November 2026

Status: **local data recovery passed; full application recovery still unverified; no production history optimization authorized.**

## Verified from the Windows operator's local PowerShell output

- Core archive at `Z:\Zukait-20261025\ZUKAIT-CORE-20261114-110718\workshop-core.dump` was read and restored to an isolated PostgreSQL 17 local instance.
- History chunks at `Z:\Zukait-20261025\ZUKAIT-HISTORY-CHUNKED` passed archive and server count checks: 596 chunks, 16,410 records, export cutoff revision 16980.
- Local restore to `zukait_restore_rehearsal_20261114` on loopback port 55433 passed final history count and revision checks, printed `LOCAL DATA RECOVERY PASSED - 16410 history records restored and checked`.
- Restore report at `Z:\Zukait-20261025\ZUKAIT-LOCAL-RESTORE-REHEARSAL\RESTORE-PASSED.json`.
- The local rehearsal deliberately omitted archived public triggers that depend on non-public application schemas. The backup itself was not rewritten. This validates a limited **data recovery** path, not an executable complete workshop backend.

## Dependency demonstrated by actual restore failure

Original public-only core dump could not restore a public trigger:

```sql
CREATE TRIGGER mechanical_assignment_authority
BEFORE UPDATE OF data ON public.workshop_state
FOR EACH ROW EXECUTE FUNCTION zukait_mechanical.protect_assignment_authority();
```

The private `zukait_mechanical` schema is defined and used by mechanical development migrations, including `supabase/migrations/20261025073818_mechanical_department_inactive_foundation.sql` and subsequent `20261029060242_mechanical_scoped_sections.sql`, `20261031120000_mechanical_inspection_secure.sql`. It defines private tables and functions. Their production data may be required to recover Mechanical workflows, and they were not in the public-only core dump.

`zukait_history` appears in *repository migrations*, but its *live production installation is not established by this checkpoint*. Never infer a migration is deployed just because its source exists.

## Live production access checked during this review

- Supabase Management Project API returned `ACTIVE_HEALTHY` and no health advisor lints.
- Four read-only catalog SQL requests over the Management API **timed out** (connection terminated due to connection timeout). No results or live schema inventory were obtained.
- A project `ACTIVE_HEALTHY` status and an empty health-lint result do not prove that Postgres is accepting SQL promptly or that the workshop application is healthy.
- In response to timeouts, **stop further database scans and exports** until availability and remaining disk/IO headroom can be confirmed without risking active workshop users. Do not restart the project without explicit operational decision.

## Current safety constraints

1. Preserve original core dump, all 596 compressed chunks, manifest, and sidecar hashes. Preserve local restore DB and audit evidence.
2. Keep production `workshop_state_history` intact. No deletion, purge, vacuum full, rewrite, history compaction activation, or backfill. No production DDL/Edge changes in this recovery checkpoint.
3. Backups were captured at *different moments*, not a single transaction-consistent recovery point; use revision reconciliation and application checks before calling them a complete recovery point.
4. Backup scope excludes at least non-public application schemas, parts of Supabase-managed Auth/Storage, Storage *object bytes*, Edge functions/secrets and deployment configuration.
5. PostgreSQL's official `pg_dump -n` documentation warns that schema-only selection does not automatically include dependencies from unselected schemas. A private-schema backup must be separately verified and restored against the public core.

## Next gates (in order)

1. **Offline gap audit:** Run `scripts/audit-zukait-restore-gaps-local.ps1` on Windows against the encrypted Z: drive. It lists original archive triggers and text-level private namespace references without connecting to either database; save `RECOVERY-GAPS-20261115.json`.
2. **Healthy production metadata inventory:** only once workshop responsiveness and disk/IO headroom are confirmed, collect *catalog-only* lists of schemas, tables, triggers, routines, approximate allocated size, and external dependencies. Do not scan `workshop_state_history.data` or bulk-export the 5+GB table again.
3. **Bounded read-only backup of uncovered custom application schemas and their data:** one agreed schema at a time, using a low-impact plan with validation and verified hashes; preserve privileges, sequences and dependencies. Do not treat Supabase-managed schemas as ordinary application-owned exports.
4. **Second isolated restore on a fresh local DB:** restore missing private schemas/functions/data and re-enable normal public triggers; test permissions and representative Mechanical, Reception, Manager and history reads. Reconcile point-in-time differences.
5. **Separate account/Storage objects/Edge/config inventory and recovery:** ensure a new Supabase project could be rebuilt with proper roles, policies, secrets and Storage bytes.
6. **Only after all controls pass**: verify physical free disk and IO credits/remaining headroom. Seek explicit approval for limited LEGACY-only infrastructure rollout, reader compatibility, bounded DUAL observation, then potential COMPACT mode cutover. No deletion of old snapshots.

No full recovery or production optimization success is claimed by this checkpoint.
