# Features 1–8: unreleased implementation and verification

Work is restricted to `architecture-v2`. The owner explicitly held the release
before adding these features. Both release requests remain unapproved, immediate
release is disabled, and all existing physical/Phase 2/production-backup gates
remain unperformed. No production records, dates, schemas, or deployed functions
were changed by this work. The published client remains V325.

## Root causes and implementation

- Android PDF sharing used `WebView.draw()` on a detached view immediately after
  `onPageFinished`. Loading completion does not establish rendered pixels, font
  readiness, or correct pagination. Export now attaches a dedicated off-screen
  renderer, waits for fonts/images and visual readiness, uses the shared canonical-document renderer for Android and web,
  exports every page, checks the actual file
  with `PdfRenderer`, and blocks empty/all-white PDFs before FileProvider sharing.
  Temporary files are isolated per export. Failure releases resources and permits
  retry. No WhatsApp messages are sent during tests.
- Report Options Print and Share retain their original `reportHtml`. Browser
  sharing/download renders that document in an isolated frame, rather than the
  options modal. Bundled, pinned jsPDF/html2canvas create the actual PDF file;
  images/fonts, visible pixels, PDF header and file length are validated. Native
  sharing uses the corrected shared bridge, including existing report consumers.
- The estimate uses the approved shared-conversation header wording: English
  company/workshop left, original embedded logo and slogan centre, Arabic company
  and workshop text right with RTL, and REPAIR ESTIMATE centred below. Serial,
  date, vehicle fields, financial calculations and original footer are preserved.
- Add Labour/Add Part are beside their section headings. Zero money inputs clear
  on focus, nonzero values remain, and three-decimal formatting occurs on blur,
  without altering typing or quantity fields.
- Reception sorted Job Cards primarily by number. Server projection now sorts
  original creation timestamps descending, parses numeric and ISO values,
  applies stable number/ID ties, filters before pagination, and never edits data.
  Missing creation dates remain missing; checklist intake dates are not used as
  job creation dates. Open job lists refresh while idle and retain filters/page.
- The main View Job Card route showed a short list-summary stub, and linked jobs
  could route to the checklist. It now reuses `zukaitJobEdit.view`, reads the
  selected authoritative Job Card, checks response identity, displays complete
  safe saved fields, preserves long notes/descriptions, supports mobile scrolling,
  and prints the same complete record. Back restores list filters; Reception
  Close restores its workspace. Checklists stay separate. Delivered edits remain
  Manager-only. Backend GET exposes only explicit read fields, not costs, time,
  credentials or arbitrary records.

## Changed files

- `app/src/main/java/com/zukait/timetrack/MainActivity.java`
- `app/src/main/assets/report_pdf_export.js`
- `app/src/main/assets/vendor/pdf/` (pinned libraries and MIT licences)
- `app/src/main/assets/v74_updates.js`
- `app/src/main/assets/v2/features/estimate/main_module.js`
- `app/src/main/assets/reception_dashboard.js`
- `app/src/main/assets/job_card_edit.js`
- `app/src/main/assets/offline_test.html`, `receptionist.html`
- `supabase/functions/workshop-api/index.ts`, `job_edit_rules.js`,
  `reception_dashboard_rules.js`
- `app/build.gradle`, `app/src/androidTest/` (synthetic native PDF verification)
- `.github/workflows/native-pdf-check.yml`
- Existing publication workflows: include new PDF assets; manual/approval/source
  protections and the retired standalone Pages protection are preserved.
- `package.json`, `package-lock.json`, JavaScript/asset validation scripts,
  release request files, and relevant tests listed below.

## Evidence and limits

Local functional tests passed for Reception/management, permissions, retry
receipts, estimates, invoices, leaves, all 19 staff Time Details, release denial
and preserved history. Chromium verified mobile/full Job Card views across all
three roles/types and delivery states, long scrolling, filters, Print, actual
multi-page report PDF download and blank prevention. Estimate tests verified
heading/button geometry, all requested amount examples, VAT, Arabic RTL,
unchanged footer, one-page normal estimate and five-page 120-part estimate.

Additional exact-commit CI checks are required before declaring completion:
Reception Chromium/WebKit checks, estimate visual/PDF checks, signed Android
build/full regression, and isolated Android WebView instrumentation. Instrumented
Android tests use synthetic offline documents and intercepted chooser intents;
actual owner-phone WhatsApp handoff and physical Android acceptance are NOT_RUN.
No device-only acceptance is inferred from a build or browser simulation.

Key tests: `tests/reception-feature8.mjs`,
`tests/reception-feature8-browser.mjs`, `tests/reception-dashboard-client.mjs`,
`tests/reception-dashboard-rules.mjs`, `tests/reception-job-edit.mjs`,
`tests/v2-estimate-functional.mjs`, `tests/v2-estimate-browser.cjs`, and
`app/src/androidTest/java/com/zukait/timetrack/PdfExportTest.java`.

## Deployment requirements

The coordinated update requires the verified workshop-api function (read-only
sort/projection changes), web assets and a newly signed APK. No SQL migration is
needed. No deployment or staff release is requested or performed by this commit.
The owner’s hold must be resolved before publication; V318 safeguards remain in
place, including truthful physical and backup acceptance statuses.
