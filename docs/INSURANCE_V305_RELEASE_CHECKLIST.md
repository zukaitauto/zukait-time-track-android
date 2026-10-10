# V305 release checklist — preparation only

V305 / versionCode 268 is **NOT approved for staff publication**.
Branch: `architecture-v2`; never merge or modify `main` for this release.
This checklist does not authorize production mutation or bypass acceptance gates.

## Verified baseline

Read-only production inspection on 2026-10-10 confirmed:

- Production reference: `pjknotnjkufadqavcmii` (despite its test-like name).
- `workshop-api` version 58; `staff-auth` version 4, both active.
- Production migration history contains Reception Phase 1 as version
  `20261008205937`; none of the nine Phase 2 migrations below is installed.
  The repository Phase 1 filename is `20261008202932_reception_phase1.sql`.
  Do not reapply Phase 1 merely because those timestamps differ.
- Repository updater metadata remains V304 / 267; V305 release request remains
  `approvedForStaff=false`, with no source commit, approval date or nonce.
- Isolated QA reference: `omqgkqknbdcnotabffek`; synthetic data only.

Recheck these facts immediately before an approved rollout. A later branch head,
schema change or Edge deployment invalidates assumptions until reviewed.

## Gates that must be complete

| Gate | Required evidence | Current status |
| --- | --- | --- |
| Exact source | Application/backend source and final branch SHA recorded | Application source recorded in acceptance handoff; final release SHA pending |
| Automated verification | All Reception, PostgreSQL concurrency, API, JS and browser checks green | PASS at `7bc397b3`, run `38021866694` |
| Real QA workflows | Permissions, mutations, quantities, revisions, shared lists and audit counts | Selected scenarios passed; see handoff for exact scope |
| Fault recovery | Pending UUID/body retained, no optimistic success, no duplicate writes | 18 actual-client/real-HTTPS cases passed; physical and delivery-specific journal coverage pending |
| Physical Android | QA package, keyboard/back/rotation/background/restart and employee work flow | NOT_RUN |
| Physical iPhone/Mac Safari | Forms, tables, focus/scroll, restart/offline and two-device conflicts | NOT_RUN |
| Preservation | Nonempty unrelated work, parts, costs, consumables and financial history retained | QA baseline revision 32 vs 36 preserved existing job/work/estimates/expenses/consumables/users/leave arrays; comprehensive post-delivery matrix pending |
| Backup and recovery | Fresh production recovery point plus successful isolated recovery rehearsal | Isolated disposable PostgreSQL 17 dump/restore CI PASS at `2eb1aa26`; fresh production backup/recovery point NOT_RUN |
| Staff publication | User approval tied to exact candidate and acceptance evidence | NOT_GRANTED |

## Ordered coordinated activation

After all gates pass and the user approves the exact release:

1. Record release owner, rollout window, supported clients and write-pause method.
   Verify the write pause works; do not invent or assume an existing switch.
2. Record a fresh production recovery point, retention/PITR availability, schema
   and grant snapshots, Edge source/preimages, current sequence values and updater
   metadata. Store sensitive backups privately. Verify recovery in isolated QA.
3. Pause workshop writes under the approved operational plan. Preserve pending
   device journals; do not clear caches or discard unconfirmed employee work.
4. Apply the complete migration sequence below in order. Verify each recorded
   migration and its expected schema/grants before continuing. Do not deploy
   creation guards alone while the rest of the bundle is missing.
5. Deploy the reviewed staff-auth and complete workshop-api package, including
   every imported rule file and deno configuration. Verify production-owned key
   allowlists, active-session authentication and rejection of unauthorized keys.
6. Verify the signed APK package/certificate/version/source, the desktop build,
   and the common global vehicle data path. Run controlled authorized smoke tests
   without creating fake production customer records.
7. Publish only the explicitly approved client/updater metadata. Resume writes
   after checks pass; monitor role access, revision conflicts, errors and delivery
   synchronization. Keep previous artifacts and recovery evidence available.

## Migration manifest

All paths below are under `supabase/migrations/`. Hashes are SHA-256 of the
reviewed repository bytes; recompute before activation.

| Order | Filename | SHA-256 |
| --- | --- | --- |
| 1 | `20261009074037_reception_preliminary_parts.sql` | `cacea893064cf46c66600e53a47aaa595f0ed26d1f30f8ddeea3668a5933395f` |
| 2 | `20261009075901_reception_estimate_approval.sql` | `c0cd22af8686665cc376d672a50c5d4b31b25673a4d8105269e23a5b3f4a2e69` |
| 3 | `20261009084321_reception_job_creation_guards.sql` | `9022d4d5aa6fa15eda48a36d63d52e5c70278ea392446b45a15cc3119394d98f` |
| 4 | `20261009090923_reception_create_job.sql` | `aeff3ee01590f8bf81ef710073577a8f752ef6d1a49e7befbcc05cb6bafd7760` |
| 5 | `20261009094309_reception_vehicle_authority.sql` | `fffcd9d6b22fb2608b79dcf88a802f0e005bc6c69870da5f47a797bc2dd9486e` |
| 6 | `20261009104912_reception_additional_approvals.sql` | `f298a59d842106742c34b9753a5f5be1e51dbf5c818e962e47f36de20ad15c5a` |
| 7 | `20261009111840_reception_job_cancellation.sql` | `6abb88686c11e861987e8bf656871414aaa54e73a9dc741af982fe49a8efac74` |
| 8 | `20261009153713_reception_trigger_privileges.sql` | `d1ba72abd56888094170ff559b9200ac188677f40ca71347ee84b17a607def52` |
| 9 | `20261009175402_reception_receptionist.sql` | `74f6e18788e82ac075926a28d95af0143fb898ba6e29ec6ab3c71035e5d9954e` |

## Failure handling

Before new production writes: keep the write pause and use reviewed preimages or
finish the complete known bundle after diagnosis. Do not improvise function drops,
grant changes or guard bypasses.

After new writes: freeze affected operations, inventory committed request UUIDs,
rows and revisions, preserve audit/work/financial records, and reconcile pending
client responses. Prefer a verified forward fix. Backup/PITR restoration may lose
later work and requires explicit approval of the loss/reconciliation plan.
Never reset sequences to conceal gaps. Never clear device journals to hide errors.
