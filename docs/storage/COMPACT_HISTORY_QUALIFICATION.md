# Compact history qualification — 2026-11-06

Production read-only measurement at 17:15:50 UTC: database 3,658,017,939 bytes; workshop_state_history allocated relation size 3,624,894,464 bytes. Relation allocation includes indexes/TOAST and may include reusable space. Approximate table row counters are not exact counts. No compact configuration table exists in production. No historical JSON scan, production write, deletion, vacuum, or activation performed.

Nine existing SQL QA groups passed using an in-memory PGlite database and synthetic 100-job fixture via tests/compact-history-isolated.mjs. Covers shadow capture, legacy/compact readers, top-level null/deletion, corruption/gap rejection, 20-revision growth/reconstruction, positional array patches, integrated trigger capture, private RPC permissions and rollback. Fixture growth test requires compact payload bytes below half of corresponding full JSON payloads. This is synthetic payload measurement, not production disk/RAM/egress savings. PGlite qualification does not substitute native PostgreSQL 17 concurrency or current production restore rehearsal.

Next rollout work:
1. Run native PostgreSQL 17 fresh/upgrade qualification and actual save-path/rolling-reader compatibility tests.
2. Inspect live Edge Function reader version; repository code is not proof of deployment.
3. Prepare current backup/isolated restoration, validate history integrity and rollback.
4. Deploy reviewed infrastructure in legacy mode first; separately approve a bounded dual-mode observation window. Dual mode stores both forms and temporarily increases storage/write cost.
5. Compare reconstruction, latency, WAL and temp-spill counters before considering separately approved compact-mode cutover.
6. Retain existing historical snapshots. Disk reclamation/deletion is a separate operation requiring verified restore and exact approval.

No production rollout is authorized by this qualification report. No app release required for this test-only checkpoint.
