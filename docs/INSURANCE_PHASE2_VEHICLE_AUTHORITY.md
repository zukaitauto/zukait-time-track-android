# Phase 2: authoritative linked vehicle corrections and location

Pending only; V304 remains live. Migration `20261009094309_reception_vehicle_authority.sql`
depends on all four previous Phase 2 migrations. Do not deploy independently.
No new tables, vehicle records, business sequences or Edge Function changes.

## Behavior

The existing linked Reception EDIT command allows active Manager corrections with
mandatory reason, RC revision, request UUID deduplication and existing validation.
It keeps the original before/after reception audit and approval snapshots. RC locks
precede shared workshop state locks and Job Card projection updates. Any failure
rolls back the entire correction, including the RC and request cache.

The RC is the source for make/model/year/registration/VIN/claim/customer/contact/
insurance company and linked VIW/VWC location. A state BEFORE trigger overlays
these fields onto the existing job master and linked operational estimates. It
removes stale legacy aliases so clearing a field cannot revive an older copy.
Missing/duplicate linked jobs or source estimates fail closed. Stale saves cannot
change linkage, identity, insurance classification or confirmed vehicle location.
Direct Job Card projection identity updates are canonicalized too; projection
rekeying of a linked job is refused. Legacy unlinked jobs retain established edits.

Only current operational estimate identity changes. Approval/quotation snapshots,
audit history and source-to-part mappings stay immutable. Corrections can correctly
flag old approval evidence as needing review; they do not stop existing repair or
parts operations. A physical movement alone does not invalidate an approval.

Parts, consumables, paint and delivered/360 views use the established Job Card
master rather than duplicated reception observations. Parts reads overlay current linked
identity onto display rows without rewriting cached source history. Linked paint
views and shared resolution retain deliberately blank corrected fields. Fuel, tools, damage,
odometer and remarks remain checklist-only; an observation-only edit does not
advance workshop state. Existing paint color/code writes remain usable.

Linked vehicle edit screens route to Reception. Manager Full Edit locks RC-owned
identity but retains other operational fields. Supervisor list cards, focused Job
Card details and search/360 views display confirmed VIW/VWC separately from work
status. Reception requests keep their UUID after a lost response and pull shared
state after confirmed edits/movements. No local job/vehicle/location is fabricated.
VWC does not close/cancel a job, stop parts/work, or count as delivery. Approval and
parts arrival do not move the vehicle.

## Verification

- All five pending migrations plus CREATE_JOB and new vehicle SQL assertions ran
  inside BEGIN/ROLLBACK against the existing live schema. Tested Manager authority,
  mandatory reasons, stale revisions, UUID retry, before/after audit, projection
  failure rollback, aliases/blank VIN, linked estimate correction, stale full save,
  deleted linked job/estimate refusal, direct projection writes/rekey refusal,
  physical movement and approval preservation, unchanged parts/live work/unrelated
  state, and immutable original approval evidence.
- Earlier preliminary-parts, approval and job-creation-guard SQL tests passed with
  all five pending migrations. The older guard fixture explicitly unlinks its
  not-yet-created QA job before mutating sources; production guards remain active.
- Reception DOM/API checks and new correction/movement DOM tests passed, covering
  lost-response retries, no optimistic location, confirmed refresh, badge display,
  unchanged legacy edits and retained Paint PO color-code updates. JavaScript asset
  validation passed.
- Local regression programs passed except native-dialog-lifecycle, which cannot
  compile here because this environment has java but no javac. GitHub signed
  acceptance run `37917044003` passed the complete suite, native dialog tests,
  production asset gate, release compilation and APK signature verification.
  Reception run `37917044192` and debug build `37917044156` also passed. The shared
  regression runner installs pinned development dependencies when jsdom is absent,
  so unsigned/review workflows execute the same new DOM test.
- Post-rollback inspection found no persistent vehicle-authority function or RC QA
  fixtures. Tests allocate no live RC/quotation/PL business numbers.

Live security advisors were checked. Existing service-only RLS tables have no
client policies as designed. The advisor also flags existing trigger function
`zukait_v2_project_spare_part_event` grants to anon/authenticated; this migration
adds no SECURITY DEFINER functions and grants its INVOKER helpers only to
service_role. Review that existing advisory separately:
https://supabase.com/docs/guides/database/database-linter?lint=0028_anon_security_definer_function_executable

## Activation gate and next work

Real simultaneous-device, physical Android and Safari acceptance remains pending.
No deployment, release approval, staff version change or Phase 3 work is included.
Next: additional approvals and safe additional-parts transfer; then audit existing
cancellation dependencies before implementing Manager-only cancellation with
mandatory reason/date/identity and preservation of work, purchases and expenses.
