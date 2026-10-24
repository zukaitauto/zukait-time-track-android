# Android account switching and offline disclosure investigation

Status: QA candidate; production publication is not authorized.
Source inspected: `architecture-v2` commit `0d0917bb3338a84b8508fb856c85382b862c7222` (V373 metadata). No `main` changes.

## Confirmed causes in source

1. `app/src/main/assets/secure_auth.js` (original lines 145–161): login saved the new token, exposed the app and called `render()` before `zukaitCloud.init(true)` finished. The first render therefore consumed the previous account's shared in-memory `state`. A later cloud response/render or fresh process explained the delayed correction.
2. The same file's original `restoreSession()` (lines 275–314) explicitly called `openApp(saved.user)` and rendered cached workshop state when offline. Its exception handler also trusted cached identity after verification failed. This was intended offline behavior in code, not proof of a current server session.
3. Original `logout()` (lines 164–176) waited for a network revocation before clearing the local token and hiding the app. It left workshop state, local snapshots, revision/dirty/conflict markers and module closures alive.
4. `cloud_sync.js` original `stop()` (lines 1099–1106) only cleared timers. In-flight load, save, report and live-status requests could still complete and apply data. Revision/baseline/read caches were shared across accounts.
5. `offline_test.html` originally loaded `zukait_offline_demo_v28_final` at startup and fell back to demo data. Its state and cloud queue/revision keys were unscoped. The V2 event queue was also shared.
6. `MainActivity.java` (original lines 127–135, 239–240) enables DOM/database storage and loads the bundled asset using `WebViewAssetLoader`. `LOAD_NO_CACHE` and `clearCache(true)` address web resource cache; they do not make the bundled app require internet or erase its localStorage.

## Candidate changes

- Empty workshop state at cold start; no persisted/demo workshop snapshot is loaded before authentication.
- Verify server identity and matching `load` identity/role, await a fresh snapshot, then render the dashboard. Failed/offline verification stays covered.
- Synchronous local session invalidation before best-effort remote revocation. Clear user UI, state, sync baselines, live/report caches, dirty/conflict markers and shared V2 queue. Reload the document after cleanup to destroy module closures and detached views.
- Abort tracked requests and reject late response bodies using document generation and session identity; add cloud generation checks so rejected saves do not recreate dirty/retry state.
- Shared privacy cover for the main, Receptionist and Accountant pages, including offline events, failed workshop transport, account-storage changes and restored browser pages. Reconnect reloads and verifies again. Block server mutations while verification is pending and all requests/queue creation offline.
- Clear app localStorage caches, sessionStorage, Cache Storage, service workers and enumerated IndexedDB databases. Retain device identifiers and existing author-scoped idempotency journals for uncertain financial/delivery/reception operations, so an uncertain server commit is not silently duplicated. Promise Date journals now include actor ID rather than role alone. Legacy role-only Promise Date keys are not read by the new path.
- Android logout clears cookies, WebView cache/history/forms, notifications, pending export bytes and disposable report/VIN/voice files; secure-token deletion uses a synchronous preference commit. Cleanup errors keep the privacy cover up. Outdated WebViews without IndexedDB enumeration require an update before cleanup completes.
- No backend, SQL, server-record deletion, release metadata, APK version, production deployment or publication-gate changes.

## Validation

- New `tests/account-session-isolation.mjs`: slow login, Supervisor-to-Manager switch, logout during login, offline cold start, unreachable verification, wrong server identity, failed load, delayed old load/save/live-status bodies, immediate local logout despite hung revocation, offline command/queue blocking and scoped-journal retention passed.
- All 61 JavaScript checks in `ci-validate-js.sh` passed.
- The 184-command existing regression list was executed locally. 179 passed initially; two extracted-function fixtures were updated for the new generation state and then passed. Two SQL tests passed after normalizing Windows CRLF working-copy SQL to the repository's LF input (the guard compares function text). SQL files were restored unchanged afterward. Effective result: 183 passing commands; one native dialog test could not run because this workstation cannot launch `javac`. No test or acceptance gate was disabled.
- Focused session, cloud permission/retry, role UI and Accountant/Receptionist recovery tests were rerun after changes and passed.
- Android compilation and actual WebView/cookie/filesystem behavior require the existing Android CI and physical-device QA. No claim of device acceptance or production verification is made.

## Remaining security finding

`supabase/functions/workshop-api/index.ts` original lines 1429–1442 returns the shared workshop `data` for the general `load` action without projecting fields/rows for Employee/Purchaser. Receptionist/Accountant have separate restricted paths. Client-side hiding is not server-side authorization. This candidate fixes account/session isolation; it does not certify least-privilege reads. A backend projection change needs its own permissions matrix and isolated integration/merge/save compatibility tests, under the major-change release policy.

## Required QA and owner actions

1. Wait for the existing Android build and QA workflows on the exact candidate commit. Preserve every release gate.
2. On authorized QA accounts and isolated workshop data: Supervisor → logout → Manager and reverse; repeat with slow responses, airplane mode at every stage, process death/relaunch, Back navigation, open modals/reports, password change, revoked/expired sessions and real connection loss while Android still reports network available.
3. Verify Start/Pause/Finish/ID001, assignment, financial and delivery operations produce no offline success or new offline queue; recover uncertain previously submitted operations using their original account's journal.
4. Inspect actual WebView localStorage/IndexedDB/cookies and app-private report/VIN/voice files after logout; verify another account sees no prior UI or records. Verify native cleanup completion before login and test unsupported/failed cleanup.
5. Remote logout is best effort and cannot revoke a server session without connectivity. Use the existing authorized session-revocation process if an old session must be invalidated immediately. Do not clear device data while uncertain financial/delivery journals need reconciliation.
6. Resolve the shared-load least-privilege finding before calling the application fully security-hardened. Production release still requires explicit version-specific owner approval and normal signed acceptance/provenance checks. This source candidate does not change installed staff apps.
