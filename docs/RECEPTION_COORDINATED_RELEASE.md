# Reception website and Android release

## Verified cause (2026-10-10)

The public Pages URL still returns the deployment from `8458b8082281779a0abb584cb6310354ebed1624`, not the shared V305 UI. Independent HTTPS GETs returned HTTP 200 with SHA-256:

- `index.html`: `f1a00d6208e3eed3cc02aafab51c70f5e4b45061513716048400f4019ea3a089`
- `v2/features/insurance/reception.js`: `ad6f061442ee606ab12ce981f659421efa6713c475b19e10115b34b9a195db91`

Fetched branch head was `b0a58e87943428f289352f9a90622b263c4ace70`, newer than the supplied last head `f5dcf6e1`. It already includes Reception cache-query updates. Refreshing a browser cannot retrieve a UI that has not been published. Website packaging repairs and shared UI changes alone do not update Pages or installed Android assets.

The Android updater reads `architecture-v2/latest-version.json` and downloads the version-specific `release-Vxxx-architecture-v2` APK. V304/267 remains its publication pointer. Android bundles the same source assets as Pages; installing an isolated QA package does not update the staff package. Android's system installer enforces signing identity; existing clients do not consume the new optional SHA-256 metadata themselves. Public APK hashing is now checked by the release coordinator.

The shared UI's `supportsPhase2()` probes `reception_dashboard` with the actual session and verifies its response shape. Unsupported/unavailable production endpoints retain Phase 1 behavior, including no unsupported Cash intake. A new APK version is not evidence that Phase 2 is installed. This gate is unchanged.

## Single publication path

After all seven real acceptance gates pass, dispatch **Publish Approved Signed APK** (`publish-approved-release.yml`) on **architecture-v2**. Independent `pages.yml` publication now fails immediately with this instruction. Neither workflow publishes from pushes; neither may target main.

The coordinator:

1. Validates approval, all seven evidence records, source ancestry and drift. Application version and publisher changes are no longer exempt from source drift checking.
2. Checks out the exact approved application source. Downloads the retained signed acceptance artifact from the exact successful source/branch/workflow run instead of rebuilding a different APK after device acceptance. Checks signing certificate, package, version and embedded shared Reception bytes.
3. Creates a draft version-specific release; never deletes/replaces an existing release tag on retry.
4. Packages the existing website from that source. Writes `release-integrity.json` with source, acceptance run, version, APK checksum and static-file checksums. Deploys Pages under the shared publication lock.
5. Fetches every manifested public asset via ordinary and cache-busted HTTPS URLs, plus each HTML script's actual version-query URL. Rejects stale/mixed files and missing responses before staff APK publication.
6. Publishes the signed APK and verifies GitHub latest, the publicly downloadable APK checksum and website parity **before** advancing Android update metadata.
7. Commits matching updater metadata onto the original approval head. Refuses branch drift; never rebases the release pointer onto unverified changes. Verifies the public raw updater, APK and site again. Retains manifest and success/failure reports for 90 days.

GitHub Pages and GitHub Releases are separate services; this is an ordered, verified rollout, not an atomic transaction. If Pages succeeds and a later step fails, the website may already have changed. A failed run must not be described as a completed cross-platform release. Existing installed Android apps also remain on their current version until users install the update. Preserve the deployment report, release ID, source and old artifacts for operator recovery.

## Next operator action — required before production publication

1. On a trusted Windows machine follow `docs/INSURANCE_V305_WINDOWS_BACKUP_PREPARATION.md`: privately export current production roles/schema/data into encrypted storage with off-site copy and hashes. Preserve Storage object bytes, Edge function source/configuration, and applicable Auth/configuration separately. Keep credentials and customer data out of GitHub/chat.
2. Restore into a **new disposable database**, never production or occupied QA. Compare complete workshop state, employees/time sessions, Job Cards, purchases, consumables, parts/financial data, sequences and permissions. Record a named independent verifier, timestamps and private evidence reference. Export alone is not a passed recovery gate.
3. Freeze the new source; build fresh signed and isolated acceptance artifacts at that SHA. Retain the signed artifact through release (14-day default retention; rebuild and repeat acceptance if it expires). Perform physical Android WebView and actual Safari tests, real QA HTTPS lost/truncated-response/new-process retry, and the preservation matrix. Record actual results; automated Chromium/WebKit or mock tests cannot replace these gates.
4. Reconcile site role flows and retained rollback artifact. Only after verified backup/recovery and device/HTTPS acceptance, arrange the controlled production write pause, deploy **all nine** matching Phase 2 migrations and matching functions as the reviewed backend procedure specifies, and perform production smoke/preservation checks. This coordinator does not migrate the database or fabricate backend evidence.
5. Set the acceptance record to the frozen source, actual verified evidence and actual signed acceptance run; then approve `release-request.json` with timestamp and nonce. Dispatch the single coordinator on architecture-v2. Verify its final report and an installed staff device before announcing completion.

## Failure recovery

Stop on the first failed gate. The updater remains V304 until the final publication step. If a draft/tag already exists, inspect and reconcile it explicitly; the workflow deliberately refuses destructive replacement. If Pages has changed but APK/metadata has not, keep the controlled rollout pause and decide on the approved forward recovery or retained website rollback; do not reverse backend migrations blindly. If the metadata push loses its branch-head check, reconcile/re-attest branch changes before any retry. If final public parity fails after metadata advancement, treat the release as incomplete and investigate the retained reports immediately. No automatic rollback deletes journals, staff data or releases.

Current status: **code preparation only**. Approval remains false; seven gates remain pending. No production migration, website deployment or staff APK publication has been performed by this change.
