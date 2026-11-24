# V417 — Stock UI test release scope

This is a UI-only, owner-requested test release. Base version V416, version code 380.
Only the Stock UI JavaScript, matching regression tests and Android version marker
are updated. No backend Edge Function, SQL, stock data, prices, prices in Job Cards,
or historical workshop data are updated or deployed.

Included:
- Mobile Stock menu pastel colors, Back / Close button layout
- Search Material + Brand tappable exact-ID choices, no auto-select first item
- Duplicate visible names remain distinct by pair ID
- Manual limited Load More preserves entered quantity, price method, amount, opening
  confirmation and note; live search does not write stock
- Stock Balance refuses to present UNKNOWN or uncounted status as physically zero

Count-status caveat: Production has not been migrated for the optional
`initialised` flag. If the current server does not send it, the UI displays
'Opening count status unverified' rather than a confirmed balance. Existing
stock transactions remain subject to current server permissions and feature flags.
The count-status migration and API flag change remain staged in PR #86,
and the atomic Paint Actual stock reconciliation remains held in PR #84.

Acceptance: signed Android release build, Reception tests, Stock regression,
offline protection and sync traffic QA must pass on the exact candidate SHA.
Physical iPhone and live stock count acceptance is not done until the owner tests.
Do not enable backend count-status flags, activate auto-consumption, perform any SQL
migration, or modify real inventory for this UI-only release.
