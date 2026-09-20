# Zukait Time Track V39 — Cloud Multi-User TEST

This is the first shared-data pilot based on the V38 logic that passed testing.

## What V39 proves
- Several Android phones can use one central workshop state.
- Employee, Supervisor and Manager screens stay on the V38 business rules.
- Every change is cached locally first, then synced to Supabase.
- Other phones poll the shared state every 3 seconds.
- A revision check prevents silent overwrites when two phones save at the same moment.
- If a conflict happens, the latest cloud state is loaded and the user is asked to repeat the last action.
- Reset Test Data is disabled when Cloud Mode is active.
- Passwords are deliberately NOT copied into the shared JSON state.

## Supabase setup
1. Create/select a Supabase project.
2. Open SQL Editor and run `supabase/V39_CLOUD_TEST_SCHEMA.sql`.
3. In Supabase, open the project's Connect dialog and copy:
   - Project URL
   - Publishable key beginning with `sb_publishable_` (legacy anon JWT also works)
4. Install the V39 APK on each test phone.
5. On each phone, tap **Cloud Setup** on the login screen and enter the same Project URL + Publishable Key.
6. Start with 3 test devices: one Supervisor, one Employee, one Manager.

## Important
V39 is a TEST architecture. Its shared-state database policy is intentionally broad enough for a pilot. Do not use this schema as the final production security model.

Production must move to Supabase Auth + per-user role claims + least-privilege RLS. Supabase secret/service-role keys must never be put in the APK.
