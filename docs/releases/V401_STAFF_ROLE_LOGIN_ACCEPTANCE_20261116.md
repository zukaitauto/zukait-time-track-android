# V401 Staff Login and Role Workflow Acceptance — 16 November 2026

## Status
**Isolated authentication / role matrix PASS**. Real production staff authenticated acceptance remains **PARTIAL**; **V401 staff publication HELD**.

## Tested against the actual staff-auth code (no production mutation)
[GitHub Actions test run 43863640761](https://github.com/zukaitauto/zukait-time-track-android/actions/runs/43863640761): **SUCCESS**.
Test implementation: `tests/v401-staff-login-role-matrix.mjs`, using the repository's real `staff-auth/index.ts`, isolated synthetic password hashes and session tokens, plus actual Accountant API and Mechanical inspection policy modules.

Verifies:
- Login and session resolution for Manager, Supervisor, Mechanical Supervisor, Receptionist, Accountant, Purchaser and Employee; inactive Employee refuses login.
- First temporary password change for Mechanical Supervisor, revocation of original session, successful new-password login, rejection of the old password.
- Only Manager can open Manager Staff Management and Accountant Account Management.
- Only Manager/Supervisor can access the legacy technician roster (unchanged established scope); the response represents inactive technician accounts as inactive.
- Only Manager can read Manager Profit Report; other roles denied without accessing financial context.
- Manager and dedicated Mechanical Supervisor identity SUP003 can pass Mechanical Inspection role authorization; all other synthetic roles denied.
- Logout revokes session; deactivating an account invalidates its token while unrelated sessions remain valid.
- `tests/accountant-auth-api.mjs` runs actual login/session and Manager/Accountant workflow against **isolated PostgreSQL**, including Accountant password requirements, session revocations, role denials, idempotence and accounting commands.
- `tests/reception-receptionist-auth.mjs` confirms Receptionist account creation, initial password change, logout and deactivation against isolated auth runtime.
- Mechanical Inspection API/session test modules passed.

## Read-only production checks
Project `pjknotnjkufadqavcmii`.
Live `staff_sessions` join with active staff roles shows recent non-revoked usage by Manager, Supervisor, Receptionist, Purchaser and Employee. The active Accountant role had previously created sessions but none used in the 24 hours of the read. **Mechanical Supervisor has zero recorded sessions**: live account is active, department `Mechanic`, `must_change=true`, not locked, and has no alias; no password hashes or tokens were extracted.

Source `secure_auth.js` directs Mechanical Supervisor to `mechanical_supervisor.html` only after mandatory first-password-change processing. The dedicated host `mechanical_supervisor.js` verifies the saved token using `staff-auth` again before enabling the workspace. Isolated test confirms the underlying password-change and token revocation path.

## Manual live acceptance still necessary
A staff member must sign in **as their own role** and use the installed app/website. In particular:
1. Mechanical Supervisor: log in, set their own new password, confirm re-login and opening Mechanical workspace; perform only authorized read-only inspection checks initially.
2. Accountant: log in and open dashboard, confirm no Manager-only Profit Report or staff-management operations.
3. Manager: open Accounts Profit/Loss for October and read Job Card details; verify current provisional OMR 5,918.392 and pending-cost JC12060 (the later 0.480 session adjustment remains recorded). Check Manager-only staff and account management.
4. Supervisor: confirm workshop dashboard and technician roster are available, Manager-only Accountant/staff commands denied.
5. Receptionist: open Checklist, linked Job Card and VIN verification read-only without modifying a real customer's Job Card.

**Do not** request or copy staff passwords, browser bearer tokens or session hashes into this report; do not bypass `must_change`. A connected browser profile has **no saved authenticated ZUKAIT site**, so authenticated production HTTP workflows cannot be executed by this assistant without a user-directed secure sign-in.

## Release boundary
No production staff credentials, authentication sessions, accountant records, Job Cards or history were changed by this test. CI tests use synthetic identities only. Remain `approvedForStaff=false`, `evidence.serverPermissions=false`, `evidence.credentialPreservation=false` until actual live role acceptance and recovery checks are recorded. V400 remains published.
