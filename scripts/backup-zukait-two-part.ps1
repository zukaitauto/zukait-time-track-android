#Requires -Version 5.1
<#
ZUKAIT TWO-PART RECOVERY EXPORT — OPERATOR ONLY.
Part A: one pg_dump for public + zukait_mechanical + zukait_vehicle with
public.workshop_state_history DATA excluded (its table definition is kept).
Part B: resumable ordered CSV/GZIP history batches, each checksummed.
NEVER modifies production; never deletes existing backup sets.
NOT an atomic cross-part snapshot. Recovery acceptance requires isolated restore,
revision inventory check, and app-schema/vehicle-FK validation.
Run only after workshop hours when Supabase I/O and database are healthy.
#>
[CmdletBinding()]
param(
 [ValidateSet('Core','History','Verify')][string]$Phase='Core',
 [string]$BackupRoot='Z:\Zukait-20261025',
 [string]$SessionFolder='',
 [ValidateRange(1,100)][int]$ChunkRows=50,
 [string]$DbHost='aws-0-ap-south-1.pooler.supabase.com',
 [string]$DbUser='postgres.pjknotnjkufadqavcmii',
 [ValidateRange(1,65535)][int]$DbPort=5432,
 [string]$PgBin='C:\Program Files\PostgreSQL\17\bin'
)
Set-StrictMode -Version Latest
$ErrorActionPreference='Stop'
$project='pjknotnjkufadqavcmii'
$dump=Join-Path $PgBin 'pg_dump.exe'
$restore=Join-Path $PgBin 'pg_restore.exe'
$psql=Join-Path $PgBin 'psql.exe'

