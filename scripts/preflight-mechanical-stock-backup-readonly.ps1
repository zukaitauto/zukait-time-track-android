#Requires -Version 5.1
<#
ZUKAIT STOCK RELEASE -- OFFLINE BACKUP PREFLIGHT, READ-ONLY.
Reads an EXISTING encrypted-drive two-part export; NO database/network access.
Does not export, restore, modify, rename, remove, or update any files.
-Quick checks metadata/structure only (NOT cryptographic integrity).
Default verifies SHA-256 of core, revision inventory and every present chunk.
The result NEVER certifies a successful isolated restore or full Supabase recovery.
#>
[CmdletBinding()]
param(
  [string]$SessionFolder='Z:\Zukait-20261025\ZUKAIT-TWO-PART-20261118-085525-05bc29',
  [switch]$Quick
)
Set-StrictMode -Version Latest
$ErrorActionPreference='Stop'
$project='pjknotnjkufadqavcmii'
$completeStatus='FILES_COMPLETE_AND_HASH_VERIFIED__ISOLATED_RESTORE_PENDING'
$inProgressStatus='CORE_COMPLETE__HISTORY_NOT_EXPORTED__RESTORE_NOT_TESTED'
function Fail([string]$message) { throw ("BACKUP PREFLIGHT BLOCKED: "+$message) }
function RequiredLeaf([string]$path) {
  if(!(Test-Path -LiteralPath $path -PathType Leaf)){Fail ("Missing file: "+[IO.Path]::GetFileName($path))}
  $file=Get-Item -LiteralPath $path
  if($file.Length -le 0){Fail ("Empty file: "+$file.Name)}
  return $file
}
function SafeFile([string]$name) {
  if([string]::IsNullOrWhiteSpace($name) -or
      [IO.Path]::GetFileName($name) -cne $name -or
      $name -match '[\\/]' -or
      $name -in @('.','..')){Fail 'Unsafe or missing filename in backup manifest'}
  return (Join-Path $root $name)
}
function AssertSha([string]$path,[string]$expected) {
  if($expected -notmatch '^[0-9a-fA-F]{64}$'){Fail ('Invalid SHA256 value for '+[IO.Path]::GetFileName($path))}
  if(!$Quick) {
    $actual=(Get-FileHash -LiteralPath $path -Algorithm SHA256).Hash
    if($actual -ine $expected){Fail ('SHA256 mismatch: '+[IO.Path]::GetFileName($path))}
  }
}
if(!(Test-Path -LiteralPath $SessionFolder -PathType Container)){
  Fail 'Backup folder is not available. Unlock the encrypted Z: drive on your PC.'
}
$root=(Resolve-Path -LiteralPath $SessionFolder).ProviderPath
$manifestPath=Join-Path $root 'two-part-manifest.json'
[void](RequiredLeaf $manifestPath)
$m=Get-Content -LiteralPath $manifestPath -Raw | ConvertFrom-Json
if($m.project_ref -ne $project){Fail 'Project identity does not match ZUKAIT production backup'}
if($m.status -notin @($completeStatus,$inProgressStatus)){Fail 'Unrecognized or incomplete backup manifest status'}
if([long]$m.source_revision -lt 1 -or [long]$m.history_count -lt 1 -or
   [long]$m.chunk_rows -ne 50){Fail 'Invalid revision inventory or expected 50-row chunk structure'}
if($m.ready_for_recovery -eq $true){Fail 'Unexpected recovery-ready status before an isolated restore'}

