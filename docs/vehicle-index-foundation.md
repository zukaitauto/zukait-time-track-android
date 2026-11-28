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
