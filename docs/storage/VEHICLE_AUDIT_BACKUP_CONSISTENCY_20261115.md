# ZUKAIT Vehicle audit backup consistency — 15 November 2026

**Status: live referential integrity verified. The incomplete cross-snapshot FK is isolated to a local restore rehearsal. No production repair needed.**

## Evidence

A small, read-only query against the current production project `pjknotnjkufadqavcmii` checked the **6** records in `zukait_vehicle.direct_job_customer_role_audit` using indexed references to `public.workshop_reception_commands`. The result was:

| Scope | Audit records | Parent requests present | Parent requests absent | FK status |
| --- | ---: | ---: | ---: | --- |
| Live production | 6 | 6 | **0** | `direct_job_customer_role_audit_request_id_fkey` is **validated** |
| Local recovery clone | 6 | 3 | **3** | Same FK was recreated locally as `NOT VALID`, preserving all audit rows |

The local recovery used the **14 November public core archive** and **15 November Mechanical/Vehicle private-schema archive**. These files were captured at different times and do not share one PostgreSQL MVCC snapshot. Three foreign-key parent commands already existed in production by the later export, but are absent from the earlier public core archive. Live query results show that the current parent records exist; they do **not** prove the exact insertion timestamps or that these specific records were added during the interval.

### Verified production query (read-only)

```sql
WITH audit_rows AS MATERIALIZED (
  SELECT request_id
  FROM zukait_vehicle.direct_job_customer_role_audit
), audit_check AS (
  SELECT
    count(*) AS audit_count,
    count(*) FILTER (
      WHERE EXISTS (
        SELECT 1
        FROM public.workshop_reception_commands c
        WHERE c.request_id = a.request_id
      )
    ) AS resolved_refs,
    count(*) FILTER (
      WHERE NOT EXISTS (
        SELECT 1
        FROM public.workshop_reception_commands c
        WHERE c.request_id = a.request_id
      )
    ) AS missing_refs
  FROM audit_rows a
)
SELECT
  a.audit_count,
  a.resolved_refs,
  a.missing_refs,
  k.conname AS constraint_name,
  k.convalidated AS constraint_validated
FROM audit_check a
LEFT JOIN pg_constraint k
  ON k.conrelid =
    'zukait_vehicle.direct_job_customer_role_audit'::regclass
 AND k.contype = 'f'
 AND k.conname = 'direct_job_customer_role_audit_request_id_fkey';
```

Result: `6 | 6 | 0 | direct_job_customer_role_audit_request_id_fkey | true`.

## Root cause and safety boundary

The application migration `supabase/migrations/20261107115251_direct_job_visit_customer_role.sql` explicitly defines the Vehicle audit table's `request_id` as a FK to the public reception commands table. The archive restore failed when PostgreSQL attempted to validate this legitimate FK against the older, incomplete parent table. The local-only rehearsal intentionally skipped creation of this one constraint during import, then recreated it `NOT VALID`. All six audit rows were preserved, and the other local restored schema/trigger checks passed.

**Never** remove the FK from production, delete audit rows, fabricate parent commands, or mark the local clone's FK `VALID` while its three parents are missing. A local `NOT VALID` FK is acceptable as a clearly flagged *test limitation*, not production design.

## Coherent recovery-point design (future; NOT executed)

1. **Wait for proven disk capacity, EBS I/O burst headroom, normal workshop performance and explicit approval.** Existing backups on encrypted Z: stay untouched. No new full-history scan merely to resolve three cross-snapshot references.
2. A new controlled export of the **public core and private ZUKAIT application schemas together** can capture their data under **one** normal `pg_dump` snapshot, rather than exporting private and public tables on separate dates. Select exactly the intended application-owned namespaces; exclude Supabase-managed internals. Any exclusion of the large legacy history *data* must be explicit and documented and means the result is not yet a complete recovery point.
3. **History consistency needs a separate design**: the original history export used many revision-scoped independent statements. A cutoff revision alone does not automatically prove transaction consistency with a later core snapshot. A truly coherent history capture may require a coordinated PostgreSQL snapshot or an independently proved reconciliation method, with strict limits on duration, database workload and IO. Do not hold a long-lived production snapshot or start a 5+ GB export without a safe window and resource evidence.
4. Restore the coherent export into a **new isolated local database** (never overwrite the two successful local test databases). Verify all Mechanical/Vehicle table counts, 31 public triggers, applicable RLS policies, routine permissions, history revision integrity and parent references. Run representative Reception, Mechanical, Manager and login workflows with test-only clients.
5. Keep version-pinned recovery copies of all **nine** deployed Edge Functions and the **seven** public Storage objects, already exported to encrypted Z: with hash reports. Runtime secrets, hosted configuration, and actual service redeployment remain a separate recovery gate.

## Current production decision

- **Production data is consistent on this specific relationship**: all six audit references resolve and the FK is validated.
- **Local clone remains intentionally incomplete**: three missing parent rows due to non-coincident backups, documented without silently masking or deleting audit data.
- **Do not** activate DUAL/COMPACT history, delete legacy snapshots, rewrite history storage, restart the database, or alter live application objects as part of this check.
- The remaining independent blocker is **physical disk space and EBS Disk I/O balance**, which are not exposed by the currently connected SQL/catalog tools. Check Supabase Dashboard Infrastructure/Database Settings and Observability Database Reports.
