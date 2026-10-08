# V302 test candidate

Base: V301 architecture-v2 source at 6bbf8c28e5f10d60e124f6673fdda756387bb66a (one metadata-only commit after the published V301 source).
Android: versionName V302, versionCode 265, package com.zukait.timetrack. The candidate uses the existing permanent signing certificate so it can update V301 without uninstalling or clearing local storage.

## Included client fixes
- Preserve job-card identities and concurrent audit/holiday additions when merging.
- Keep actions made during save/rebase requests and retain rejected snapshots for review.
- Keep V2 events pending during temporary server failures.
- Format approval/voice values in H:MM and reject invalid colon minutes while retaining H.MM input.
- Use holiday-aware normal minutes for incentive calculations.
- Send the existing assignment allocation in V2 work events.

V301 features remain: estimates, spare parts, QC/delivery, time management, native dialogs, Manager corrections, leave and dashboard rendering controls. Existing V301 sync generation and authority safeguards are retained.

## Backend changes prepared, not deployed
Changed-record employee/session checks, Supervisor master-data protection, authenticated V2 work/leave/calendar validation, and a new read-only operational-report cursor RPC are included in source. Existing V301 server authority/correction logic is retained. Apply REVIEW_SAFE_REPORT_CURSOR.sql in staging before deploying the new API. No table writes, stored-time recalculation or historical data repair are performed by that SQL.

## Test distribution
The release/v302-test branch builds and signs a test APK using the established certificate, then publishes release-V302-test as a prerelease with latest=false. It does not update latest-version.json, release-request.json, the stable app, PC Pages or Supabase.

The APK currently points to the existing workshop server. Do not create dummy sessions, approvals, leaves or material transactions against that server. Write testing requires a separately configured staging backend. The test APK by itself does not deploy the prepared backend fixes.

Install as an update over V301; do not uninstall or clear app storage. Export any unsynced device changes before installation. Android/device testing and actual PostgreSQL execution remain pending.

## Validation
The shared V301 release gate includes its existing mjs/cjs suites plus four new runtime review suites. Local JavaScript and inline syntax checks passed. The local JDK is unavailable, so native dialog Java compilation must pass in GitHub Actions (Java 17). Binary assets are retained from the repository and checked in CI; the connector checkout cannot fetch PNG/WEBP bytes.

An additional scan of tests outside the existing release gate found older source-string assertions that also fail on unchanged V301. These are not new V302 failures and are not reported as passing. Keep device/staging validation separate from the automated release gate.

## Rollback
Do not uninstall V302 to downgrade: Android normally rejects a lower versionCode. Keep a backup and issue a higher-version rollback build using the same package/certificate if required. Revert server source independently; the additive read-only RPC can remain. Never reset device storage or drop tables to recover pending actions.
