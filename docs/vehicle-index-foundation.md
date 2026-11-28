# Central Vehicle Index: first reviewable increment

This PR adds an inert, dependency-free search core and a three-model CC0 pilot snapshot. No production HTML loads it. It does not replace the vehicle master, change application state, deploy SQL, rewrite documents or enable publication. Run `node tests/vehicle-index.mjs` to test independently.

## Repository inspection

- `v74_updates.js`: `zukaitNormalizeVehicle` uses hardcoded names and device-learned aliases. `zukaitLearnVehicleAlias` currently has no manager approval boundary. `zukaitRepairHistoricalVehicleIdentity` can mutate job records. The new catalogue must not call or extend these functions implicitly.
- `job_card_master.js`: `identity`, `display` and `patchIdentity` are existing job identity authorities. Existing VIN confirmation and patch workflows remain in place.
- `v2/features/insurance/reception.js`: Bodyshop checklist, direct job creation and estimate preparation share make/model fields. It already uses vehicle candidate selection and VIN verification; autocomplete must only assist explicit text entry.
- `mechanical_prejob_intake.js`: existing registration lookup fills a confirmed physical vehicle's details. The catalogue must never supersede a VIN mismatch or decide physical identity.
- `mechanical_estimate.html` and `mechanical_estimate_host.js`: separate estimate host requires explicit integration and responsive acceptance.
- `20261107123000_vehicle_master_identity_safety.sql` and subsequent master migrations: physical vehicles, visits and ownership periods are distinct. Registration is a searchable observation, never a unique vehicle identity. No migration or change to these associations is included.

## Catalogue sources reviewed on 2026-11-28

1. **Wikidata structured data**, CC0-1.0: https://www.wikidata.org/wiki/Wikidata:Licensing . Preferred global foundation for current and discontinued model families. Only structured labels/claims are reusable under this policy; exclude article text, images and logos. The pilot transcribes make/model names from Q1141487, Q914069 and Q110899968, linked on each row. J80 provides a historical generation search example. Make IDs are ZUKAIT catalogue identifiers, not physical vehicle IDs. These few rows demonstrate search, not global coverage.
2. **NHTSA vPIC**: https://vpic.nhtsa.dot.gov/api/ and https://vpic.nhtsa.dot.gov/api/home/index/faq . Official FAQ permits public API use without licensing or registration. Data concerns manufacturers registered for US import/sale/use, so it cannot establish complete GCC coverage. Standalone downloads exist: https://vpic.nhtsa.dot.gov/Downloads . No vPIC rows are bundled in this increment; verify the selected download's redistribution terms before adding it. API access permission alone is not a blanket third-party data licence.
3. **Manufacturer GCC catalogues**: useful for verifying GCC-specific names and current availability. Do not bulk copy proprietary catalogues without explicit reusable terms. Fill gaps through reviewed factual additions with provenance or a licensed source. Keep historical entries even when absent from current catalogues; never infer discontinuation merely from absence.

## Core contract

- `create(snapshot)` validates and copies the snapshot, then exposes immutable `searchMakes`, `searchModels` and `resolve` operations. Model matches and aliases are always scoped to a make. Exact matches rank before prefix and substring matches. No network call occurs while typing.
- `resolve` accepts exact names and explicitly approved aliases only. Unknown spelling returns `REVIEW_REQUIRED` with entered text preserved. It never guesses a nearest name or edits a record. `Petrol → Patrol` is tested using a synthetic approved alias; it is not shipped as a manager-approved alias.
- `load(bundled, storage)` uses a versioned cache namespace. Only cache content equal to the reviewed bundled snapshot is accepted. Stale, future, corrupt and locally altered data falls back to the bundle; blocked storage remains usable. Browser local storage is not an approval authority. Future signed remote updates require a separate verified manifest design.
- Source identity, record link and reusable licence are required for rows. The validator's licence allowlist is a technical gate, not a substitute for checking each imported source's terms.
- No existing learned aliases are imported. Browser metadata cannot enforce manager permissions. This increment intentionally exposes no approval or unknown-entry persistence endpoint.

## Next independently reviewed increments

