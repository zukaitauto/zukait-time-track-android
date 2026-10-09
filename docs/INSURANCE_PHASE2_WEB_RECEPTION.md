# Reception web workspace and acceptance

Branch: architecture-v2. This change is verification-only; V304 / versionCode 267 and workshop-api 58 remain live. No migrations, API deployment, business numbers or release versions change.

## Web layout

Reception uses a scoped dialog up to 1280px wide. Desktop search and status filters share a row. The checklist list is a native table with vehicle, registration/customer, insurer, status/location and action columns. On phones the same rows become labelled cards, without duplicate controls. The editor uses three columns on desktop, compact accessories and two-column reception observations. The title/navigation header and spacing adapt to screen width. Other workshop dialogs retain their sizing; the Reception sizing class belongs to its disposable wrapper and needs no global close-handler changes.

All existing field names, required fields, revision checks, request UUIDs, permissions, pagination, safe escaping and confirmed-only actions are retained. This is a presentation change; VWC/VIW, approvals, parts operations, cancellations, shared vehicle authority and financial calculations are unchanged.

## Automated verification

`npm run test:reception` covers Reception, preliminary parts, estimates/approval, Job Card creation, shared vehicle authority, additional approvals and Manager cancellation. `node tests/reception-api.mjs` covers verified sessions and API permissions. Existing full regression and JavaScript/production-asset validation remain required.

`npx playwright install --with-deps chromium webkit` then `npm run test:reception:browser` checks 1440, 1024, 768 and 390px widths in both engines, using actual application CSS and an isolated mocked API. It verifies wide desktop sizing, responsive list structure, escaped values, location badges, required fields, accessories, keyboard order and absence of horizontal overflow. It never contacts Supabase or allocates business numbers. The Reception GitHub verification workflow runs these browser checks on architecture-v2.

## Remaining activation gates

Automated viewport checks use Chromium and WebKit, not a physical Android WebView or Safari device. Real PostgreSQL overlap acceptance now passes for creation/retries, corrections/stale saves, movements, additional approvals and cancellation versus work/parts changes; see `INSURANCE_PHASE2_CONCURRENCY.md`. Complete physical Android/Safari acceptance, including Edge Function transport, lost connections and reconnection. The security-definer advisor finding has a tested pending grant-hardening migration; see `INSURANCE_PHASE2_TRIGGER_PRIVILEGES.md`. All eight pending Phase 2 migrations must activate together, with the matching API/client changes, only after acceptance. Do not deploy the creation guards alone. No Phase 3 work is included.

## V305 Reception operations dashboard (QA candidate; not released)

The Reception workspace now has ten clear, numbered actions/cards. Manager and
Supervisor continue using their **existing** workshop accounts through the
one-click Reception launcher. Only a dedicated Receptionist needs a separate
Reception-only user ID and temporary password, created by the Manager through
secure User Management with required password change on first sign-in.

1. **Create Checklist** opens the existing authoritative Reception intake.
2. **Create Job Card** opens Cash/Credit intake or the approved Insurance
   Job Card workflow from a checklist.
3. **Checklist List** is sorted by descending numeric RC sequence and
   supports month, inclusive date range and search by RC, registration or
   linked JC.
4. **Job Card List** covers existing shared-state JCs, including those
   opened through the Supervisor workflow, with number, date/month and
   registration/RC/JC search filters.
5. **Approval Waiting Insurance** shows only unapproved, unlinked, still-open
   insurance checklists.
6. **Vehicle With Customer** shows two separate, countable lists: VWC
   checklists without JCs, and VWC vehicles with open JCs; neither is delivery.
7. **Approved Vehicles** lists approved insurance cases only until a JC
   is created. Creation immediately excludes the case from the queue.
8. **Ready to Deliver** uses the unchanged authoritative QC status and
   fingerprint rules; it automatically excludes delivered vehicles and
   delegates actual delivery to existing Supervisor or restricted
   Receptionist controls.
9. **Delivered Vehicle List** sorts newest delivery timestamp first and
   supports registration/JC search, date range and month filters.
10. **Delivery Follow-up** lists undelivered, noncancelled JCs by
    **Promise Date**, earliest first. Missing dates are clearly marked
    **No promise date** and have a dedicated filter. Inclusive dates such
    as October 10–15 are supported.

**Promise Date** is an optional date-only JC property. Manager and Supervisor
can enter or clear it in the dashboard for an open JC; the optional date
also appears when opening Cash/Credit or approved Insurance JCs through
Reception. A server-authenticated request checks the previous value,
commits a single authoritative state revision, records a per-JC audit
receipt, and preserves unchanged jobs, assignments, employee sessions,
expenses, purchases, QC and delivery. Older full-state clients cannot
overwrite the server-owned promise date or audit. Receptionists can view
dates but cannot change them. Promise Date is distinct from a VWC
*expected return date* and never marks a vehicle delivered or changes
financial calculations. If a date save following JC creation cannot be
confirmed, the JC remains open and an explicit warning requests
reconciliation; there is no duplicate JC retry.

The read-only dashboard response projects only limited checklist/JC
identifiers, vehicle details, statuses and dates; no staff credentials,
financial totals, purchases, or labour sessions are returned. Lists
are server-backed and paginated in blocks of 50. Each Reception page
requests fresh server state, not a locally invented delivery or approval.

**Verification:** [Reception CI run 37989855118](https://github.com/zukaitauto/zukait-time-track-android/actions/runs/37989855118)
passed dashboard rule/client tests, PostgreSQL concurrency, API permissions,
Chromium and WebKit responsive tests at 1440/1024/768/390px, and JavaScript
validation. [Isolated QA acceptance run 37989855115](https://github.com/zukaitauto/zukait-time-track-android/actions/runs/37989855115)
built the separate QA-only Android package. QA Supabase
`omqgkqknbdcnotabffek` deployed `workshop-api` **v2** from
`architecture-v2` source `5f4b4604bc2a5897c3edaffff9be980d5b32ad3a`.
No production migration, Edge deployment, updater change or staff release
was performed. Physical devices and authenticated end-to-end HTTP test
acceptance remain required before V305 approval.