function HashFile([string]$file) {
 $sha=[Security.Cryptography.SHA256]::Create()
 $stream=[IO.File]::OpenRead($file)
 try {return ([BitConverter]::ToString($sha.ComputeHash($stream))).Replace('-','').ToLowerInvariant()}
 finally {$stream.Dispose();$sha.Dispose()}
}
function WriteJson([string]$path,$obj) {
 $tmp=$path+'.writing'
 $data=$obj|ConvertTo-Json -Depth 12
 [IO.File]::WriteAllText($tmp,$data,[Text.Encoding]::UTF8)
 Move-Item -LiteralPath $tmp -Destination $path -Force
}
function GetLines([string]$sql) {
 $output=@(& $psql '-X' '-q' '-t' '-A' '-w' '-v' 'ON_ERROR_STOP=1' '-h' $DbHost '-p' ([string]$DbPort) '-U' $DbUser '-d' 'postgres' '-c' $sql)
 if($LASTEXITCODE -ne 0){throw 'PostgreSQL read failed. Stop this backup; do not repeatedly retry on a busy project.'}
 return $output
}
function GetRevision() {
 $rows=@(GetLines "SELECT revision FROM public.workshop_state WHERE id='main'")
 if($rows.Count -ne 1 -or "$($rows[0])" -notmatch '^[0-9]+$'){throw 'Could not establish workshop snapshot revision.'}
 return [long]$rows[0]
}
function GetHistoryIds([long]$before) {
 $rows=@(GetLines "SELECT revision FROM public.workshop_state_history WHERE revision < $before ORDER BY revision")
 $result=New-Object System.Collections.Generic.List[long]
 foreach($v in $rows) {
  if("$v" -notmatch '^[0-9]+$'){throw 'Unexpected history revision list response.'}
  $n=[long]$v
  if($result.Count -gt 0 -and $n -le $result[$result.Count-1]){throw 'Duplicate/out-of-order history revisions.'}
  $result.Add($n)
 }
 if($result.Count -lt 1){throw 'No archived revisions returned; do not declare a complete history backup.'}
 return $result.ToArray()
}
function AssertLocation() {
 if($Phase -eq 'Core'){$folder=$BackupRoot}else{$folder=$SessionFolder}
 if([string]::IsNullOrWhiteSpace($folder)){throw 'For History or Verify specify -SessionFolder.'}
 $resolved=[IO.Path]::GetFullPath($folder)
 if(-not $resolved.StartsWith('Z:\',[StringComparison]::OrdinalIgnoreCase)){throw 'Use unlocked encrypted Z: drive only.'}
 if(-not (Test-Path -LiteralPath $resolved -PathType Container)){throw 'Backup folder does not exist.'}
 if($Phase -eq 'Core'){
  $drive=Get-PSDrive -Name Z -ErrorAction Stop
  if($null -ne $drive.Free -and $drive.Free -lt 8GB){throw 'Less than 8 GB available on encrypted drive. No backup started.'}
 }
 return $resolved
}
function AssertTools() {
 foreach($file in @($dump,$restore,$psql)){
  if(-not (Test-Path -LiteralPath $file -PathType Leaf)){throw "PostgreSQL 17 executable missing: $file"}
  $version=& $file --version
  if($LASTEXITCODE -ne 0 -or $version -notmatch '\b17[.]'){throw "PostgreSQL 17 required: $file"}
 }
}
function ConfigureConnection() {
 if($DbHost -eq 'db.pjknotnjkufadqavcmii.supabase.co'){
  if($DbUser -ne 'postgres'){throw 'Direct host requires the postgres user.'}
 } elseif($DbHost -eq 'aws-0-ap-south-1.pooler.supabase.com'){
  if($DbUser -ne ('postgres.'+$project)){throw 'Pooler host requires the project-scoped postgres user.'}
 } else {throw 'Refusing connection to an unapproved host.'}
 $env:PGSSLMODE='require'
 $env:PGCONNECT_TIMEOUT='10'
 $env:PGAPPNAME='zukait-two-part-operator-readonly'
 $env:PGOPTIONS='-c default_transaction_read_only=on -c lock_timeout=3000 -c statement_timeout=90000'
 $password=Read-Host 'Production database password (hidden; do not paste into chat)' -AsSecureString
 $ptr=[Runtime.InteropServices.Marshal]::SecureStringToBSTR($password)
 try {$env:PGPASSWORD=[Runtime.InteropServices.Marshal]::PtrToStringBSTR($ptr)}
 finally {[Runtime.InteropServices.Marshal]::ZeroFreeBSTR($ptr)}
 if([string]::IsNullOrWhiteSpace($env:PGPASSWORD)){throw 'Empty password.'}
}
function ExportCsvRaw([long]$from,[long]$through,[string]$output) {
 # Direct byte streaming avoids Windows PowerShell 5.1 text redirection/encoding.
 $sql="COPY (SELECT revision,data,updated_at,updated_by,archived_at FROM public.workshop_state_history WHERE revision >= $from AND revision <= $through ORDER BY revision) TO STDOUT WITH (FORMAT csv)"
 $psi=New-Object System.Diagnostics.ProcessStartInfo
 $psi.FileName=$psql
 $psi.Arguments='-X -q -w -v ON_ERROR_STOP=1 -h "'+$DbHost+'" -p '+$DbPort+' -U "'+$DbUser+'" -d postgres -c "'+$sql+'"'
 $psi.UseShellExecute=$false
 $psi.CreateNoWindow=$true
 $psi.RedirectStandardOutput=$true
 $psi.RedirectStandardError=$true
 $proc=[Diagnostics.Process]::Start($psi)
 try {
  $file=[IO.File]::Create($output)
  try {$proc.StandardOutput.BaseStream.CopyTo($file)}finally {$file.Dispose()}
  $err=$proc.StandardError.ReadToEnd()
  $proc.WaitForExit()
  if($proc.ExitCode -ne 0){throw ('History COPY failed for '+$from+'-'+$through+': '+$err.Substring(0,[Math]::Min(300,$err.Length)))}
 } finally {$proc.Dispose()}
}
function CompressCsv([string]$sourcePath,[string]$destinationPath) {
 # $input is an automatic PowerShell pipeline variable: never use it as a parameter.
 if([string]::IsNullOrWhiteSpace($sourcePath) -or [string]::IsNullOrWhiteSpace($destinationPath)){
  throw 'History compressor requires explicit source and destination paths.'
 }
 $infile=[IO.File]::OpenRead($sourcePath)
 try {
  $outfile=[IO.File]::Create($destinationPath)
  try {
   $zip=[IO.Compression.GZipStream]::new($outfile,[IO.Compression.CompressionMode]::Compress)
   try {$infile.CopyTo($zip)}finally {$zip.Dispose()}
  } finally {$outfile.Dispose()}
 } finally {$infile.Dispose()}
}
$root=AssertLocation
if($Phase -eq 'Verify' -and [string]::IsNullOrWhiteSpace($SessionFolder)){throw 'Verify needs -SessionFolder.'}
if($Phase -ne 'Verify'){AssertTools;ConfigureConnection}
try {
 if($Phase -eq 'Core'){
  Write-Host 'ONLY run after hours on a healthy database. A long export can harm workshop connectivity.'
  if((Read-Host 'Type CORE to start the smaller read-only export') -cne 'CORE'){throw 'Operator cancelled; production unchanged.'}
  $stamp=[DateTimeOffset]::UtcNow.ToString('yyyyMMdd-HHmmss')
  $root=Join-Path $root ('ZUKAIT-TWO-PART-'+$stamp+'-'+[guid]::NewGuid().ToString('N').Substring(0,6))
  New-Item -ItemType Directory -Path $root -ErrorAction Stop|Out-Null
  $before=GetRevision
  $archive=Join-Path $root 'operational-public-mechanical-vehicle.dump'
  $args=@('-w','-h',$DbHost,'-p',"$DbPort",'-U',$DbUser,'-d','postgres',
   '--format=custom','--compress=1','--serializable-deferrable','--no-owner','--no-acl',
   '--lock-wait-timeout=3000','--schema=public','--schema=zukait_mechanical',
   '--schema=zukait_vehicle','--exclude-table-data=public.workshop_state_history',
   ('--file='+$archive))
  & $dump @args
  if($LASTEXITCODE -ne 0){throw 'Core pg_dump failed. Archive is INCOMPLETE; do not use.'}
  $after=GetRevision
  if($before -ne $after){throw 'Workshop revision changed during core export. No coherent source point can be certified; retain file for investigation.'}
  $toc=@(& $restore '--list' $archive)
  if($LASTEXITCODE -ne 0 -or $toc.Count -lt 80){throw 'Core archive TOC is invalid.'}
  foreach($required in @('TABLE DATA public workshop_state ','TABLE public workshop_state_history ')){
   if(-not ($toc|Where-Object {$_ -like ('*'+$required+'*')})){throw "Missing required core archive entry: $required"}
  }
  if($toc|Where-Object {$_ -like '*TABLE DATA public workshop_state_history *'}){throw 'History data unexpectedly included in core export.'}
  $ids=@(GetHistoryIds $before)
  $gapCount=0
  for($g=1;$g -lt $ids.Count;$g++){if($ids[$g] -ne ($ids[$g-1]+1)){$gapCount++}}
  $inventory=Join-Path $root 'history-revisions.txt'
  [IO.File]::WriteAllText($inventory,($ids -join [Environment]::NewLine)+[Environment]::NewLine,[Text.Encoding]::ASCII)
  $manifest=[ordered]@{
   project_ref=$project;status='CORE_COMPLETE__HISTORY_NOT_EXPORTED__RESTORE_NOT_TESTED'
   source_revision=$before;history_min=$ids[0];history_max=$ids[$ids.Count-1]
   history_count=$ids.Count;history_internal_gaps=$gapCount;chunk_rows=$ChunkRows
   core_file='operational-public-mechanical-vehicle.dump'
   core_sha256=(HashFile $archive);inventory_file='history-revisions.txt'
   inventory_sha256=(HashFile $inventory)
   excluded_from_core=@('public.workshop_state_history DATA')
   snapshot_limit='Independent history chunks are NOT a single MVCC snapshot; only source revision was stable during core pg_dump.'
   excludes=@('Supabase Auth infrastructure','Storage files','Edge secrets','managed schemas','database roles')
   ready_for_recovery=$false
  }
  WriteJson (Join-Path $root 'two-part-manifest.json') $manifest
  Write-Host "CORE OK, HISTORY PENDING. Backup folder: $root"
  Write-Host "Run: .\scripts\backup-zukait-two-part.ps1 -Phase History -SessionFolder '$root'"
 } else {
  $manifestFile=Join-Path $root 'two-part-manifest.json'
  if(-not (Test-Path -LiteralPath $manifestFile)){throw 'No validated core manifest found.'}
  $manifest=Get-Content -LiteralPath $manifestFile -Raw|ConvertFrom-Json
  if($manifest.project_ref -ne $project){throw 'Wrong project backup.'}
  $archive=Join-Path $root $manifest.core_file
  $inventory=Join-Path $root $manifest.inventory_file
  if((HashFile $archive) -ne $manifest.core_sha256 -or (HashFile $inventory) -ne $manifest.inventory_sha256){throw 'Core/inventory checksum mismatch.'}
  $ids=@(Get-Content -LiteralPath $inventory | ForEach-Object {[long]$_})
  if($ids.Count -ne $manifest.history_count){throw 'History inventory count changed.'}
  $rowsPerChunk=[int]$manifest.chunk_rows
  $chunks=[int][Math]::Ceiling($ids.Count/[double]$rowsPerChunk)
  if($Phase -eq 'History'){
   Write-Host "Read-only history export: $($ids.Count) revisions in $chunks resumable chunks."
   if((Read-Host 'Type HISTORY to start/resume history copy') -cne 'HISTORY'){throw 'Operator cancelled.'}
   if((GetRevision) -lt [long]$manifest.source_revision){throw 'Production revision is behind the core snapshot; stop.'}
   $sourceIds=@(GetHistoryIds ([long]$manifest.source_revision))
   if(($sourceIds -join ',') -ne ($ids -join ',')){throw 'Archived revision membership changed; cannot export coherent history.'}
  }
  for($i=0;$i -lt $chunks;$i++){
   $start=$i*$rowsPerChunk;$end=[Math]::Min($ids.Count-1,$start+$rowsPerChunk-1)
   $first=$ids[$start];$last=$ids[$end];$count=$end-$start+1
   $name='history-'+$i.ToString('D5')
   $csv=Join-Path $root ($name+'.csv.partial')
   $zip=Join-Path $root ($name+'.csv.gz')
   $record=Join-Path $root ($name+'.json')
   if(Test-Path -LiteralPath $record){
    $existing=Get-Content -LiteralPath $record -Raw|ConvertFrom-Json
    if($existing.first -ne $first -or $existing.last -ne $last -or $existing.rows -ne $count -or
       -not (Test-Path -LiteralPath $zip) -or (HashFile $zip) -ne $existing.sha256){throw "Existing chunk is invalid; stop: $name"}
    continue
   }
   if($Phase -eq 'Verify'){throw "Missing history chunk $name"}
   if(Test-Path -LiteralPath $zip){throw "Unverified history chunk exists: $zip"}
   if(Test-Path -LiteralPath $csv){Remove-Item -LiteralPath $csv -Force}
   ExportCsvRaw $first $last $csv
   if((Get-Item -LiteralPath $csv).Length -le 0){throw "Empty history export chunk: $name"}
   $zipPartial=$zip+'.partial'
   if(Test-Path -LiteralPath $zipPartial){Remove-Item -LiteralPath $zipPartial -Force}
   CompressCsv $csv $zipPartial
   Move-Item -LiteralPath $zipPartial -Destination $zip
   Remove-Item -LiteralPath $csv -Force
   WriteJson $record ([ordered]@{file=($name+'.csv.gz');sha256=(HashFile $zip);bytes=(Get-Item $zip).Length;first=$first;last=$last;rows=$count})
   Write-Host ('History chunk '+($i+1)+'/'+$chunks+' complete')
  }
  if($Phase -eq 'History'){
   $sourceIds=@(GetHistoryIds ([long]$manifest.source_revision))
   if(($sourceIds -join ',') -ne ($ids -join ',')){throw 'History membership changed before export completed. Do NOT certify.'}
  }
  $manifest.status='FILES_COMPLETE_AND_HASH_VERIFIED__ISOLATED_RESTORE_PENDING'
  $manifest.ready_for_recovery=$false
  $manifest.finished_utc=[DateTimeOffset]::UtcNow.ToString('o')
  WriteJson $manifestFile $manifest
  Write-Host 'All files present and checksummed. NOT a tested restore. V401 backup gate remains HOLD.'
 }
} finally {
 foreach($envName in @('PGPASSWORD','PGOPTIONS','PGAPPNAME','PGSSLMODE','PGCONNECT_TIMEOUT')){
  Remove-Item ('Env:'+$envName) -ErrorAction SilentlyContinue
 }
}