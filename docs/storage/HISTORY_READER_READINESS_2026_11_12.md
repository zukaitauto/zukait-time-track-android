# History reader readiness and early Accountant measurement — 12 November 2026

Production remains workshop-api v120. No history infrastructure, capture mode, data, retention rule or app version was changed during this checkpoint.

## Early production observation

Completed log window: 2026-11-12 17:23:06–19:40:00 UTC (21:23:06–23:40 Oman), 2h16m54s, off-hours, not a working-day comparison. External workshop-api: 20 HTTP200 and 5 HTTP401; staff-auth: 5 HTTP200, 1 HTTP401 and 1 HTTP403; voice-api: 2 HTTP200. No recorded HTTP5xx. Diagnostic probes may contribute to authentication errors.

Internal REST recorded seven successful Accountant context reads and no snapshot probes: no observed overlapping-read opportunity, so production sharing savings cannot yet be established. Internal operations are not client full-download counts and are not added to external bandwidth.

At 19:41:35.109351 UTC, retained context statement queryid TEXT 6385075237045578042 had 7 calls, 3161.865926 ms execution and 8708 temporary blocks written (71,335,936 bytes at 8192 bytes/block). Mean successful-call time was 451.695132 ms. These are retained cumulative figures, not daily deltas. Target query IDs were absent from earlier checkpoints: baseline unavailable, not zero. Statement reset remained 16:30:18.022031 UTC, dealloc 0; postmaster start remained 16:30:18.117243 UTC. No restart since activation was observed. WAL, buffer reads, temporary writes, physical Disk IO and network bandwidth are different measurements.

## Storage and rollout blocker

Metadata-only allocation: database 5,363,379,347 bytes; workshop_state_history total 5,320,048,640 bytes (about 99.2%), including TOAST 5,318,156,288 bytes. Allocation includes overhead and possibly reusable space; it is not proof that this amount is live removable data. Reset tuple statistics do not establish table emptiness. No historical JSON was scanned. A narrow routine-source check found no direct DELETE FROM workshop_state_history clause; that does not rule out every external retention mechanism.

Live v120 still reads legacy history directly. Production has no zukait_history schema. Repository reader support therefore does not prove rollout compatibility. The source patch keeps legacy reads by default, with no extra missing-RPC request. Explicit ZUKAIT_HISTORY_READER_COMPAT=true opts into the compatibility reader; only missing-RPC PGRST202 falls back. Corruption, permissions and network failures propagate. Missing revisions retain the existing safe conflict behavior.

## Qualification and next steps

Local tests passed: default/opt-in reader rollout, ID001 merge/uniqueness in both modes, save-pressure regression, and all ten isolated compact SQL groups, now including the existing real-save-path fixture. These fixtures are synthetic; they do not prove current production restore readiness or measured storage savings. Native PostgreSQL CI results must be checked separately.

No production deployment is authorized by this report. A future reader deployment must patch the exact v120 bundle, preserving active Accountant sharing and priced-parts filtering; do not deploy unrelated repository changes. Infrastructure should initially remain legacy mode. Before any separately approved bounded dual observation or compact cutover, verify current backup restoration, integrity, physical headroom, permissions and rollback. Dual mode increases temporary storage/write cost. Retain existing snapshots; deletion/reclamation needs separate exact approval. Continue a representative working-day measurement before judging Accountant savings.
