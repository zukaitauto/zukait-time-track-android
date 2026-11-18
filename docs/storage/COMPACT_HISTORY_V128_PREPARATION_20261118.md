# ZUKAIT compact-history reader — v128 offline preparation (18 November 2026)

**Scope:** `pjknotnjkufadqavcmii`, `architecture-v2` only. **State:** DEVELOPMENT/STAGING ONLY — production HOLD. No live writes, database migration, Edge deployment, restart, or source-rollback rehearsal performed.

## Verified live source baseline

- Live workshop-api v128; verify_jwt=false; import map enabled.
- 50 files (not the v124 43-file bundle); 49 modules must stay byte-identical.
- Exact live compressed bundle SHA-256: `d6d349a7a38881d23927c8f5c7ca8f2f89539e643c94e396b316b6ffa5e15901`.
- Exact live index.ts SHA-256: `90cb794e8f4160ada336587d4d5895a3a2c77d507d265dee205f467125d3a931`.
- SHA-256 and UTF-8 byte counts for all 50 files recorded in `scripts/history-reader-v128-lock.json`.
- Live Accountant API still matches the locked priced-parts module; existing `coalesceContextReads:true` must remain unchanged.
- Only `baseStateForRevision` may be spliced. `ZUKAIT_HISTORY_READER_COMPAT` defaults OFF; all other code, auth, Mechanical routes, Accounting and QC remain unchanged.

## Offline packet command (when an independently preserved live v128 readback is available)

```sh
node scripts/prepare-history-reader-candidate.mjs verified-v128-readback.json NEW-OUTPUT-DIRECTORY
node tests/history-reader-rollout.mjs NEW-OUTPUT-DIRECTORY/candidate-index.ts
```

The prepared output contains `candidate-bundle.json`, `rollback-v128-bundle.json`, `candidate-index.ts` and `review.json`. The output directory must not exist. Inputs must match the exact locked function identity, bundle digest, all 50 file names, byte counts and SHA-256 hashes. A changed deployment or altered source fails closed. An in-memory source comparison is **not** an encrypted off-platform backup or a tested operational rollback.

## Production blocks remain

1. Current coherent production public/private backup and isolated restore, with historical revisions checked.
2. Exact v128 source exported to independent encrypted storage and full rollback proven.
3. Physical free disk/WAL headroom plus at least seven days of disk-I/O balance and stability confirmed.
4. Separate approval for LEGACY-only schema followed by compatible reader rollout, then bounded DUAL/COMPACT phases.
5. Prior v124-only encrypted-PC staging tool is **not** suitable for v128 and must not be used to deploy. Do not enable DUAL/COMPACT, delete old snapshots, or perform large table rewrites while any blockers remain.

Synthetic tests do not authorize production. Recheck deployed `workshop-api` version and all 50 hashes before any future rollout; v129 or a changed v128 bundle requires new independent qualification.
