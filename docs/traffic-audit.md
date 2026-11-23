# Workshop traffic audit and optimization

Repository: `zukaitauto/zukait-time-track-android`. Only `architecture-v2` was checked out and changed. Baseline commit: `26163d2a6f7bbcaa464ed7c2e4426ac1b31fc5d4`. Audit date: 2026-10-10 (Asia/Muscat).

Production project `pjknotnjkufadqavcmii`: read-only management metadata and source retrieval confirmed ACTIVE `workshop-api` v58. Its revision/load/live-status response contracts support these client-only changes. No production database query, staff login, application endpoint invocation, migration, deployment, history deletion, APK publication or Pages publication was performed. Main and release/version metadata were not changed.

## Caller and polling inventory

The audit searched all Android Java and app asset JavaScript/HTML for fetch, XMLHttpRequest, native HTTP, timers, revision probes, explicit sync calls and logging. There are eight asset fetch sites, across six source files. Existing transports and their consumers:

| Caller | Requests and consumers | Trigger / treatment |
| --- | --- | --- |
| `cloud_sync.js: api` | workshop-api revision, load, save, live_status; employee_time_action; time_management; V2 event commits, history, reports/search, allocators, pilot status/claim; backups | Shared transport. Revision detection stays 1000ms visible / 30000ms hidden. Explicit mutations, sync and backup remain unchanged. |
| `secure_auth.js: callAuth` | staff-auth login, session restoration, logout, password verification/change, Manager account creation/reset | User action or restoration; no repeated polling. Unchanged. |
| `receptionist_session.js: request` | staff-auth plus workshop-api Receptionist delivery list and commands | Login/restore, explicit refresh and delivery. Standalone Receptionist workspace has no repeating network poll. Unchanged. |
| `v2/features/insurance/reception.js: apiAction/call` | workshop-api Reception dashboards, lists, records and Reception commands | User navigation, mutations and 250ms search debounce; post-command forced workshop loads retained. Dashboard delegates here. Unchanged. |
| `qc_delivery.js` (two fetch sites) | workshop-api QC transitions, cash/final-invoice corrections and delivery-date corrections | Explicit command with expected QC revision and sync before/after. Unchanged. |
| `v54_improvements.js: voiceApi` | voice-api | Explicit voice input; no network timer. Unchanged. |
| `v2/features/notifications/center.js` | SPARE_PARTS report event-history pages via shared cloud transport; list hydration and notification derivation | Previously downloaded the same history twice every 5s, including hidden pages. Now downloads it once per refresh, keeps visible 5s cadence, uses hidden 30s gate and rejects overlap. |
| `v2/features/spare-parts/main_module.js` | SPARE_PARTS history hydration, Manager report and command commits through V2 transport | Existing authoritative history reducer reused, including pending-transition reconciliation. User-triggered report and mutation paths unchanged. |
| `v2/features/reports/service.js`, V2 data/history adapters | Server report/search/history pages through cloud transport, with cursor and limit safeguards | On-demand reports and shared notifications. No global caching was introduced. |
| Other explicit sync consumers | Consumables, leave history, technician workload/history, paint purchasing, Manager editing, job-card UI, QC and Reception; native pre-update sync | Explicit reconciliation calls retained. Leave history has a visible-only 30s refresh. No broad replacement of `syncNow` or forced pulls. |
| `MainActivity.java` native HTTP | Raw GitHub architecture-v2 latest-version JSON and APK downloads | Update checks/install workflow; excluded from Supabase request savings and unchanged. |

UI clock, workload, cash pulse, dashboard observer, work overview, overtime and Employee UI timers mostly update local DOM/state. They were inspected but not disabled: counting every timer as network traffic would overstate savings. Some visible leave/history views can invoke an explicit refresh; those workflows remain intact.

## Changes

1. **Revision-first focus refresh.** A device with an authoritative baseline checks revision before loading full state on focus. Cold focus still loads state. Changed revisions still force a load and authoritative live-status refresh. Local dirty data is pushed first. Explicit Sync Now, reconnect, mutation acknowledgement, rebase and permission-recovery loads remain unchanged.
2. **Duplicate revision checks.** A successful probe for the revision actually held can be reused for 700ms, so a scheduled tick and focus event arriving together need one check. In-flight checks remain guarded. Dirty/pushing state bypasses this reuse, and failed checks are never cached as successful.
3. **One polling generation.** Old async ticks cannot restart polling after stop/reinitialization. Visibility changes reset intervals immediately, preventing a resumed foreground device from retaining a previously scheduled 30s background delay. Existing independent live-status repair cadence remains 15s visible / 60s hidden; changed revisions fetch live status immediately.
4. **One complete notification history download.** Both list hydration and notifications use the same raw pages. The existing reducer preserves pending local transitions. The mixed-version fallback retains the older hydration interface. Incomplete history at the 20-page cap now retains the previous cache rather than publishing partial notifications.
5. **Bounded background notifications and overlap.** Foreground remains 5s. Hidden refresh requests are limited to once per 30s. Only one notification refresh runs at a time, and failure releases its lock.
6. **Repeated polling warnings.** Identical revision/live-status error warnings are emitted at most once per minute per source. Changed errors and failures after recovery are still logged. Health counters, banners, retries, mutation failures and audit records are untouched. Logging reduction is not claimed as Supabase egress reduction: no application telemetry uploader was found.

No server response, schema, permission, role mapping, event identity, replay policy, revision-history retention or Start/Pause/Finish authority changed.

## Identical synthetic before/after measurements