1. Add a reproducible, bounded importer with pinned entity revisions, retrieval timestamp, raw snapshot checksum, licence record, collision report and before/after catalogue diff. Review makes/model-family/generation relationships. Avoid treating Range Rover as an unrelated physical make or automatically merging regional rebadges. Expand the GCC/historical acceptance set before calling the catalogue comprehensive.
2. Add an authenticated manager review queue and audit log for unknown makes/models and spelling aliases. Enforce role checks on the server using existing staff authentication; approve by stable catalogue ID, retain entered text, reject collisions, and publish a new catalogue version. No client-only role check is sufficient. No VIN, plate, customer, visit or job identifiers belong in catalogue records.
3. Integrate one explicitly selected editable intake form first, with accessible keyboard/touch autocomplete. Selecting a make filters models; changing it must not silently leave an incompatible model. Unknown entries remain pending review. Never attach autocomplete to read-only historical documents or invoice rendering. Test confirmed vehicle lookups and slow/out-of-order form updates.
4. Extend the same adapter to Bodyshop and Mechanical checklists, job cards and estimates, including the separate PC hosts and Android bundled assets. Verify offline use, Android WebView, desktop keyboard and narrow touch layouts. Existing record corrections require a separately reviewed preview/audit workflow; issued document snapshots remain original.

## Publication boundary

The feature branch and draft PR are for review only. Release metadata, app version, backend routes and production hosts are unchanged. PC publication and signed APK publication are manually release-controlled in existing workflows. The new workflow only runs offline Node tests on PRs. No deployment or publication workflow is dispatched.

## Bulk import candidate (review only)

Run `node tests/vehicle-index-import.mjs` and `node scripts/import-vehicle-index.mjs vehicle-index-review`. The review workflow runs one bounded Wikidata SPARQL request, with a 55-second deadline, 15,000-row cap and 16 MiB response limit. It rejects capped/empty responses and retains the exact source bytes, query, SHA256 hashes, candidate and skip report in a CI artifact. Replay using the raw snapshot and `VEHICLE_INDEX_RETRIEVED_AT=YYYY-MM-DD`. It preserves pilot rows/IDs, uses English model labels and a conservative brand/manufacturer prefix rule; unresolved relationships and duplicate names are reported, not guessed. The raw snapshot is pinned by checksum; individual entity revisions and regional coverage still require review. No candidate is automatically installed or committed. The current pilot remains unchanged until an independently reviewed catalogue import is accepted. This direct-class query is not full worldwide coverage; pickups, commercial vehicles, model families and GCC variants may require additional sources.

### Timeout recovery

The initial worldwide query exceeded the 55-second client deadline (run 46117814581). Retry with two narrowly scoped, verified manufacturer/brand ID batches (Toyota, Nissan, Honda, Lamborghini, Land Rover, Rolls-Royce). Each has a separate bounded request; empty/capped/failing batches fail closed. Raw individual responses and their hashes are retained in the aggregate snapshot. This is a targeted retrieval, not the worldwide expansion. Add further verified make batches only after this path succeeds. Source IDs verified from Wikidata entity pages Q53268, Q20165, Q9584, Q124966860, Q35886, Q26777551, Q35907, Q234803. No automatic live installation.

### Wider make coverage and review metrics

Expanded to seven bounded query batches (32 target entities), including Japanese, Korean, European, US and Chinese makes. Manufacturer/brand names are normalized only using explicitly reviewed Wikidata entity links (see canonicalMakes in importer); an exact model-label brand prefix remains mandatory. This avoids treating a parent company's other brands as the same make. The candidate report now includes model counts by make, missing target entity IDs and counts by rejection reason. Unexpected make IDs outside each requested batch fail closed. Neither a successful retrieval nor the raw count establishes a reviewed catalogue. The earlier 623-model artifact is still a candidate; contents were not independently inspected here. Full GCC coverage and individual name review remain pending.

### Staged Reception autocomplete adapter

Added a reusable make/model input adapter and optional attachment points for Reception checklist create/edit and direct Job Card creation. The adapter requires explicit configuration with a reviewed catalogue; no production HTML loads the adapter or supplies a catalogue yet. It proposes matching names locally, accepts explicit button selection only, dispatches existing form input/change events and leaves VIN/registration/customer fields and save authority untouched. Unknown entries remain manual and do not silently become approved aliases. Changing make retains existing model text and shows a review warning if not matched; existing registration/VIN lookup is not replaced. Keyboard down/Escape and native button activation are supported. Manager approval, full form validation, actual responsive device acceptance and activation remain pending. Test with `node tests/vehicle-index-autocomplete.mjs` after npm ci.

