# ZUKAIT v123 — production-pinned scoped-read optimization qualification

**Status: exactly scoped patch prepared and checked against the live deployed v123 source. NOT DEPLOYED. No production restart or application mutation.**

## What was verified

On 2026-11-15, the Supabase Edge Function management readback returned:

- Project `pjknotnjkufadqavcmii`, deployed `workshop-api` **v123**, `ACTIVE`.
- Deployed bundle SHA256: `edf5131f3b1394afe3ecff52d4d45c72680f8462889b07a1cfd871e9d374d68a`.
- 43 deployed files including `deno.json`; actual deployed `index.ts` length 147,074 characters.
- `architecture-v2` development `index.ts` length 159,151 characters, with numerous unrelated differences. **Do not deploy the full development source over v123 as an optimization hotfix.**
- Read-only, single-row production SQL confirms `data->'jobs'`, `data->'assign'` and `data->'sessions'` are JSON arrays. No changes made.

## Measured serialization, not measured EBS I/O

Read-only SQL `octet_length(data::text)` and selected projections for the single `public.workshop_state` row (id `main`) returned:

| Data selection | UTF-8 JSON bytes (current snapshot) | Relative to full JSON |
| --- | ---: | ---: |
| `data` (whole state) | 9,673,885 | 100% |
| `data->'jobs'` (Insurance dashboard) | 352,403 | ~3.64% |
| `data->'jobs'` + `data->'assign'` + `data->'sessions'` (Reception delivery list) | 1,407,540 | ~14.55% |

This suggests about **96.4% less serialized JSON** in the Insurance read and about **85.5% less** in the Reception delivery read, excluding unchanged response wrappers. It is **not a measured decrease in physical reads, temp writes, WAL, latency or EBS I/O credits**. PostgreSQL still reads the underlying large JSON value, and HTTP compression/transport may change actual bytes transferred.

## Exact deployed v123 patch

Staged, *not applied*: `docs/storage/WORKSHOP_API_V123_SCOPED_READ_ONLY.patch`.

This file is a standard three-hunk unified diff relative to the **actual live deployed v123** `index.ts`, not relative to `architecture-v2` and not a complete replacement bundle. It:

1. Projects `jobs:data->jobs` on **Manager Insurance dashboard read**, retaining the same Manager check, filters, separate reception/insurance queries and `insuranceProjection`.
2. Projects `jobs:data->jobs,assign:data->assign,sessions:data->sessions` for **Receptionist delivery list read**, retaining its Receptionist role check, stage/QC calculations.
3. Preserves the **entire `receptionist_deliver` write path**, its full-state `revision,data` read, server CAS and retry. Preserves the Insurance LPO write path and all other action dispatches.

**Verification method:** The live v123 source was inspected through read-only Supabase management APIs; each of the source replacement targets matched exactly once. The three-hunk diff was programmatically applied back to the same in-memory live source and its result matched exactly the expected three substitutions. The patch contains **three deleted source lines and 15 added lines**, with no write-path edits. A separate readback of the committed patch confirmed its three hunks and no write-path additions. No deployed source bodies, tokens, or runtime secrets were saved in the GitHub repository.

## Test evidence and limits

- The corresponding `architecture-v2` implementation and synthetic regression `tests/read-only-projection-io.mjs` passed in the GitHub functional smoke suite, run [43718761420](https://github.com/zukaitauto/zukait-time-track-android/actions/runs/43718761420), using commit `7143f6f705eb242e517d414ca3271f4745814403`.
- That CI test exercised **the development source**. The exact v123 patch has been source-validated against the live deployed file, **not runtime-exercised by a complete 43-file v123 build in isolation**. Do not infer integration qualification is complete.
- Deployed `workshop-api` remained at **v123**, unchanged after this exercise.

## Release gate for a future isolated hotfix

- Confirm deployed `workshop-api` is **still v123 with the exact above SHA256**. Reject the patch on any deployment drift; never apply it to an arbitrary development branch.
- Reconstruct a new *isolated* local copy from the 43-file deployment source already saved on the encrypted Z: drive; do not edit the only verified backup. Apply only the three-hunk patch to that clone.
- Run the synthetic read-projection tests **against the actual reconstructed/patched v123 bundle** and targeted existing Insurance, Reception and permission/CAS regressions. Recheck that the output schema and role checks are identical.
- Avoid deploying other features and never rewrite `workshop_state_history` or introduce the compact-history schema. Require a clearly identified, separately approved release with a rollback artifact and post-deployment response/latency checks.
- Complete actual physical disk and EBS Disk I/O burst balance verification before any heavyweight database work; those values are not exposed through the connected SQL/metadata tools.

**Decision:** Minimal patch staged; not released. History compaction/dual-write, large rewrite, new indexes and unnecessary Supabase restart all remain on hold.
