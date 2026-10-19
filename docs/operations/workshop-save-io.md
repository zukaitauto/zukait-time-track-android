# Workshop save Disk IO safeguard

Applied to project pjknotnjkufadqavcmii on 2026-10-19 via migration 20261019153149_workshop_identical_save_io_guard.

## Behavior
The existing row lock and expected-revision conflict check run first. If incoming JSONB is identical to stored JSONB (including all audit fields), the function keeps the current revision and skips both the full-state UPDATE and the snapshot INSERT. It still reconciles live status, including overtime and membership. An unchanged live row is not rewritten merely to advance its timestamp. Actual state changes continue through the original history, revision and trigger path.

Function signature, invoker privileges, search_path, grants, RLS, role validation, conflict payloads and caller response shape are unchanged. Deployed workshop-api v78 consumes the returned revision; the existing client uses server_revision. No client release or Edge Function deployment is needed.

## Validation
- Synthetic temporary tables and a pg_temp copy of the candidate function, inside BEGIN/ROLLBACK: identical save, repeat save, live tuple identity, stale CAS, real edit/history, session/leave/audit preservation, live-only overtime, live membership, missing row.
- Deployed-function smoke test inside BEGIN/ROLLBACK: exact current state returns current revision with unchanged state tuple; stale revision still conflicts. No test changes committed to workshop records.
- pg_get_functiondef readback matches candidate exactly.
- Security/performance advisors: informational existing findings only; no security-definer or grant changes.
- Rollback SQL is preserved under docs/operations/rollback-workshop-save-io.sql. Run it as an explicit migration only if reverting this change; it restores old write behavior without deleting records.

## Impact and limits
This removes unnecessary writes when the entire submitted state is equal. It does not remove history, suppress actual audit changes, or eliminate full-state writes for real edits. The actual reduction depends on how many incoming saves are identical. No daily Disk IO budget percentage is available through the connector; host IOPS/budget must be monitored in Supabase Infrastructure after deployment.

Historical diagnostics found workshop_state_history about 1.65 GB of a 1.68 GB database. Recorded full-state commit calls generated about 3.74 GB WAL of 4.03 GB total statement WAL since 2026-09-20. These are cumulative, not daily rates. Some largest historical reads were exports/diagnostic scans; future investigations should avoid broad scans of historical JSON bodies during working hours.

## Data retention
No data was deleted. workshop_state_history supplies exact base revisions for older/offline clients' three-way rebase and is a recovery source. Age alone does not establish that a snapshot is disposable. Before retention is enabled, prepare an encrypted archive, verify recovery and archived-base lookup, define supported offline age, and preserve audit/recovery requirements. Avoid VACUUM FULL or large exports on the live database during workshop hours. Record-level workshop history, sessions, leave/audits, financial records and credentials are not cleanup candidates for this fix.
