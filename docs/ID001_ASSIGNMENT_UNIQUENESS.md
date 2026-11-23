# All-staff unfinished ID001 assignment guard

Owner confirmed that one unfinished ID001 assignment per technician must apply to all staff. Read-only investigation found Jomir (EMP008) had assignments created at 09:31 and 09:39 Oman on 19 October 2026; only the latter had a running session, from 09:58. No employee records were modified by this investigation.

The shared Manager/Supervisor assignment entry point already checks local unfinished ID001 assignments. Its employee/job matching is now normalized. The missing server check is added to the authoritative full-snapshot save loop after stale-client merge and authority preservation, before commit. Every CAS retry checks the latest server state, so two devices cannot add different unfinished assignments for the same technician. Reactivating a completed assignment cannot bypass this check.

Existing duplicate assignments are intentionally not automatically cancelled: unrelated daily saves remain allowed when the old duplicate IDs are unchanged. Completed/cancelled history remains valid. An audited cancellation can reduce a duplicate set. Existing records require Manager review; this guard does not delete assignments or worked sessions, and existing one-running-session enforcement remains intact.

Newer clients show the duplicate-assignment response as a reachable-server conflict, retain the full pending snapshot and stop automatic identical retries. Unrelated financial, material and workshop edits in that snapshot are preserved. Manual review/retry uses the existing retry barrier.

The deployed workshop-api76 revision-probe optimization was concurrent with the installer investigation. Its index.ts changes are preserved in this source; no production server overwrite or schema migration is performed here. The optional revision RPC retains its missing-schema-cache fallback. QA13 matched the observed production76 baseline before this follow-up change.

Tests execute the actual Edge handler for Manager and Supervisor, cover multiple staff IDs, normalized IDs, history, existing-duplicate compatibility and a two-device CAS race. Cloud runtime tests verify conflict status, pending-data retention and no repeated failed requests. The QC route extraction test anchors its end marker after the QC block so the separate earlier revision-auth probe does not hide its actual endpoint tests.

This correction is a development candidate after V344. No production deployment or duplicate cancellation is claimed. Existing duplicates must be reviewed through the audited workflow before enforcement can leave every historic record with at most one unfinished assignment.
