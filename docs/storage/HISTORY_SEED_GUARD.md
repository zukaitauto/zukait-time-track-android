# Compact history: skip already-captured OLD-state seeds

Status: staged development only; no production migration, mode activation, data deletion or app publication.

The compact capture routine inserted an OLD-state checkpoint with ON CONFLICT DO NOTHING on every save. Although the row conflict prevents a duplicate stored revision, the full OLD JSON text/digest expression is evaluated for that attempted INSERT. Usually OLD was already captured as NEW by the preceding save.

The additive migration 20261112201704_workshop_history_seed_guard.sql checks the revision primary key before preparing that seed. A missing initial/resumed checkpoint is still inserted; ON CONFLICT remains for safety. New-state digest, positional array patches, periodic checkpoints, sequential-revision checks, SECURITY DEFINER/fixed search_path and execution restrictions are unchanged. Legacy mode returns before this work. No existing migration was edited.

The new isolated SQL regression uses a BEFORE INSERT probe and 12 synthetic real fixture-RPC saves to verify no repeated insertion attempt for a captured revision, old/new state reconstruction, periodic checkpoints, revision continuity and suppressed legacy archives in compact mode. Baseline negative control without the new migration fails with redundant_history_seed_attempts; optimized candidate passes all twelve history groups locally. Native PostgreSQL17 CI must independently qualify the new commit. No timing, WAL, physical Disk IO or production savings are claimed from insert-attempt counts.

Dependency: all five existing foundation/reader/array migrations, followed by this guard. It does not independently install compact history. Deployment remains subject to the existing exact-source rollout packet, verified isolated recovery and physical disk headroom. Neither a new restore nor a production backup export was performed.

Rollback source for this function is 20261105183000_workshop_compact_array_patch_capture.sql (capture function only). Restore a reviewed function definition if needed; do not drop schemas/tables, rewrite applied migrations, change history mode or revert the compatible reader blindly. Existing compact-only revisions must remain readable.
