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
