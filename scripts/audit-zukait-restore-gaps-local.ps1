#Requires -Version 5.1
<#
ZUKAIT restore gap audit, 2026-11-15.
OFFLINE ONLY: inspects encrypted local backup and successful local restore report.
Does NOT connect to PostgreSQL (local or remote), to Supabase, or modify data.
It uses pg_restore only in archive listing / SQL-file output mode without -d.
It does NOT verify or claim a complete Supabase application recovery.
#>
[CmdletBinding()]
param([string]$BackupRoot='Z:\Zukait-20261025')
$ErrorActionPreference='Stop'
Set-StrictMode -Version Latest
$pgRestore='C:\Program Files\PostgreSQL\17\bin\pg_restore.exe'
$root=[IO.Path]::GetFullPath($BackupRoot)
$core=Join-Path $root 'ZUKAIT-CORE-20261114-110718\workshop-core.dump'
$historyManifest=Join-Path $root 'ZUKAIT-HISTORY-CHUNKED\history-export-manifest.json'
$work=Join-Path $root 'ZUKAIT-LOCAL-RESTORE-REHEARSAL'
$restorePassed=Join-Path $work 'RESTORE-PASSED.json'
$triggerReport=Join-Path $work 'core-trigger-omissions.json'
$auditReport=Join-Path $work 'RECOVERY-GAPS-20261115.json'
$tempSchema=Join-Path $work 'core-public-schema-audit.tmp.sql'
foreach($file in @($pgRestore,$core,$historyManifest,$restorePassed,$triggerReport)){
    if(!(Test-Path -LiteralPath $file -PathType Leaf)){throw "Required local file missing: $file"}
}
$manifest=Get-Content -LiteralPath $historyManifest -Raw | ConvertFrom-Json
$restore=Get-Content -LiteralPath $restorePassed -Raw | ConvertFrom-Json
$triggers=Get-Content -LiteralPath $triggerReport -Raw | ConvertFrom-Json
if($manifest.project_ref -ne 'pjknotnjkufadqavcmii' -or
   $manifest.status -ne 'ALL_CHUNKS_COMPRESSED_AND_READ_BACK_VERIFIED' -or
   $restore.status -ne 'LOCAL_DATA_RECOVERY_WITH_TRIGGERS_OMITTED' -or
   [long]$manifest.expected_rows -ne [long]$restore.history_rows -or
   [long]$manifest.expected_rows -ne 16410){
   throw 'Existing archive/restore controls disagree. Stop; do not treat this as a verified recovery.'
}
# No database connection string is supplied to pg_restore.
$toc=@(& $pgRestore --list $core)
if($LASTEXITCODE -ne 0 -or $toc.Count -eq 0){throw 'Unable to list the core archive.'}
$tocEntries=@($toc | Where-Object {"$_" -match '^\s*\d+;\s+\d+\s+\d+\s+'})
$tocTriggers=@($tocEntries | Where-Object {"$_" -match '^\s*\d+;\s+\d+\s+\d+\s+TRIGGER\s+'})
if($tocTriggers.Count -lt 1 -or
   [int]$triggers.trigger_definitions_omitted -ne $tocTriggers.Count){
    throw 'Omitted trigger report does not match original archived trigger definitions.'
}
$schemaNames=@()
$referencedNamespaces=@()
try {
    # Writes SQL syntax (no table data) only to the encrypted audit folder.
    & $pgRestore --schema-only --file=$tempSchema $core
    if($LASTEXITCODE -ne 0){throw 'Could not read core schema-only SQL.'}
    $schemaSql=[IO.File]::ReadAllText($tempSchema)
    $referencedNamespaces=@([regex]::Matches($schemaSql,'(?i)\b(zukait_[a-z][a-z_0-9]*)\s*\.') |
      ForEach-Object {$_.Groups[1].Value.ToLowerInvariant()} | Sort-Object -Unique)
    $schemaNames=@([regex]::Matches($schemaSql,'(?im)^\s*CREATE\s+SCHEMA\s+(?:IF\s+NOT\s+EXISTS\s+)?(?:"?([a-z_][a-z0-9_]*)"?\s*;)') |
      ForEach-Object {$_.Groups[1].Value.ToLowerInvariant()} | Sort-Object -Unique)
}
finally {
    if(Test-Path -LiteralPath $tempSchema){Remove-Item -LiteralPath $tempSchema -Force}
}
# The report intentionally has no row data, passwords, customer data, or DB URL.
$report=[pscustomobject]@{
  status='LOCAL_DATA_RECOVERY_VERIFIED_FULL_APPLICATION_RECOVERY_NOT_VERIFIED'
  audit_at_utc=[DateTimeOffset]::UtcNow.ToString('o')
  database_connections_opened=0
  source='Local verified core dump, history manifest and local restore reports only'
  core_dump_bytes=(Get-Item -LiteralPath $core).Length
  core_toc_entries=$tocEntries.Count
  core_public_schema_definitions=@($schemaNames)
  core_trigger_count=$tocTriggers.Count
  archived_trigger_toc_entries=@($tocTriggers)
  external_zukait_schema_references_in_public_sql=@($referencedNamespaces)
  schema_reference_detection='Textual inventory only; not an exhaustive catalog dependency analysis'
  restored_history_rows=[long]$restore.history_rows
  history_cutoff=[long]$manifest.cutoff_revision
  uncovered_recovery_domains=@(
    'Non-public application schema definitions and table data (e.g. zukait_mechanical)',
    'Public triggers omitted in the local data-only recovery rehearsal',
    'Auth and storage systems, including stored object bytes',
    'Edge functions and secrets/configuration',
    'Consistent single-point-in-time recovery across separately exported backups',
    'Physical disk free space/IO headroom and application end-to-end restored function'
  )
  production_changes='NONE'
  recommended_next_step='When live system is healthy, perform a strictly read-only inventory of all non-public ZUKAIT schemas and approximate storage; then plan separate bounded backups.'
}
$report | ConvertTo-Json -Depth 8 | Set-Content -LiteralPath $auditReport -Encoding UTF8
Write-Host "OFFLINE RECOVERY GAP AUDIT COMPLETED - no database connection made"
Write-Host ("Original archive object entries: {0}" -f $tocEntries.Count)
Write-Host ("Public trigger definitions omitted locally: {0}" -f $tocTriggers.Count)
Write-Host ("Referenced ZUKAIT private schemas: {0}" -f ($referencedNamespaces -join ', '))
Write-Host ("Restored history records: {0}" -f $restore.history_rows)
Write-Host "REPORT: $auditReport"
Write-Warning 'Full application recovery is NOT yet verified. Do not delete live history or begin compact-mode cutover.'