$corePath=SafeFile ([string]$m.core_file)
$inventoryPath=SafeFile ([string]$m.inventory_file)
[void](RequiredLeaf $corePath)
[void](RequiredLeaf $inventoryPath)
AssertSha $corePath ([string]$m.core_sha256)
AssertSha $inventoryPath ([string]$m.inventory_sha256)
$rawIds=@(Get-Content -LiteralPath $inventoryPath)
if($rawIds.Count -ne [long]$m.history_count){Fail 'Revision inventory does not match source manifest'}
$ids=[Collections.Generic.List[long]]::new()
[long]$previous=0
foreach($raw in $rawIds){
  if("$raw" -notmatch '^\d+$'){Fail 'Non-numeric revision in inventory'}
  [long]$id=[long]$raw
  if($id -le $previous){Fail 'Inventory revisions are not strictly increasing'}
  $ids.Add($id); $previous=$id
}
if($ids.Count -lt 1){Fail 'Empty revision inventory'}
if([long]$m.history_min -ne $ids[0] -or [long]$m.history_max -ne $ids[$ids.Count-1]){
  Fail 'History minimum/maximum revision mismatch'
}
$expected=[int][Math]::Ceiling($ids.Count/50.0)
if($expected -lt 1 -or $expected -gt 100000){Fail 'Unexpected number of history chunks'}
[int]$present=0
[int]$firstMissing=-1
for([int]$i=0;$i -lt $expected;$i++){
  $name=('history-{0:D5}' -f $i)
  $sidecar=Join-Path $root ($name+'.json')
  $archive=Join-Path $root ($name+'.csv.gz')
  $hasSidecar=Test-Path -LiteralPath $sidecar -PathType Leaf
  $hasArchive=Test-Path -LiteralPath $archive -PathType Leaf
  if(!$hasSidecar -and !$hasArchive){
    if($firstMissing -lt 0){$firstMissing=$i}
    continue
  }
  if(!$hasSidecar -or !$hasArchive){Fail ("Orphaned history chunk file: "+$name)}
  if($firstMissing -ge 0){Fail ("History gap: later chunk found after missing chunk "+($firstMissing+1))}
  [void](RequiredLeaf $sidecar)
  $zipItem=RequiredLeaf $archive
  $meta=Get-Content -LiteralPath $sidecar -Raw | ConvertFrom-Json
  $start=$i*50; $end=[Math]::Min($ids.Count-1,$start+49)
  if([long]$meta.first -ne $ids[$start] -or
     [long]$meta.last -ne $ids[$end] -or
     [long]$meta.rows -ne ($end-$start+1) -or
     [string]$meta.file -cne ($name+'.csv.gz') -or
     [long]$meta.bytes -ne [long]$zipItem.Length){
    Fail ("History chunk metadata/size mismatch: "+$name)
  }
  AssertSha $archive ([string]$meta.sha256)
  $present++
}
$remaining=$expected-$present
Write-Output ('ZUKAIT BACKUP CHUNKS: '+$present+'/'+$expected+' verified'+$(if($Quick){' (metadata only)'}else{' (SHA256)'}))
Write-Output ('REMAINING CHUNKS: '+$remaining)
Write-Output ('SOURCE REVISION: '+$m.source_revision)
if($remaining -gt 0) {
  if($m.status -eq $completeStatus){Fail 'Manifest says complete but chunks are missing'}
  Write-Output ('NEXT CHUNK: '+($present+1)+'/'+$expected)
  Write-Output 'STATUS: HISTORY_INCOMPLETE__ISOLATED_RESTORE_BLOCKED'
  exit 0
}
if($m.status -ne $completeStatus){
  Write-Output 'STATUS: HISTORY_CHUNKS_PRESENT__FINAL_VERIFY_MANIFEST_PENDING'
  exit 0
}
if($Quick){
  Write-Output 'STATUS: METADATA_ONLY__SHA256_AND_ISOLATED_RESTORE_PENDING'
  exit 0
}
Write-Output 'STATUS: BACKUP_FILE_HASHES_PASSED__ISOLATED_RESTORE_NOT_VERIFIED'
Write-Output 'NEXT: Use the existing LOCAL-ONLY restore script on a fresh isolated PostgreSQL 17 database.'
Write-Output 'IMPORTANT: This is application backup file verification, NOT full Supabase/Auth/Storage recovery.'
