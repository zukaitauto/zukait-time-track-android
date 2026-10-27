# Connection outage: 27 October 2026

Status: source candidate prepared for architecture-v2 publication; production deployment remains blocked by missing acceptance evidence. Original base 3a37257627b5ec409140503d8c722aff95cb800f; refreshed onto 8115c4c6c33a6a76538bf8b204a2966cf28d9445 without overwriting newer Mechanical changes. No production data, sessions, functions, configuration or migration history changed.

## Production evidence

Project pjknotnjkufadqavcmii reports ACTIVE_HEALTHY and is named zukait-time-track-test despite serving the reported production clients. Do not choose environments by that name alone. Region ap-south-1; workshop-api version 94.

Read-only logs queried during investigation:

| Evidence | UTC | Oman (UTC+4) |
| --- | --- | --- |
| Cloudflare 521 HTML returned upstream, Ray a50fe4177e82ff7b | 07:12:14 | 11:12:14 |
| Cloudflare 525 HTML returned upstream, Ray a50fe5fe2c904713 | 07:13:29 | 11:13:29 |
| Latest sampled database statement timeout | 07:13:02.394 | 11:13:02.394 |
| Latest sampled workshop-api 503 | 07:13:03.739 | 11:13:03.739 |
| Successful workshop-api POST still observed | 07:38:32.342 | 11:38:32.342 |

For the requested 07:00–07:40 UTC log window, results available at query time: POST 200=799, 503=19, 500=1, 403=5. This excludes OPTIONS. HTTP 200 alone does not establish successful employee starts or all-device recovery. Earlier full 24-hour counts included OPTIONS and must not be interpreted as successful mutations.

521 means origin connection refused/unavailable; 525 means TLS negotiation between Cloudflare and origin failed. These HTML documents name pjknotnjkufadqavcmii.supabase.co and were logged inside workshop-api. This establishes an upstream Supabase origin/ingress failure path, rather than merely a phone connectivity error. The precise origin/certificate/network cause is not available through the connected management tools. Do not disable TLS verification, reset phones, restart production or change hosting resources on this evidence alone.

Separate PostgreSQL statement timeouts also occurred. No blocked database sessions were observed in a later snapshot. Performance advisors reported informational missing foreign-key indexes (29), unused indexes (26), and Auth connection allocation guidance (1). Security advisors reported only informational RLS-enabled-without-policy findings (44); service-role-only access can intentionally have no client policy. These findings do not establish the outage cause and no speculative schema changes were made.

## JC12098 reconciliation

Read authoritative workshop_state, not only workshop_v2_work_sessions. At the sampled workshop revision 15069, the main JSON snapshot had five historical sessions for internal job 12098; all had end timestamps. The v2 session table had no matching rows. The job-created v2 event exists; that table is not the complete legacy work ledger.

Confirmed audit for EMP001: START d7d4c5e1-9b58-4432-85dc-e6623bcdc520, followed by PAUSE 0768f0b4-1c71-4ba7-ae2c-d76df71be8b6. Its session is dbd9a193-4aa9-4a35-b13d-5a0b7b41da33. Historical EMP009 sessions were also ended. No start was replayed and no historical row was altered during investigation.

This snapshot cannot identify an unsent/in-memory command on an existing employee phone. Existing versions did not persist employee command IDs. Do not manufacture a replacement JC12098 start, clear phone storage or delete receipts. Reconcile the original device command ID against employeeTimeActionAudit and its session before any manual resolution. If its original ID cannot be recovered, stop automated replay and require an operator to reconcile authoritative work history. New client code cannot retroactively recover a lost ID.

## Implemented fixes

- Database transport turns upstream HTTP 429/5xx (including Cloudflare HTML 521/525) into sanitized PostgREST-compatible PGRST003/503, already handled as database_busy by the edge handler. The 10-second deadline and one-send behavior are retained. No write retries, session bypass or SQL changes.
- Employee START/PAUSE/FINISH/ID001 STOP commands are written to an employee-scoped journal before sending. Retry preserves action ID, new session ID, device ID and original client timestamp through reload. Only a matching confirmed receipt removes the journal. Different work controls cannot silently replace an unresolved command. Corrupt/full storage blocks sending. Account switches cannot consume another employee's command.
- Privacy cleanup retains these journals and their stable device identifier while continuing to clear renderable workshop caches. Fail-closed authentication remains intact. No background replay was added.
- Added architecture-v2-only CI for outage, identity, deadline and authority regressions; no deployment steps.

