# Mechanical qualification and remaining acceptance

This is a draft qualification record for PR49 against `architecture-v2`. It is not deployment, account-creation or pilot approval. All Mechanical settings and client/server flags remain disabled. Fixture identities and data are synthetic. Existing tests execute against disposable PGlite or loopback PostgreSQL17, never the live garage database.

## Automated coverage

| Area | Evidence | Limit |
| --- | --- | --- |
| MC identity and commands | `mechanical-persistence.mjs`: concurrent MC allocation, MC001/MC002, no consumed number on rollback, one checklist/manual JC, exact request retry, dual revisions, append-only/private ACL | No production migration applied |
| Work/time | Task transition/persistence fixtures: individual hours, handover preserves source history, one active employee, lifecycle/correction/ID001 regressions | Physical time-button interaction remains pending |
| Mechanical QC | QC fixtures: SUP003 sole Mechanical-only approval; latest FAIL/work/task changes invalidate readiness; ordinary SUP002/SUP001 sequence; mixed policy unset blocks readiness | SUP003 is not created; mixed third approval is unconfirmed |
| Delivery authorization | Actual route/SQL: Supervisor/linked Receptionist, Manager denied, session/account/role/capability checks before fresh commit and exact receipt replay | Internal planner remains trusted; not a public arbitrary-plan API |
| Authorization races | Native SQL: revocation/deactivation/role-change transaction commits before delivery is released; delivery-first session revocation waits for in-flight commit, then denies replay | Real PostgreSQL locking, not production load testing; no concurrent settings-change guarantee claimed |
| Old-client protection | Legacy full-save/identical-live paths reject unauthorized delivery, erasure, missing/duplicate protected JC, reopening/running work; server reconciliation retains protected authority plus unrelated edits | Not every historical APK physically exercised |
| Retry and account switch | Actual DOM/route fixtures: stored exact intent before send, lost acknowledgement/reload retries same UUID, known conflicts require reviewed new intent, offline/storage/login/late response denial | Real Android process termination/storage behavior remains pending |
| Main QC / Ready lists | Safe bounded server projection, unknown status instead of false zero, account/token/revision invalidation, ordinary action refresh, no per-row RPC/timer/polling | Snapshot display is not command authorization or continuously live status |
| Layout | Chromium 320/375/768/1280 for workspace, QC, both delivery roles and main overview; escaping/no horizontal overflow | Browser emulation is not physical Android acceptance |
| Existing garage workflows | Separate compatibility CI: sync/full-save/live/monthly, Reception, time/leave, Accountant/financial/sublet/other existing regression gates | A green suite does not complete new Accountant/payroll phases |

Native session races are in `tests/mechanical-delivery-sessions.mjs` and the existing delivery concurrency fixture. The tests assert no unauthorized delivery, receipt, history, audit or revision changes. A command that obtains its authorization locks first can commit before revocation; revocation then prevents all subsequent commits and replays. This is the intended serialization boundary, not a promise that an already completed delivery is undone.

## Physical and operational acceptance still required

Use a separately approved isolated environment with synthetic records, approved source/assets and test accounts. Do not create fake garage production fixtures or enable production flags to execute this checklist. Record device/OS, APK or web asset revision, tester, expected/actual result, and sanitized evidence for each case. Never record passwords or session tokens.

1. On the actual garage Android models and desktop browsers, open the correct MC from QC and verify vehicle/registration/JC, role-specific controls and required approval stages.
2. Exercise background/foreground, Wi-Fi loss/reconnection and mobile-data transitions during reads and before/after saving. Verify pending intent remains visible and retries do not create duplicate work, QC or delivery.
3. Close/kill/reopen the Android process after a delivery request is sent but before acknowledgement. Recover the exact saved request and reconcile the result before another handover.
4. Switch/logout/revoke a test account while a request is delayed. The next account must not see another account's snapshot or clear/confirm its saved intent.
5. Run an approved old-client test matrix alongside the candidate. Confirm an old save cannot erase/reopen protected work, while unrelated legitimate edits survive reconciliation. Test an outstanding saved old delivery journal without deleting or converting it.
6. Verify two mechanics' individual hours, pause/handover/repeat behavior and Oman midnight/week boundaries with controlled fixture clocks. Preserve original hours and stop active work before reassignment.
7. After PDFs/signatures are implemented, test priced/unpriced payload redaction, revision/signature validity, A4 output and actual Android share/print. These features are not accepted by the current tests.
8. Rehearse fresh install/upgrade and rollback with the exact release packet and approved isolated schema. Confirm all flags default off, old data survives, and any protected records remain guarded during flag rollback.

## Decisions and release dependencies

- Mechanical-only approver is Jibin/SUP003. Setup through existing Manager administration requires separate authorization; no password is invented or stored in this packet.
- Mixed Mechanical/paint retains SUP002 painting and SUP001 final. Whether SUP003 adds an approval remains unconfirmed; the corresponding policy stays unset.
- Priority/promise/hold authority, remaining JC date details, financial opening/account/period policies and payroll rules remain later decisions. Independent approved work may continue without assuming answers.
- The full Windows master documents have not been transferred. This record uses the authorized handoff summary and direct owner decisions; it does not claim complete source-document incorporation.
- Exact-source/environment production approval follows a complete reviewable release packet. PR49 remains draft; main is outside authorization. No automatic migration, deployment, publication, account creation or flag enablement follows a passing test.
