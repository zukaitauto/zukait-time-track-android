# Audited classification correction for historical unclassified jobs

## Evidence

JC11992 is a delivered historical job with no `jobType`, no legacy `type`, no insurer and no Reception link. Full Edit displays Cash when that field is missing. The live database already has the audited Manager correction functions; this is not a missing Edge Function deployment. Their old-type checks only accept Cash/Credit, so the existing Insurance-creation trigger rejects this job and the frontend shows a misleading unsupported-server message.

## Fix and scope

`20261028141914_manager_unclassified_job_type_correction.sql` includes missing/null/blank old types in the existing Manager-only correction path. It preserves the actual previous JSON in the immutable audit. It does not infer or write Cash, fabricate insurer approval, allow new unapproved Insurance jobs, grant client-role access, or change job/work/hour/delivery records. An active Manager, correction reason, valid insurer, expected revision and matching same-transaction audit remain required. Arbitrary unknown types remain rejected. The existing full-edit function is changed through one checked textual substitution so unrelated live behavior and ACLs remain intact; unexpected definitions fail closed.

No Android/web runtime file changes are required. The published V375 client and frozen V376 client can use this corrected server path. JC11992 must be retried by the Manager with the intended job type, insurer and reason; this patch does not change its business classification automatically.

## Verification and deployment state

Local full-migration PostgreSQL/PGlite regression passed: Cash/direct/Reception flows, missing/null/empty/whitespace legacy fields, immutable original values, repeat save, Supervisor denial, reason/insurer checks, stale revisions, transaction-bound audit, ordinary-save/new-job rejection, no fabricated approval, client-role execute denial, preserved assignments/sessions/delivery, and disable/rollback retention. Normalize fixture SQL line endings for consistent function-hash guards on Windows and Linux.

Isolated QA migration applied. Actual PostgreSQL service-role full-edit RPC passed against a synthetic delivered job with no type, with ordinary-save denial, repeat-save idempotency, unchanged work/hours/delivery, and no insurer approval. The whole synthetic test was rolled back; final counts for synthetic credentials, jobs and classification audits are zero.

Production definitions captured before modification in the task output `JC11992-classification-functions-rollback.sql`. Three functions were SECURITY INVOKER and executable only by postgres/service_role. Production baseline Edge Function97/bundle53fb220b remains unchanged by this database-only fix.

At this commit: production patch is NOT APPLIED; source CI pending. V376 is still unapproved for staff, and its release metadata must treat this database correction as a backend change. Do not publish or reuse historical acceptance attestations to bypass the coordinated release gates. Append actual deployment evidence in the task outputs after verification.