Conservative recovery tradeoff: an unresolved or permanently rejected journal is kept rather than silently discarded. If the original control cannot reconcile it, an operator must inspect the command and authoritative audit; do not clear all app data to unblock it. Multi-tab/browser storage is not a distributed lock; existing server CAS and one-active-session authority remain essential.

## Validation

Eleven targeted suites passed locally: connection-outage-safety, sync-request-deadlines, cloud-sync-recovery, secure-session-restore, account-session-isolation, employee-finish-server-authority, id001-server-stop, cloud-permission-retry-barrier, employee-running-session-authority, v2-one-active-session-authority, v2-same-employee-device-race. JavaScript syntax checks passed. The ID001 harness now supplies real storage and a matching confirmed receipt instead of an incomplete ok-only response.

New executable tests cover HTML upstream errors without replay; preserved 200/401/403/409 responses; lost-acknowledgment reloads; unchanged retry identity; different-job/action blocking; corrupt/full storage; account scoping; journal retention; and the actual TypeScript server transition returning the original START receipt after a subsequent PAUSE without creating a second session. Existing deadline tests cover late commits, stalled bodies, caller cancellation and client/server deadline coordination. No tests wrote production records.

## Release gates — all must pass

1. Keep branch architecture-v2. Do not merge to or deploy from main. Run new CI and existing required branch checks against the exact candidate revision.
2. Retrieve the CURRENT complete deployed edge bundle again. Version 94 index.ts differs from repository index.ts, including repository-only extensions. The deployed database_fetch.js matched the pre-change repository helper. For this backend fix, stage only the helper change against the complete production bundle; do not deploy repository index.ts over production. Compare every bundle file and record hashes. Repeat if deployment version changed.
3. In an isolated QA project with representative schema, verify the full edge response is retryable database_busy/503 for injected upstream 521/525 and timeout errors. Verify valid/invalid session handling, role restrictions, CAS and unchanged successful responses. Local helper/transition tests do not substitute for an isolated full-edge smoke test.
4. Test the coordinated web and Android candidate with real WebView/browser: Start commit with dropped response; privacy lock and reconnect/reload; same command receipt after recovery; no duplicate work or timestamps; ID001 stop; account switch; storage failure. Confirm original uncertain device journals survive every login/reload/cleanup path. Verify old clients cannot erase the new journal during mixed-version rollout.
5. Test concurrent tabs/devices, multiple employee actions during outage, terminal rejection recovery and the audit-retention boundary (the server keeps the most recent 5000 time-action audits). Do not replay a command beyond retained receipt history without reconciliation.
6. Obtain origin/ingress and TLS stability evidence from Supabase support. Investigate associated PostgreSQL statement timeouts separately. The support owner should correlate the two Ray IDs, UTC times, project and ap-south-1 origin logs, certificate/SNI chain, ingress availability and database timeout/lock pressure. No support request was sent by this task.
7. Use the existing approved, coordinated publication flow only after isolated evidence and signed Android/web artifacts match. Leave release approval metadata unchanged until verification is complete. Record rollback bundles; rollback must retain pending journals and never roll back live data or erase idempotency history.
8. After authorized release, verify authenticated reads and acknowledged employee work with controlled QA identities, then review errors/latency and original command receipts before declaring recovery. No blanket all-device recovery claim from health status or HTTP 200 counts.

External blocker: Supabase owns the managed supabase.co origin/ingress and TLS path. The available tools can read logs and project state but cannot inspect or repair its origin certificate, load balancer, firewall or host. Escalation needs the exact evidence above, not a request to alter a separate website's certificate.

References: https://developers.cloudflare.com/support/troubleshooting/http-status-codes/cloudflare-5xx-errors/error-521/ ; https://developers.cloudflare.com/support/troubleshooting/http-status-codes/cloudflare-5xx-errors/error-525/ ; https://supabase.com/docs/guides/functions/error-handling
