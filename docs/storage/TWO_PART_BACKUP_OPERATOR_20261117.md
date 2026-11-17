# ZUKAIT two-part backup after failed 17 Nov 2026 full pg_dump

**Prepared, not executed against production.** The previous 17 Nov pgAdmin full backup disconnected while copying `public.workshop_state_history` after 8,807.85 seconds. Do not use that partial dump as a recovery archive. Preserve the existing October/November verified archives.

## Purpose and limits

The new operator scripts are:

- `scripts/backup-zukait-two-part.ps1` — phases `Core`, `History`, `Verify`.
- `scripts/restore-zukait-two-part-isolated.ps1` — **localhost PostgreSQL 17 only**.

Part A is a **single pg_dump snapshot** of public, zukait_mechanical and zukait_vehicle, including the history table definition but excluding that one table's DATA. The script reads the workshop revision before and after, and refuses to attest to a stable revision if it changed.

Part B exports archived revisions below that core revision in **50-row batches** by default, using raw byte-safe CSV streaming and GZIP. Each batch has a SHA-256 sidecar. An interrupted run can be restarted and verified chunks are skipped. The initial revision list is recorded and rechecked for source membership changes. Source revision gaps, if any, are recorded.

**This is not one atomic multi-part MVCC snapshot**: a staged core dump and later history slices cannot claim identical database snapshot times. History immutability and consistency must be proven by a successful isolated restore and application validation. The scripts never declare a complete Supabase backup. Supabase Auth managed schemas, Storage object bytes, deployment assets, database roles and secrets are out of scope.

Do not restart an export automatically after production disconnects, or run it during working hours, low EBS I/O balance, or repeated 57014/522 errors. Manual confirmation is required at each export phase. Both scripts use existing PostgreSQL 17 tools, without purchasing upgrades. An existing unlocked encrypted Z: drive with ample free space is required.

## Operator commands — run on the Windows backup PC after workshop hours

Open PowerShell in the repository root on branch `architecture-v2`. PostgreSQL 17 tools must exist at `C:\Program Files\PostgreSQL\17\bin`. The default production endpoint is the **ap-south-1 Supabase Session Pooler**. The direct host can be selected explicitly with the matching `-DbUser postgres`, but direct IPv6 connectivity depends on the PC network.

**Part A** — only after production is healthy, off-hours and with disk I/O headroom:

```powershell
powershell.exe -NoProfile -ExecutionPolicy Bypass -File .\scripts\backup-zukait-two-part.ps1 -Phase Core
```

The script requests the database password locally without displaying it. Type `CORE` only if the workshop is stable. It prints the new folder (for example `Z:\Zukait-20261025\ZUKAIT-TWO-PART-...`).

**Part B** — use the *exact folder printed by Part A*. If connectivity fails, do not repeat Part A; resume the incomplete history phase after stability returns.

```powershell
powershell.exe -NoProfile -ExecutionPolicy Bypass -File .\scripts\backup-zukait-two-part.ps1 -Phase History -SessionFolder "Z:\Zukait-20261025\ZUKAIT-TWO-PART-YOUR-FOLDER"
```

**Offline hash/coverage verification** — no Supabase connection:

```powershell
powershell.exe -NoProfile -ExecutionPolicy Bypass -File .\scripts\backup-zukait-two-part.ps1 -Phase Verify -SessionFolder "Z:\Zukait-20261025\ZUKAIT-TWO-PART-YOUR-FOLDER"
```

The final file manifest states `FILES_COMPLETE_AND_HASH_VERIFIED__ISOLATED_RESTORE_PENDING`. It is **not** permission to publish V401 or delete archived history.

## Local isolated recovery rehearsal

Create a new **empty local** PostgreSQL 17 database manually, named beginning `zukait_restore_`:

```powershell
& "C:\Program Files\PostgreSQL\17\bin\createdb.exe" -h 127.0.0.1 -U postgres zukait_restore_two_part
powershell.exe -NoProfile -ExecutionPolicy Bypass -File .\scripts\restore-zukait-two-part-isolated.ps1 -SessionFolder "Z:\Zukait-20261025\ZUKAIT-TWO-PART-YOUR-FOLDER" -LocalDatabase zukait_restore_two_part
```

The restore script **refuses non-local hosts and nonempty application schemas**. It verifies the core checksum, every chunk checksum, the restored authoritative workshop revision, every archived revision against the original membership inventory and all validated foreign keys. It does not delete other databases. The operator must enter `RESTORE` and the **local** database password.

If extension/role dependencies prevent restoring a complete app database, the check fails rather than reporting success. Additional application-level smoke tests, cross-schema Vehicle audit relationships, client authentication integration, and complete Supabase Auth/Storage/Edge recovery remain separate requirements.

## Release and incident rules

- Original older backup sets and failed 17 Nov files remain untouched.
- No source, SQL migration, compact-history mode or production record is modified by preparation.
- Never run `pg_restore` with a production host.
- After a real full restore and operational verification, update the V401 recovery evidence. Until then `releaseHeldByOwner=true`.
