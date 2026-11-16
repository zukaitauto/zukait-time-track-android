# ZUKAIT — compact-history rollout release card
**Prepared:** 16 November 2026. **Scope:** production `pjknotnjkufadqavcmii`, branch `architecture-v2`. **State:** HOLD for production changes.

## One-command offline gate check

```sh
node scripts/check-compact-history-rollout.mjs
```

Current outcome is expected to be **HOLD**, exit code 2. This is deliberate: Supabase Dashboard reports the Micro project's **Disk I/O budget is close to exhaustion**. The report includes every remaining blocker. All 26 proof fields are in `docs/storage/COMPACT_HISTORY_RELEASE_EVIDENCE_20261116.json`. A reviewer may update evidence only after actually checking the source; an unchecked checkbox or an old success report is not proof. Even all fields marked verified produces **ELIGIBLE_FOR_SEPARATE_HUMAN_REVIEW**, never deploy authorization.

## Already qualified

- Current live `workshop-api` **v124**, SHA-256 `ebd48e18da452008048a67902a346b9b3ad67e9f85124aa48aaa2dae7e134f3e`; 43 source files, `verify_jwt=false`. Verify again immediately before any deployment.
- All twelve synthetic compact-history SQL groups passed in PGlite and PostgreSQL 17; LZ4 and default-off compatible reader tests passed.
- Synthetic 24-save benchmark compared LEGACY, DUAL and COMPACT. Small-change payload storage was ~95% smaller in COMPACT **in that fixture only**, not in live production.
- Live SQL history dependency inventory: twelve known archive writers; no unexpected SQL readers; nine Edge Function source bundles inspected. The only direct Edge history reader is `workshop-api/index.ts`, `baseStateForRevision`.
- Existing forward-only LZ4 compression already works for fresh snapshots, **not old space reclamation**.

## Release order: five separate authorizations

1. **LEGACY infrastructure** — after fresh coherent restore, off-site exact current v124 source backup/rollback, minimum 7-day Disk I/O balance and real disk/WAL headroom, install only the reviewed compact schema in **LEGACY** mode. Confirm default-off triggers, unchanged full snapshots and existing workflows. **No immediate history savings.**
2. **Compatible reader** — package from the exact 43-file **live** baseline with `scripts/prepare-history-reader-candidate.mjs`, keeping the 42 other files byte-identical and `coalesceContextReads:true`. Deploy only with explicit separate approval. Confirm `ZUKAIT_HISTORY_READER_COMPAT` defaults OFF, custom auth unchanged, and private RPC permission/round-trip tested before selectively opting in.
3. **Bounded DUAL observation** — only when there is actual I/O headroom; dual writes full and compact history and can **increase** WAL/disk usage. Monitor per-save duration, request failures, archive counts, revision integrity, and Disk I/O balance. Have a stop operator and time limit agreed before starting. Abort on any error, resource pressure or unexpected record.
4. **COMPACT capture** — only after full application acceptance (Manager, employee Start/Pause/Finish, ID001, Reception, Mechanical, QC, accounting) and dual revision integrity. Keep all older snapshots, preserve the compatible reader, verify old/current/compact-only revision reads and rollback to legacy writes. If compact-only revisions exist, **never redeploy the original legacy-only API v124 as the sole reader**: it cannot read those revisions.
5. **Legacy archive reclamation** — separate project with proven compact-only recovery, independent off-site old-history archive and verified retention/legal needs. No mass DELETE, `VACUUM FULL`, index rebuild or backfill until its own capacity and recovery plan is reviewed.

## Stop / rollback rules

- **Before DUAL/COMPACT:** on connection timeout, insufficient disk/WAL free space, low Disk I/O balance, elevated 5xx, new deployed API version, failure of any restore, or unverified role permissions, do not proceed. Do not restart Supabase for routine rollout.
- **During DUAL:** switch recording mode back to LEGACY only using reviewed operation; retain already written compact data and every legacy snapshot. Investigate integrity and stop further migration work.
- **During COMPACT:** mode rollback to LEGACY can restore full-snapshot writes for future saves, but does not recreate missing legacy-only revisions. Keep compatible reader and compact schema for existing compact-only reads until a separately proven recovery/export is complete.
- No database/Edge deployment, backup deletion, project restart, payment or production mode change is authorized by this release card.

## Current blockers: one decision, not endless procedures

The current decision is **HOLD** because (1) the dashboard has a live Disk I/O depletion warning, (2) physical free disk/WAL headroom isn't measured, (3) previous public/private PC backups were from different points in time with a local Vehicle audit mismatch, and (4) the exact current encrypted v124 off-platform backup and operational rollback are not yet verified. Supabase's online backup shown in the dashboard is not itself proof of coherent end-to-end recovery.

**Operator next evidence:** record the last seven days of Disk I/O balance (especially minimum), disk/WAL capacity, a verified coherent backup-restore and exact current Edge source rollback. No PC or payment is required to review this card and rerun GitHub synthetic checks.
