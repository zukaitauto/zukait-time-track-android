# Manager monthly Cash and Insurance follow-up

The Manager dashboard shows Cash and Insurance in adjacent panels on wide screens, stacked on mobile. Cash retains its existing three actions and amounts; the shared Supervisor cash panel uses the same rectangular card styling. Insurance is Manager-only.

The three Insurance cards open read-only monthly lists:

- Insurance In: authoritative Insurance jobs opened in the current Oman calendar month, using `createdAt`.
- Insurance Out: delivered Insurance jobs with `deliveredAt` in the current Oman calendar month.
- LPO Collected: valid, complete `insuranceLpo` records with `receivedDate` in the current month. Shows both LPO count and recorded amount, with OMR to three decimals. These are LPO documents, not payment receipts.

Eligibility, duplicate job-number selection, LPO validation and month rules match the existing server Insurance Management projection. Deleted, archived, cancelled and ID001 records are excluded. Lists show JC, registration, vehicle/year, insurer, relevant date and claim where available. LPO rows include their received amount. Opening a list first performs the existing confirmed shared read; a failed read preserves the current view and pending edits.

No backend, accounting entries, authentication, production data, release approval or updater metadata is changed.

Validation:

- `node tests/cash-monthly-pulse.mjs`: existing Cash behavior, monthly boundaries, Insurance Management parity, duplicates, exclusion rules, zero/invalid LPOs, role isolation, confirmed-read failure, escaping, stable refresh.
- `node tests/monthly-followup-responsive.mjs`: Chromium card and list layout/clicks at 320, 390, 768 and 1280 pixels; screenshots saved under `artifacts/monthly-followup/`.
- Existing Management, shared dashboard and mutation stability regression suites.

This is a development change on architecture-v2; publication requires the existing coordinated release process.
