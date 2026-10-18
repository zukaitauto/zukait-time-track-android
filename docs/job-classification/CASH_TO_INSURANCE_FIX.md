# Manager correction of mistaken Cash/Credit job classification

Development branch only: architecture-v2. No main changes.

## Confirmed cause

Production PostgreSQL logged `insurance_job_requires_approved_reception` on 18 October 2026 at 10:31 Oman time. JC 12029 is saved as Cash and has neither a linked Reception row nor a direct insurance approval. Full Edit was trying to correct it to Insurance; the creation guard treated that as an unapproved new insurance job. No production record was edited during investigation.

## Targeted database fix

Migration `20261018073000_manager_job_classification_correction.sql` permits only the Manager Full Edit transaction to reclassify an existing Cash/Credit job. It verifies the active Manager, reason, insurer, expected revision and original job. A dedicated immutable audit stores old/new data, Manager, timestamp, reason, revision and transaction identity. Guard authorization is bound to that transaction, job, old data and new identity. It does not create an insurer approval, LPO, receipt, new job card or payment.

Legacy jobs, direct jobs and Reception-linked jobs are covered. Existing Reception-linked jobs receive a classification provenance reference and their insurance approval status becomes WAITING. A foreign key and audit-validating constraint distinguish this correction from external insurer approval. New insurance jobs still require the established creation approvals. Ordinary save APIs cannot use a previous correction to introduce new insurance jobs or convert other jobs. Direct identity and linked identity remain authoritative. Stale calls return conflict without a new classification audit.

The app improvement explains the correction and maps the creation-guard error; it can ship with a later approved application release. The live save failure can be fixed by the targeted database migration alone, without deploying the pending Accountant functions/UI or changing main.

## Validation actually executed

- Actual PostgreSQL (isolated PGlite) legacy/direct/linked corrections, immutable audit, no fabricated insurer approval, Manager-only/reason/insurer checks, stale revision, retry, ordinary-save/new-job rejection.
- Existing full management SQL migration/integration suite passed.
- Manager Full Edit, Reception job editing and linked identity/movement tests passed.
- Migration applied to QA omqgkqknbdcnotabffek only.
- Actual QA PostgreSQL synthetic legacy conversion and audit verified inside an explicitly rolled-back transaction. All fixture changes rolled back.

## Production release boundary

NOT DEPLOYED to production pjknotnjkufadqavcmii. Owner approval is required by the user's mandatory safety rule 7 before applying any production schema change. Scope proposed for approval: this migration only. No existing job-card values are mass-updated; JC 12029 remains Cash until Manager saves their reviewed correction. No production app publication, Accountant migration/deployment or main change is included.

Migration is transactional: a deployment error rolls back all DDL. Pre-change function definitions have been captured read-only for rollback preparation. If the feature must be disabled after use, restore the prior three functions while RETAINING the immutable audit, provenance column/FK and linked constraint so already-corrected jobs and history stay valid. Do not delete audit or correction records. After deployment verify grants/RLS/functions read-only, then the owner can save the actual correction through Full Edit with their Manager identity. Do not perform synthetic financial writes against production.
