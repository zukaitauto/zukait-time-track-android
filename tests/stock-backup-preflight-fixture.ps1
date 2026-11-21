#Requires -Version 5.1
# Synthetic-only fixture: tests script statuses, never real workshop data.
Set-StrictMode -Version Latest
$ErrorActionPreference='Stop'
$preflight=Join-Path $PSScriptRoot '..\scripts\preflight-mechanical-stock-backup-readonly.ps1'
if(!(Test-Path -LiteralPath $preflight -PathType Leaf)){throw 'Missing preflight script'}
$root=Join-Path ([IO.Path]::GetTempPath()) ('zukait-preflight-fixture-'+[guid]::NewGuid().ToString('N'))
New-Item -ItemType Directory -Path $root | Out-Null
function Sha([string]$p){return (Get-FileHash -LiteralPath $p -Algorithm SHA256).Hash.ToLowerInvariant()}
function SaveManifest([string]$status){
 [ordered]@{
   project_ref='pjknotnjkufadqavcmii'
   status=$status;source_revision=15001;history_count=121;history_min=1;history_max=121
   chunk_rows=50
   core_file='operational-public-mechanical-vehicle.dump'
   core_sha256=(Sha (Join-Path $root 'operational-public-mechanical-vehicle.dump'))
   inventory_file='history-revisions.txt'
   inventory_sha256=(Sha (Join-Path $root 'history-revisions.txt'))
   ready_for_recovery=$false
 }|ConvertTo-Json -Depth 4|Set-Content -LiteralPath (Join-Path $root 'two-part-manifest.json') -Encoding UTF8
}
function AddChunk([int]$i){
 $start=$i*50;$end=[Math]::Min(120,$start+49)
 $name=('history-{0:D5}' -f $i)
 $zip=Join-Path $root ($name+'.csv.gz')
 [IO.File]::WriteAllBytes($zip,[byte[]]@(31,139,8,0,0,0,0,0,0,0,3,0,0,0,0,0,0,0,0,0))
 [ordered]@{
  file=$name+'.csv.gz';first=($start+1);last=($end+1);rows=($end-$start+1)
  sha256=(Sha $zip);bytes=(Get-Item -LiteralPath $zip).Length
 }|ConvertTo-Json -Depth 3|Set-Content -LiteralPath (Join-Path $root ($name+'.json')) -Encoding UTF8
}
function Report([switch]$Quick){
 $arglist=@('-NoProfile','-File',$preflight,'-SessionFolder',$root)
 if($Quick){$arglist+='-Quick'}
 $out=@(& pwsh @arglist 2>&1)
 if($LASTEXITCODE -ne 0){throw ('Unexpected error: '+($out -join [Environment]::NewLine))}
 return ($out -join [Environment]::NewLine)
}
function ExpectBlock([string]$reason){
 $out=@(& pwsh '-NoProfile' '-File' $preflight '-SessionFolder' $root 2>&1)
 if($LASTEXITCODE -eq 0){throw ('Expected fail-closed: '+$reason)}
 if(($out -join [Environment]::NewLine) -notmatch $reason){
   throw ('Wrong error: '+($out -join [Environment]::NewLine))
 }
}
try{
 [IO.File]::WriteAllBytes((Join-Path $root 'operational-public-mechanical-vehicle.dump'),
   [Text.Encoding]::UTF8.GetBytes('SYNTHETIC - NOT A VALID POSTGRES ARCHIVE'))
 [IO.File]::WriteAllLines((Join-Path $root 'history-revisions.txt'),
   [string[]]@(1..121|ForEach-Object {[string]$_}),[Text.Encoding]::ASCII)
 $pending='CORE_COMPLETE__HISTORY_NOT_EXPORTED__RESTORE_NOT_TESTED'
 $done='FILES_COMPLETE_AND_HASH_VERIFIED__ISOLATED_RESTORE_PENDING'
 SaveManifest $pending
 AddChunk 0;AddChunk 1
 $report=Report
 if($report -notmatch '2/3' -or $report -notmatch 'REMAINING CHUNKS: 1' -or
    $report -notmatch 'HISTORY_INCOMPLETE__ISOLATED_RESTORE_BLOCKED'){
   throw ('Incorrect incomplete classification: '+$report)
 }
 AddChunk 2
 $report=Report
 if($report -notmatch 'HISTORY_CHUNKS_PRESENT__FINAL_VERIFY_MANIFEST_PENDING'){
   throw ('Unfinalized manifest was certified: '+$report)
 }
 SaveManifest $done
 $report=Report
 if($report -notmatch 'BACKUP_FILE_HASHES_PASSED__ISOLATED_RESTORE_NOT_VERIFIED'){
   throw ('Complete file hash set not recognized: '+$report)
 }
 $report=Report -Quick
 if($report -notmatch 'METADATA_ONLY__SHA256_AND_ISOLATED_RESTORE_PENDING'){
   throw ('Quick mode certified a backup: '+$report)
 }
 $sidecar=Join-Path $root 'history-00000.json'
 $before=Sha $sidecar
 [IO.File]::AppendAllText((Join-Path $root 'history-00000.csv.gz'),'CORRUPT')
 ExpectBlock 'BACKUP PREFLIGHT BLOCKED'
 if((Sha $sidecar) -ne $before){throw 'Preflight modified sidecar'}
 $m=Get-Content -LiteralPath (Join-Path $root 'two-part-manifest.json') -Raw|ConvertFrom-Json
 $m.project_ref='wrong-project'
 $m|ConvertTo-Json -Depth 4|Set-Content -LiteralPath (Join-Path $root 'two-part-manifest.json') -Encoding UTF8
 ExpectBlock 'Project identity'
 Write-Host 'PASS: partial 2/3, final-manifest gate, SHA-256, quick-only gate, corruption and wrong-project denial.'
}finally{
 Remove-Item -LiteralPath $root -Recurse -Force -ErrorAction SilentlyContinue
}