### Staged Job Card and Mechanical Checklist integration

Added optional attachment to Reception Job Card edit, Manager full Job Card edit and Mechanical pre-job checklist forms. The adapter can accept explicit existing make/model inputs without altering their IDs or form payload. Linked read-only vehicle fields are not attached; dynamically locked fields and stale suggestions after programmatic make changes are rejected. The source-of-truth save and VIN workflows remain unchanged. Estimate uses a combined make/model field; that screen is not integrated in this increment. No production host loads the adapter until reviewed data activation.

### Staged Mechanical Job Card and shared Estimate autocomplete

Mechanical direct Job Card creation receives the same optional adapter, preserving checklist locks, existing vehicle selection and review-before-create. Shared Bodyshop/Mechanical estimates retain their single makeModel string; the new two-step combined adapter suggests makes then make-scoped models without altering the stored format. Linked Reception/Job Card estimates are excluded and a newly loaded Job Card blocks stale suggestions. No print layout, saved document, VIN, registration, customer, or existing vehicle identity is modified by the adapter. Both hosts remain inactive until a reviewed catalogue is configured and loaded.

### Manager review screen (isolated preview only)

Added proposal validation and an isolated Manager screen for adding a make/model or mapping a spelling to an existing make/model ID. Validates scope, duplicate canonical/alias names, required reason, current catalogue version and rejects extra request properties. `PREVIEW_ONLY` is not approval; no writes, localStorage, historical correction, manager approval claim, or production menu binding exist. A browser role is a display guard only. Server-authenticated command routing, separate catalogue storage, audited atomic version changes, unknown submission queue and historical correction preview/commit are still required before enabling the screen. Expanded run 46118710165 reported 25 makes, 2,351 candidate models, 2,601 input rows and 248 excluded rows. It is still unreviewed data.

### Server approval boundary and storage review draft

The default-off `vehicle_index_approval` route uses existing authenticated staff session handling, verifies Manager role, validates input and calls a dedicated RPC. It never reads or writes workshop_state. The SQL design in `docs/vehicle-index-storage-review.sql` is NOT a migration and has not been executed: it separates catalogue entries, version and append-only audit, rechecks active Manager credentials and session, serializes on a single catalogue meta row, rejects collisions/stale versions, and returns the original receipt on identical retry. RLS is enabled and grants are restricted to service_role; the function uses invoker rights. Before generating a proper migration, run SQL against isolated QA with real staff schema and check role/revocation, concurrency, Unicode normalization equivalence, receipt retries, audit and grants. Import the reviewed catalogue into the registry and seed the meta version atomically, implement read/signed-cache contract and connect the Manager preview UI. The route must remain disabled until acceptance, and historic correction remains separate. The change does not deploy SQL or modify any production settings.

### Isolated PostgreSQL acceptance

Read-only inspection of the existing `zukait-v305-qa` schema confirmed the session and credential columns used by the RPC are present and that catalogue meta storage does not exist there yet. No QA tables or accounts were changed. Added a disposable PostgreSQL 17 GitHub service test with synthetic staff rows, executing the exact SQL review draft. It checks direct anon/authenticated grants, audit update/delete restrictions, RLS, active Manager permissions, revoked/locked/inactive sessions, invalid scope, Unicode normalization duplicate, stale version, idempotency and audit count. This is an isolated SQL test, not a deployed Supabase acceptance run. Real QA service role grants, concurrent requests, full catalogue bootstrap and deployed HTTP permissions remain to be verified.

### Approval UI transport and PostgreSQL fixture correction

The first isolated database run failed at test fixture insertion (two model fixtures omitted make_id); corrected both rows. The optional Manager approval UI now accepts an explicitly injected authenticated transport and live-session guard, requires a separate confirmation after preview, invalidates edited proposals and retries uncertain results using the same request ID and command. It only reports success for a matching receipt and version. No production host injects this transport yet; approval remains off. Request retry state is in-memory only; durable recovery across reload, real session acceptance, catalogue read/bootstrap and full historical correction still remain.
