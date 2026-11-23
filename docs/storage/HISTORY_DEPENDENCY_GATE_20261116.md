# ZUKAIT compact-history dependency gate — 16 November 2026

**Result: SQL/Edge reader inventory PASS; production compact-history rollout remains BLOCKED.**

## Read-only production catalog verification

At **2026-11-16 05:30:36 UTC**, the read-only gate
`supabase/tests/workshop_history_dependency_preflight_readonly.sql` ran on production
project `pjknotnjkufadqavcmii`.

| Metric | Observed |
| --- | ---: |
| Direct history-referencing SQL functions | 12 |
| Expected writers with legacy archive insert | 12 |
| Missing expected writers | 0 |
| SQL functions with direct SELECT/JOIN of legacy history | 0 |
| Unexpected history functions | 0 |
| Legacy history-reading SQL views/materialized views | 0 |
| SQL catalog dependency gate | PASS |

The exact stored function names reviewed were:
`zukait_commit_workshop_state_v2`,
`zukait_mechanical_commit`,
`zukait_mechanical_deliver`,
`zukait_mechanical_section`,
`zukait_pause_at_duty_end`,
`zukait_reception_cash_base_command`,
`zukait_reception_command`,
`zukait_reception_estimate_command`,
`zukait_reception_management_base_command`,
`zukait_reception_role_base_command`,
`zukait_reception_vehicle_changed` and
`zukait_reception_vehicle_command`.

All 12 currently archive old full workshop state before updating the
authoritative `workshop_state` revision. The planned compact capture trigger
is attached to authoritative state updates, rather than replacing each writer
with a new implementation. These are catalog/text checks, not proof of
concurrent production behavior, bounded write overhead or dynamic SQL absence.

## Edge Function scan (live deployed source, read only)

All nine deployed Edge source bundles were retrieved and searched for the
literal `workshop_state_history` on 16 November. Results:

- `workshop-api` **v124**: exactly **one** direct reference in `index.ts`,
  inside `baseStateForRevision`. The active reader still queries legacy
  history. It must be replaced with the version-pinned, default-off compatible
  reader before any compact-only history can exist.
- `staff-auth` v13, `voice-api` v4,
  `pc-app` v4, `pc-app-v2` v4, `pc-app-v3` v4,
  `publish-pc-site` v6, `publish-pc-svg` v5,
  `auth-diagnostic` v5: **zero** literal references.

This literal-text scan is not an audit of arbitrary dynamic code, Android
client source or remote views outside the checked database catalogs.
Redo the inventory if deployed source changes.

## Observed production state

At 2026-11-16 05:26:44 UTC:
- Database allocated **5,922,712,723 bytes**.
- Legacy history relation allocated **5,882,667,008 bytes**.
- History rows: **16,578**; current workshop revision: **17,149**.
- Compact-history configuration table: **absent**.
- Waiting PostgreSQL locks: **0** at observation.
- Latest known workshop API version: **124**.

The PostgreSQL process had restarted on 16 November at 04:15:47 UTC.
Recent restart-window logs included temporary API and database errors; a
healthy point-in-time response is not proof of remaining I/O headroom.

## Remaining rollout gates

1. Physical free disk/WAL space and recent minimum EBS Disk I/O balance must
   be checked in Supabase Dashboard. Connected SQL/advisors do not expose this.
2. Preserve a current, coherent application recovery point and successfully
   restore it. The previous public/private encrypted-PC archives have a
   documented cross-snapshot local Vehicle-audit discrepancy, although the
   corresponding production references are consistent.
3. Verify a *current* version-pinned encrypted v124 Edge source backup and
   an executable rollback path. The operator's previous PC source backup was
   v123 and is not an exact v124 rollback.
4. Stage and verify the compatible reader, then separately approve legacy-only
   infrastructure, limited dual-mode test, and compact cutover. Do not merge
   these into one unmonitored deployment.
5. Disk reclamation and deletion of old archives require separate approval
   and successful recoverability qualification. LZ4 compression of **new**
   snapshots is already observed in production, but it does not shrink old
   allocated storage.

**Production changes made by this dependency review: NONE.**
