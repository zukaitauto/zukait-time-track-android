# Workshop traffic reduction — staged rollout

## Production stage (deployed)

Project pjknotnjkufadqavcmii, workshop-api version 78, deployed 2026-10-19 10:07 Asia/Muscat.

- Live status selects only users, sessions, assignments and jobs from workshop_state using PostgREST JSON aliases. The existing computeLiveStatus calculation, stale-row repair, employee filtering and response fields remain unchanged.
- Preflight permissions may be cached for 600 seconds. Every POST still authenticates and authorizes normally. Authenticated JSON responses use private, no-store.
- An opt-in numeric known_revision on load returns not_modified with metadata only when the revision matches. Older clients without the field still receive the complete response. A changed revision returns the complete snapshot, including changes committed between metadata and snapshot reads.
- Preserves the previously deployed single-round-trip revision probe and schema-cache fallback (server versions 75/76). The prior server repair was not yet committed in this branch; this PR reconciles its deployed source. Its existing production migration is workshop_single_round_trip_revision_probe; the SQL record in deployed-revision-probe.sql documents it and is not a new migration request.
- No schema/data/role changes were made during this traffic rollout. No Start/Pause/Finish, assignment, save, offline queue, rebase, financial or audit logic was changed.

Production read-only measurement: full JSON snapshot 2,056,221 bytes; four live-status input fields 650,260 bytes (68.38% smaller). This describes uncompressed database-to-function payloads for one snapshot, not a forecast of total egress charges. Live input sizes and call rates change over time.

Gateway checks showed existing gzip compression even on the old small error responses. Extra application compression was briefly evaluated in v77 and removed in v78 to avoid redundant CPU. No compression savings are claimed by this rollout.

## Client stage (prepared, not published)

cloud_sync.js includes known_revision only when an in-memory server-confirmed baseline exists. A saved revision number alone cannot skip a cold-start download. A valid unchanged response reapplies that confirmed baseline using the existing reconciliation/render path.

The existing dirty-generation and revision checks reject responses that raced with a local edit or a newer acknowledgement. Dirty edits remain queued. Explicit sync ordering and polling intervals remain unchanged. A new client accepts the complete response from an old server, so rollback/mixed-version use remains supported.

Keep phone and web publication coordinated through the repository's existing signed release process. This PR does not change release-request.json, app version metadata, release approvals or acceptance evidence, and does not publish an APK or Pages.

## Validation

Run from the repository root with Node 24:

```sh
node tests/live-projection-traffic.mjs
node --experimental-vm-modules tests/sync-traffic-compatibility.mjs
node tests/leave-sync-race.mjs
node tests/cloud-dashboard-stability.mjs
node tests/cloud-permission-retry-barrier.mjs
node tests/cloud-save-permission-rejection.mjs
node tests/leave-sync-authority.mjs
node tests/employee-finish-server-authority.mjs
```

All eight passed locally. Tests cover live-status parity (Working, Paused, ID001, Overtime, Available), completed/cancelled assignments, empty/null arrays, stale-row repairs, old/new protocol combinations, cold starts, invalid baselines, in-flight edits/acknowledgements, revoked/invalid session responses, restricted-role rejection, leave preservation and permission-retry barriers.

Synthetic conditional response: 320,399-byte full snapshot versus 84-byte unchanged response. This is JSON-body size for a fixture, excluding gateway compression, headers and billing effects.

Physical Android/multi-device acceptance and a new signed APK build were not performed. Those remain part of the coordinated client release. No financial or workshop test writes were made in production.

## Rollback

The client change can be reverted independently; the server remains compatible with older clients. The conditional server branch can remain deployed unused without affecting them.

The pre-traffic v76 complete deployed function bundle was captured in the task workspace before deployment. Re-deploying it restores the previous server behavior while retaining the earlier connection repair. Do not roll back to repository baseline v74: that would discard the already deployed heartbeat repair.

Do not clear app storage or reset workshop data during rollout or rollback. Measure real egress and request volume over comparable operating windows before deciding whether broader delta/event sync or Realtime would be worthwhile.

