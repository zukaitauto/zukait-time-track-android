# Architecture V2 Qualification Status

Verified checkpoint: `96b59c4d067cf1f7f002da600afb26759a10c963`\nQualification run: `36171003647` — SUCCESS.\n\nNewer pagination qualification commits are still awaiting a completed green workflow and are not included in this verified checkpoint.\n\n## Passed
- Existing V141 functional regression suite.
- V2 event/idempotency and offline queue tests.
- Work/ID001 rule tests.
- Reconnect, conflict, multi-device authority and read-only shadow tests.
- Conflict quarantine/replacement lifecycle with auditable supersession; conflicting events are never silently replayed.
- Production isolation: V2 authority defaults OFF and is device-pilot guarded.
- LIVE/RECENT/HISTORY bounded data-path contract.
- Job-card workflow contract.
- Spare-parts role/transition contract.
- Deduplicated exception notification rules.
- Server-paginated reporting contract.
- 2,000/10,000 bounded-read scale gate.\n- Server calendar/public-holiday and leave work-authority static qualification.\n- One-active-session-per-employee server authority gate.\n- Delayed offline replay / duplicate-event identity gate.\n- SQL migration integrity and delimiter gates.\n- Expanded regression manifest covering current V2 authority gates.
- Android release APK compilation and artifact generation.

## Production status
- `main` / V141 remains the production baseline.
- V2 authority remains OFF.
- No staff/device pilot has been activated.
- No V2 release has been published.

## Remaining before production authority
1. Complete and verify the corrected real backend pagination cursor path with production-like data validation.
2. Complete production-like multi-device conflict/reconciliation validation against the real V2 backend; static and queue lifecycle gates are present, but this does not substitute for the isolated-device pilot.
3. Real multi-device pilot using isolated test identities/devices.
4. Android durable native transport follow-up (Room + WorkManager) where required.
5. Feature-by-feature migration/parity for remaining legacy modules before removing legacy authority.
6. Signed APK qualification from explicitly approved source.
7. Controlled rollout with rollback verification.

Do not interpret a successful branch APK build as approval to enable V2 authority globally.
