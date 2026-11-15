# ZUKAIT — exact workshop-api v123 offline runtime qualification packet

**Status: prepared on `architecture-v2`, not yet executed on the operator PC.** No database/Edge deployment or infrastructure change occurred.

## Source and safety boundary

- Project: `pjknotnjkufadqavcmii`.
- Deployed function: `workshop-api` v123, source bundle SHA-256 `edf5131f3b1394afe3ecff52d4d45c72680f8462889b07a1cfd871e9d374d68a`.
- Previously backed up and verified on the encrypted Z: drive: `Z:\Zukait-20261025\ZUKAIT-EDGE-SOURCES-20261115-124648-f701d082`. The expected `EXPECTED-LIVE-SOURCE-SHA256.json` file already exists in this folder. No new download of deployed source and no Supabase credentials are required.
- Minimal source-only patch: `docs/storage/WORKSHOP_API_V123_SCOPED_READ_ONLY.patch` (three hunks, v123 `index.ts` only). No full `architecture-v2` deployment is permitted.
- Exact backup `index.ts` SHA-256: `7288382735de10de0ab44c60cec013ad998f6a98d899129c1aea0d3eceb0964e`.

## Offline runner and test isolation

- `scripts/verify-v123-scoped-read-isolated.mjs` is an **offline** Node.js 22+ checker. It SHA-256 verifies all 43 source files on encrypted Z: against the pinned source inventory; does not execute arbitrary network imports, does not read credentials, and does not upload source code. It uses local v123 QC, Insurance and Reception JS rule modules.
- The checker applies the three-hunk diff **only in memory** to the exact backed-up v123 `index.ts`; rejects unexpected source hashes, changed paths, changed hunk context or source modifications.
- It runs **7 synthetic API cases** against mocked original and patched v123 handlers: Insurance jobs/pending/WIP, Receptionist delivery list, denied Receptionist Insurance access, denied Manager Receptionist-only access, and denial of a forged field. It compares JSON response status/bodies and checks the observed PostgREST field selectors. Mocks fail if network, RPC or database writes are attempted. The local source snapshot remains unchanged.
- The checker writes a **non-sensitive** test report under the Windows temporary directory and the one-command PowerShell wrapper copies that report to a new `Z:\Zukait-20261025\ZUKAIT-V123-RUNTIME-TEST-*` folder **only if all checks pass**. It does not modify the encrypted source archive.
- `scripts/run-v123-scoped-read-offline-check.ps1` is the Windows wrapper. It fetches **only the public pinned checker and patch** over HTTPS from the GitHub commit, then runs the actual validation offline against the existing encrypted Z: archive. It requires Node.js 22+ available on PATH. No paid services or Supabase CLI login.
- Runner self-check (`--self-test`) exercises its fail-closed diff parser and 6 synthetic mocked development-branch API cases in GitHub full functional CI. This **cannot replace** the exact deployed v123 offline runtime test.

## Current verification state

- GitHub source readback confirms the runner is staged on `architecture-v2`.
- The GitHub [functional smoke-test run #43722088802](https://github.com/zukaitauto/zukait-time-track-android/actions/runs/43722088802) **completed successfully**. Its job log explicitly contains `PASS: offline v123 verifier parser + 6 mocked API runtime self-checks (NOT deployed v123).` **This only qualifies the runner against development source**, not the actual v123 backup.
- An earlier source-only qualification programmatically applied the three-hunk patch to the in-memory v123 source readback and confirmed it matched exactly the three expected substitutions. See `WORKSHOP_API_V123_SCOPED_READ_QUALIFICATION_20261115.md`.
- **Operator PC isolated v123 run remains PENDING.** Do not report its seven runtime cases as passing until the user supplies the completed test report.

## Release boundary

No production deployment, migration, restart, bulk index creation, JSON-history compaction, legacy history deletion or new EBS I/O load is authorized in this test. Even if the test succeeds, it is synthetic validation, not evidence of runtime performance improvement on production, cloud I/O burst balance, or a substitute for explicit release approval. Physical disk and EBS Disk I/O headroom are still unverified.
