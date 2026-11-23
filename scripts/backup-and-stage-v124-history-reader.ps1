#Requires -Version 7
<#
ZUKAIT exact live workshop-api v124 source backup + OFFLINE history-reader stage.
No database connection, Supabase deploy, project restart, schema change,
history mode change, or deletion of previous backups.
Requires locally authenticated Supabase CLI (or supported npx fallback),
Node 22+ and unlocked encrypted Z: volume.
Version/hash drift is a hard failure, not automatic upgrade.
#>
[CmdletBinding()]
param()
Set-StrictMode -Version Latest
$ErrorActionPreference='Stop'
$root='Z:\Zukait-20261025'
if(!(Test-Path -LiteralPath $root -PathType Container)){
  throw 'Unlock encrypted Z: and ensure Z:\Zukait-20261025 exists.'
}
$node=Get-Command node -ErrorAction Stop
$version=(& $node.Source --version)
if($LASTEXITCODE -ne 0 -or $version -notmatch '^v([0-9]+)\.' -or [int]$Matches[1] -lt 22){
  throw 'Node 22 or newer is required for the isolated reader test.'
}
$backupScript=Join-Path $PSScriptRoot 'backup-zukait-live-edge-functions-v124-readonly.ps1'
$stageScript=Join-Path $PSScriptRoot 'stage-v124-history-reader-offline.mjs'
$readerTest=Join-Path (Split-Path $PSScriptRoot -Parent) 'tests\history-reader-rollout.mjs'
foreach($f in @($backupScript,$stageScript,$readerTest)){
  if(!(Test-Path -LiteralPath $f -PathType Leaf)){throw "Missing approved repository file: $f"}
}
$before=@(Get-ChildItem -LiteralPath $root -Directory -Filter 'ZUKAIT-EDGE-SOURCES-*' | ForEach-Object {$_.FullName})
Write-Host 'Creating new hash-verified read-only backup for deployed workshop-api v124 and other eight functions...'
& $backupScript
if(!$?){throw 'Edge backup did not complete; no reader stage attempted.'}
$candidates=@(Get-ChildItem -LiteralPath $root -Directory -Filter 'ZUKAIT-EDGE-SOURCES-*' | Where-Object {
  $before -notcontains $_.FullName -and
  (Test-Path -LiteralPath (Join-Path $_.FullName 'EDGE-SOURCE-BACKUP-PASSED.json') -PathType Leaf)
})
if($candidates.Count -ne 1){throw 'Expected exactly one new verified v124 backup; no stage attempted.'}
$backup=$candidates[0].FullName
$backupReport=Get-Content -LiteralPath (Join-Path $backup 'EDGE-SOURCE-BACKUP-PASSED.json') -Raw | ConvertFrom-Json
if($backupReport.project_ref -ne 'pjknotnjkufadqavcmii' -or
   $backupReport.pinned_inventory -ne 'EDGE_FUNCTION_LIVE_SOURCE_SHA256_20261115_V124.json' -or
   [int]$backupReport.function_count -ne 9 -or [int]$backupReport.file_count -ne 53){
  throw 'New backup inventory is not the exact expected live v124 release.'
}
$stamp=[DateTimeOffset]::UtcNow.ToString('yyyyMMdd-HHmmss')
$stage=Join-Path $root ('ZUKAIT-HISTORY-READER-V124-STAGE-'+$stamp+'-'+[Guid]::NewGuid().ToString('N').Substring(0,8))
& $node.Source $stageScript $backup $stage
if($LASTEXITCODE -ne 0){throw 'Offline staging or reader tests failed; do not deploy.'}
$reportPath=Join-Path $stage 'STAGE-PASSED.json'
if(!(Test-Path -LiteralPath $reportPath -PathType Leaf)){throw 'No PASS report. Do not deploy.'}
$report=Get-Content -LiteralPath $reportPath -Raw | ConvertFrom-Json
if($report.status -ne 'OFFLINE_V124_HISTORY_READER_CANDIDATE_AND_ROLLBACK_VERIFIED' -or
   [int]$report.source_file_count -ne 43 -or
   $report.production_approval -ne $false -or $report.production_changes -ne 'NONE'){
  throw 'Offline reader report invalid. Do not deploy.'
}
Write-Host 'SUCCESS: V124 SOURCE BACKUP + OFFLINE READER + EXACT ROLLBACK QUALIFIED'
Write-Host "Encrypted source backup: $backup"
Write-Host "Offline candidate and rollback: $stage"
Write-Host 'No production deployment, compact-history activation or database changes.'
