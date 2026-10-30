# V377 development — not a release approval

Baseline: architecture-v2 `3fe496a8f7e8edfa12184f43aa4f0fded8fcbd5f`.
V376 remains production. V377/code 340 is development-only. No V376 acceptance or owner deferrals transfer. Publication requires the owner's exact instruction: FINAL — RELEASE V377, followed by applicable source-bound release checks.

## Implemented in this checkpoint

- Single Over Allocated card; normal-duty allocation overrun and completed weighted employee ranking use shared time-management rules, deduplicate assignments/session IDs, and exclude repeat/ID001/cancelled/Mechanical work.
- Four two-card rows at small widths, corrected navigation, state-event overrun refresh.
- Purchase Cost labels retain Parts + Sublet drill-down and original date rules.
- Consumables Cost separates Paint and Paint Materials by source, uses shared paint receipt/return authority, excludes NIL paint purchases, and totals integer mills.
- Mechanical KM entry uses existing reception odometer fields. VIN OCR whitespace parsing corrected, device-local photo preview supports manual fallback, and captured URLs are revoked on navigation.
- V377 publication/acceptance records explicitly fail closed.

## Verification to date

Focused performance, financial reconciliation, finished-assignment, paint authority, purchase filters, Mechanical sections, and publication safety tests pass locally. Financial fixtures cover corrections, voids, returns, NIL paint, and material categorization without production data.

Full regression reached the native dialog test and stopped because javac is unavailable in this environment. Chromium cannot launch here (sandbox socket operation denied). These are NOT passes. The browser regression has been added to the isolated GitHub QA workflow; CI and Android build results must be inspected at the resulting commit.

## Still required before owner acceptance

- Backend Mechanical independent job sequence and server Cash/Credit enforcement. Existing scoped SQL still delegates caller-supplied numbers and accepts Insurance; client-only restrictions are insufficient.
- Mechanical/body isolation across all projections/reports; monthly in/delivered counts, checklist vehicle inspection diagram/markers, search/360 completion and full permission verification.
- Confirm matching purchase status/date inclusion rules between monthly purchase reporting and per-JC costs (existing purchase reporting and received-material costing differ).
- Full isolated native PostgreSQL fresh/upgrade suite, complete regression, real-browser checks and signed Android candidate build.
- Physical-device acceptance for V377 and exact-source release packet. No production schema or data changes have been made by this checkpoint.
