# Windows Server: safe Zukait production backup preparation

**Preparation only — this procedure has NOT been run against production.**
The Supabase project named `zukait-time-track-test` is actually **LIVE**:
`pjknotnjkufadqavcmii`. Never confuse it with the synthetic V305 QA project
`omqgkqknbdcnotabffek`.

## Why this is necessary

Zukait's organization is on Supabase Free. A 2026-10-10 read-only audit found
62 Job Cards, 214 assignments and 789 employee time sessions in the live
workshop, versus only 47 Jobs and 495 sessions in the most recent
`workshop_backups` row (dated October 3). This is **not a current disaster
recovery point**.

[Supabase's official backup guide](https://supabase.com/docs/guides/platform/backups)
recommends off-site backups for Free projects. The official
[platform-to-self-hosted guide](https://supabase.com/docs/guides/self-hosting/restore-from-platform)
requires separate `--role-only`, schema and `--data-only --use-copy` exports
using **Supabase CLI**, which filters Supabase-managed internal schemas.
Raw `pg_dump` is not interchangeable with these exports for a later
self-hosted Supabase migration.

## Prepare the trusted Windows computer

Install PowerShell 7, Docker Desktop or a supported Docker engine, and
Supabase CLI. Use a **private encrypted volume** with restricted NTFS
permissions and an off-site copy. Do not back up into a Git checkout, ordinary
shared folder, chat attachment or unencrypted USB drive.

Obtain the PostgreSQL connection string privately from the LIVE Supabase
project's **Connect** panel. It includes a password — never paste it into
ChatGPT, source control, CI logs or public documentation. Enter it locally as
a temporary process environment variable without printing the value:

```powershell
$env:ZUKAIT_PROD_DB_URL = Read-Host "Enter PRIVATE production PostgreSQL connection URI"
pwsh -File scripts/backup-zukait-production-readonly.ps1 -BackupRoot "E:\\ZukaitEncryptedBackups" -EncryptedOffsiteConfirmed
Remove-Item Env:\ZUKAIT_PROD_DB_URL
```

The helper checks that the URI identifies the *production* project, Docker and
Supabase CLI are available, and an encrypted off-site destination was explicitly
confirmed. It creates a unique new folder and exports `roles.sql`,
`schema.sql`, and `data.sql` with SHA-256 hashes and a separate manifest.
It **does not execute a restore, migration or any workshop write**.

The CLI receives the private URI in its process arguments (as required by the
documented `--db-url` interface); therefore execute only on a trusted machine
and close the session afterward. If any command fails, the helper does not
create a success manifest. Keep incomplete private exports secure until
reviewed.

## A successful export is NOT yet release approval

To satisfy the `fresh_backup_restored` release gate, a qualified operator
must restore this export to a **new separate disposable PostgreSQL/Supabase
instance** (never the live workshop or occupied QA project), compare counts,
sequence state, parts financials and employee time, and document evidence.
Supabase Storage **object bytes** and deployed **Edge function source/config**
are NOT contained in these three exports; preserve them separately. Auth,
custom roles, extensions, and integration compatibility need review during
restore. Record independent recovery timestamp and operator approval.

Leave `docs/INSURANCE_V305_ACCEPTANCE_GATE.json` set to `passed:false`
until the full verified restore and remaining production assets are covered.