`tests/traffic-optimization.mjs` runs original source from the pinned baseline and changed client functions in Node VM sandboxes. Fetch is synthetic and cannot reach production. `tests/helpers/traffic-meter.mjs` counts UTF-8 request and response JSON bodies by action without retaining headers, credentials or payloads. It can also wrap a Node QA fetch implementation when the caller explicitly supplies an isolated QA transport.

Fixture: 1000 job cards and 1000 Spare Parts events, 500 rows per report page. Cloud scenarios have 60 scheduled revision ticks, six focus events and four live-status repair calls over 60 seconds. Notification scenarios have 12 refresh opportunities over the same 60 seconds. Payloads and event timing are identical for each before/after pair.

| Scenario | Requests before → after | Response bytes before → after | Request reduction | Response-body reduction |
| --- | ---: | ---: | ---: | ---: |
| Foreground, six focus events, unchanged revision | 76 → 70 | 1,304,326 → 3,250 | 7.89% | 99.75% |
| Foreground, same focus events, remote revision at 30s | 76 → 71 | 1,304,326 → 220,096 | 6.58% | 83.13% |
| Visible notifications, 1000 events | 48 → 24 | 4,410,264 → 2,205,132 | 50.00% | 50.00% |
| Hidden notifications, 1000 events | 48 → 4 | 4,410,264 → 367,522 | 91.67% | 91.67% |

Notification traffic pairs were executed independently with Purchaser, Manager, Supervisor, Employee and Receptionist synthetic role contexts. These exercise role-dependent refresh behavior; the standalone Receptionist page does not actually load this notification poll, so its synthetic result is not an additional production savings claim. Notification contents and hydrated row counts remain equal.

Logging scenario: 60 identical revision-check failures at one-second intervals emitted 60 warnings before and 1 after (98.33% fewer warnings). Requests/retry frequency were not reduced by suppressing warnings.

These are scenario-specific body measurements, not actual compressed network egress, a whole-fleet savings estimate or a production billing forecast. Header/TLS overhead, compression, Android update traffic and database reads/writes are excluded. Focus frequency and history size materially affect savings.

## Verification

- New runtime traffic tests: cache/content parity, changed revision loading, duplicate checks, pagination completeness, overlapping notifications, failure recovery, offline no-request behavior, cold focus, pending-data push ordering and warning recovery passed.
- Deterministic execution of the real scheduler: 60 foreground revision checks and 2 background checks per 60s; live repair 4 / 1; immediate visibility interval reset; obsolete asynchronous tick and stop races passed. This verifies configured cadence; request latency and OS/WebView suspension can extend real detection time.
- Existing `scripts/ci-full-regression.sh` test list: 141 passed; 1 blocked (`native-dialog-lifecycle.mjs`, Java compiler unavailable / child-process EPERM). The native-dialog source assertions run before its compiler step. No Java/native source was changed.
- Existing checks cover server-authoritative Employee Finish/ID001 actions, work-event validation, delayed Pause/Finish, same-Employee device races, offline replay, queue quarantine, conflict recovery, role privacy, history/pagination integrity, leave sync races, dashboard behavior, materials, paint, invoices, QC and Reception workflows. Some existing checks inspect source/SQL contracts; they are not a replacement for live multi-device or database integration tests.
- All 18 tests in `npm run test:reception` passed, including mocked API handlers and Receptionist authentication/delivery workflows. JavaScript syntax checks for both changed assets and both new test files, and `git diff --check`, passed. Production mutation tests were deliberately excluded.

Reproduce with a checkout containing the baseline commit: `npm ci --ignore-scripts --include=dev`, then `npm run test:traffic`. Set `TRAFFIC_REPORT` for JSON output. Restricted environments can set `TRAFFIC_BASELINE_DIR` to a directory containing the two baseline files at their repository-relative paths, exported using `git show BASELINE:path`. `TRAFFIC_BASELINE_REF` overrides the pinned commit for another comparison. Never point QA instrumentation at production as part of this synthetic test.

## Outstanding risks and follow-up

- Android physical-device background/resume behavior, offline→online replay across real devices, and a full APK build were not exercised locally; no Android SDK/JDK is available. The synthetic scheduler and existing regression contracts passed.
- Production v58 `live_status` still reads the full workshop snapshot and may repair the live-status table. The independent repair poll was preserved. These read-side repairs are why this audit used management metadata/source reads rather than calling live_status against production.
- Every distinct shared revision still requires a full-state download. High mutation rates can therefore remain expensive. A scoped/conditional server endpoint or combined revision/live response would require a separately approved server change and deployed compatibility testing.
- Notifications still reread complete history. One download rather than two reduces cost without risking new-event cursor gaps, missed changes or replay conflicts. Durable incremental cursors would require broader design/testing. Above 10,000 events the existing 20-page ceiling prevents complete hydration; both caches now retain their previous contents on this condition.
- Hidden notifications can be up to 30s behind. Work-status revision detection remains at its required cadence. Browser/Android suspension and request latency can exceed timer targets regardless of configured interval.
- Focus no longer reloads an identical revision just to reset incidental local rendering changes. Explicit Sync Now still forces full reconciliation. Existing local-state and dashboard tests pass; extended physical-device QA remains advisable.
- Repeated identical polling errors are less verbose in the local console; health error counts and user connection feedback remain available. No mutation/audit logging was reduced.
- Changes remain compatible with current v58 response contracts; no reliance on an undeployed API field was introduced. No V305 publication or production modification is authorized by this audit.
