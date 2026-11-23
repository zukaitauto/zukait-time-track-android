# PC web publication reconciliation — 10 October 2026

## Verified evidence (no production mutation)

- **Last approved Android/staff release:** V304, GitHub tag `release-V304-architecture-v2`, target commit `28c68b7b55bc90bc75efd59f966acbcbbf019b82`.
- **Most recent successful GitHub Pages deployment:** workflow run [38023834857](https://github.com/zukaitauto/zukait-time-track-android/actions/runs/38023834857), source commit `8458b8082281779a0abb584cb6310354ebed1624`. Its GitHub Pages upload artifact is `github-pages` (ID 11659141105). That deployment occurred while V305 staff approval was false.
- **Difference:** the Pages deployment commit is 62 commits ahead of the V304 tag, with 98 repository files changed according to GitHub's compare API. Of those, **14 files were part of the Pages publication input** and differ from the V304 release; examples include `offline_test.html`, `reception_dashboard.js` (new), `secure_auth.js`, `qc_delivery_rules.js`, `paint_module.js`, `v2/features/insurance/reception.js`, `v2/features/estimate/main_module.js`, and `v74_updates.js`.
- The published HTML includes a script reference to `reception_dashboard.js?v=305-dashboard`, absent from the V304 tag. Production backend migrations and updater were **not** approved as V305. Thus the Pages **deployed artifact** should not be represented as an approved V304-equivalent build.
- The live Pages URL was not reachable through the available inspection interface, so **the exact bytes currently served to visitors have not been independently confirmed**. This finding is based on the successful deployment's source SHA and packaging workflow.

## Safety controls added, not yet deployed

GitHub Pages deployment is manual-only. The updated workflow validates explicit release approval, source SHA, approval timestamp, matching updater/version, nonce and signed acceptance run. **It now fetches and checks out the exact approved `release-request.json.sourceCommit` before packaging the PC site**, and rejects a source whose `app/build.gradle` version differs from approved updater metadata. Previously a later `architecture-v2` branch head could have been deployed even while the approval record named an older SHA.

`tests/reception-pages-publication-safety.mjs` verifies both release denial scenarios and the checkout guard without ever invoking Pages. The release request remains `approvedForStaff:false` and the staff updater remains V304/267.

## Open reconciliation decision

**Do not initiate an unapproved Pages deployment or silently overwrite the current live PC site.** A controlled rollback to the approved V304 assets needs explicit authorization, a confirmed Pages URL, a saved copy of the existing deployment artifact, and a documented emergency rollback entrypoint. Prefer restoring from immutable tag `release-V304-architecture-v2` rather than assuming the current branch is V304. Test login, Reception links, employee time operations and read-only views after any authorized rollback.

No Pages publish or rollback was executed in this checkpoint. Physical Android/Safari acceptance and real client-over-HTTPS delivery fault replay remain outstanding; the synthetic QA-ready vehicles RC0019 and RC0020 remain reserved.
