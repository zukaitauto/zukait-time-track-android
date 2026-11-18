#Requires -Version 5.1
<#
ZUKAIT low-I/O history export: read-only, incremental operator pilot.
Same CSV/GZIP + SHA256 metadata format as backup-zukait-two-part.ps1.
Preserves all existing chunks, source revision inventory and Core archive.
Default: export at most ONE 50-revision backup chunk via 10 smaller 5-row
indexed PostgreSQL COPY queries, with pacing between requests.
THIS DOES NOT GUARANTEE DATABASE STABILITY. No production writes.
Run only outside workshop hours with stable ERP and healthy Disk I/O.
Never use as proof of a complete recovery until local restore passes.
#>
[CmdletBinding()]
param(
  [ValidateRange(1,5)][int]$MaxChunks=1,
  [ValidateRange(5,20)][int]$DelaySeconds=8,
  [ValidateRange(30,180)][int]$ChunkPauseSeconds=60,
  [string]$SessionFolder='Z:\Zukait-20261025\ZUKAIT-TWO-PART-20261118-085525-05bc29'
)
Set-StrictMode -Version Latest
$ErrorActionPreference='Stop'
$project='pjknotnjkufadqavcmii'
$hostName='aws-0-ap-south-1.pooler.supabase.com'
$dbUser='postgres.'+$project
$pg='C:\Program Files\PostgreSQL\17\bin\psql.exe'
$backup=[IO.Path]::GetFullPath($SessionFolder)
$expectedRoot='Z:\Zukait-20261025\ZUKAIT-TWO-PART-20261118-085525-05bc29'
if(-not $backup.Equals($expectedRoot,[StringComparison]::OrdinalIgnoreCase)){
  throw 'Refusing another backup folder. Use the existing verified ZUKAIT two-part session.'
}
if(!(Test-Path -LiteralPath $backup -PathType Container)){throw 'Encrypted Z: backup directory unavailable.'}
if(!(Test-Path -LiteralPath $pg -PathType Leaf) -or (& $pg --version) -notmatch '\b17[.]'){
  throw 'PostgreSQL 17 psql.exe is required.'
}
# Oman local time (Windows time zone ID); hard-block active workshop shifts.
$oman=[TimeZoneInfo]::ConvertTimeFromUtc([DateTime]::UtcNow,[TimeZoneInfo]::FindSystemTimeZoneById('Arabian Standard Time'))
if($oman.DayOfWeek -ne [DayOfWeek]::Friday -and $oman.Hour -ge 8 -and $oman.Hour -lt 19){
  throw "Workshop hours in Oman ($oman). No production history export before 7 PM."
}
function FileHash([string]$file){
  return (Get-FileHash -LiteralPath $file -Algorithm SHA256).Hash.ToLowerInvariant()
}
$manifestPath=Join-Path $backup 'two-part-manifest.json'
if(!(Test-Path -LiteralPath $manifestPath)){throw 'Core backup manifest missing.'}
$m=Get-Content -LiteralPath $manifestPath -Raw|ConvertFrom-Json
if($m.project_ref -ne $project -or $m.source_revision -lt 1 -or
  @('CORE_COMPLETE__HISTORY_NOT_EXPORTED__RESTORE_NOT_TESTED','FILES_COMPLETE_AND_HASH_VERIFIED__ISOLATED_RESTORE_PENDING') -notcontains $m.status){
  throw 'Unexpected backup identity or manifest status.'
}
$core=Join-Path $backup $m.core_file
$inventory=Join-Path $backup $m.inventory_file
if(!(Test-Path -LiteralPath $core) -or !(Test-Path -LiteralPath $inventory) -or
   (FileHash $core) -ne $m.core_sha256 -or (FileHash $inventory) -ne $m.inventory_sha256){
  throw 'Core archive or revision inventory checksum mismatch. Production untouched.'
}
$ids=@(Get-Content -LiteralPath $inventory|ForEach-Object {[long]$_})
if($ids.Count -ne [int]$m.history_count -or [int]$m.chunk_rows -ne 50){
  throw 'Unexpected source revision inventory or 50-revision backup structure.'
}
$chunks=[int][Math]::Ceiling($ids.Count/50.0)
$firstMissing=-1
for($i=0;$i -lt $chunks;$i++){
  $base='history-'+$i.ToString('D5')
  $record=Join-Path $backup ($base+'.json')
  $archive=Join-Path $backup ($base+'.csv.gz')
  $start=$i*50
  $end=[Math]::Min($ids.Count-1,$start+49)
  if(Test-Path -LiteralPath $record){
    if(!(Test-Path -LiteralPath $archive)){throw "Recorded chunk missing archive: $base"}
    $old=Get-Content -LiteralPath $record -Raw|ConvertFrom-Json
    if([long]$old.first -ne $ids[$start] -or [long]$old.last -ne $ids[$end] -or
       [int]$old.rows -ne ($end-$start+1) -or (FileHash $archive) -ne [string]$old.sha256){
      throw "Existing chunk checksum/identity mismatch: $base"
    }
  } else {
    if(Test-Path -LiteralPath $archive){throw "Unverified completed-name archive exists: $base"}
    if($firstMissing -lt 0){$firstMissing=$i}
  }
}
if($firstMissing -lt 0){
  Write-Host 'All history chunk files already exist and match checksums. Run the existing offline -Phase Verify, then isolated restore.'
  return
}
$left=$chunks-$firstMissing
Write-Host ('Verified existing backup chunks. Next chunk: '+($firstMissing+1)+'/'+$chunks+'. Remaining: '+$left)
Write-Host ('Maximum this invocation: '+$MaxChunks+' chunk(s). Five indexed revisions per COPY, '+$DelaySeconds+'s pause between requests.')
Write-Host 'IMPORTANT: Even small reads can trigger resource problems. Do NOT run if users are disconnected or Disk I/O is low.'
if((Read-Host 'Type PACED to begin this limited READ-ONLY history export') -cne 'PACED'){
  throw 'Cancelled. Existing backup unchanged.'
}
$env:PGSSLMODE='require'
$env:PGCONNECT_TIMEOUT='10'
$env:PGAPPNAME='zukait-history-low-io-operator'
$env:PGOPTIONS='-c default_transaction_read_only=on -c lock_timeout=3000 -c statement_timeout=30000'
$secure=Read-Host 'Production database password (hidden; never paste into chat)' -AsSecureString
$ptr=[Runtime.InteropServices.Marshal]::SecureStringToBSTR($secure)
try{$env:PGPASSWORD=[Runtime.InteropServices.Marshal]::PtrToStringBSTR($ptr)}
finally{[Runtime.InteropServices.Marshal]::ZeroFreeBSTR($ptr)}
function ReadPg([string]$sql){
  $result=@(& $pg '-X' '-q' '-t' '-A' '-w' '-v' 'ON_ERROR_STOP=1' '-h' $hostName '-p' '5432' '-U' $dbUser '-d' 'postgres' '-c' $sql)
  if($LASTEXITCODE -ne 0){throw 'Database connection/health check failed. Stop without retrying.'}
  return $result
}
function ExportIndexedRows([long[]]$revisions,[string]$target){
  $where=($revisions|ForEach-Object {"$_"}) -join ','
  $sql="COPY (SELECT revision,data,updated_at,updated_by,archived_at FROM public.workshop_state_history WHERE revision IN ($where) ORDER BY revision) TO STDOUT WITH (FORMAT csv)"
  $psi=New-Object Diagnostics.ProcessStartInfo
  $psi.FileName=$pg
  $psi.Arguments='-X -q -w -v ON_ERROR_STOP=1 -h "'+$hostName+'" -p 5432 -U "'+$dbUser+'" -d postgres -c "'+$sql+'"'
  $psi.UseShellExecute=$false
  $psi.CreateNoWindow=$true
  $psi.RedirectStandardOutput=$true
  $psi.RedirectStandardError=$true
  $proc=[Diagnostics.Process]::Start($psi)
  try{
    $out=[IO.File]::Open($target,[IO.FileMode]::Append,[IO.FileAccess]::Write,[IO.FileShare]::None)
    try{$proc.StandardOutput.BaseStream.CopyTo($out)}
    finally{$out.Dispose()}
    $err=$proc.StandardError.ReadToEnd()
    $proc.WaitForExit()
    if($proc.ExitCode -ne 0){
      throw ('Indexed COPY failed; stop without retrying: '+$err.Substring(0,[Math]::Min(350,$err.Length)))
    }
  }finally{$proc.Dispose()}
}
function GzipFile([string]$source,[string]$dest){
  $inputFile=[IO.File]::OpenRead($source)
  try{
    $outputFile=[IO.File]::CreateNew($dest)
    try{
      $gz=[IO.Compression.GZipStream]::new($outputFile,[IO.Compression.CompressionMode]::Compress)
      try{$inputFile.CopyTo($gz)}finally{$gz.Dispose()}
    }finally{$outputFile.Dispose()}
  }finally{$inputFile.Dispose()}
}
try{
  $started=@(ReadPg 'SELECT pg_postmaster_start_time()')
  if($started.Count -ne 1){throw 'Postgres start-time check failed.'}
  $rev=@(ReadPg "SELECT revision FROM public.workshop_state WHERE id='main'")
  if($rev.Count -ne 1 -or [long]$rev[0] -lt [long]$m.source_revision){
    throw 'Production workshop revision behind preserved Core. Stop.'
  }
  $max=[Math]::Min($chunks,$firstMissing+$MaxChunks)
  for($i=$firstMissing;$i -lt $max;$i++){
    $from=$i*50
    $to=[Math]::Min($ids.Count-1,$from+49)
    $base='history-'+$i.ToString('D5')
    $zip=Join-Path $backup ($base+'.csv.gz')
    $record=Join-Path $backup ($base+'.json')
    if((Test-Path -LiteralPath $zip) -or (Test-Path -LiteralPath $record)){
      throw "Refusing overwrite of existing chunk: $base"
    }
    $token=[Guid]::NewGuid().ToString('N')
    $partialCsv=Join-Path $backup ($base+'.paced-'+$token+'.csv.partial')
    $partialZip=Join-Path $backup ($base+'.paced-'+$token+'.gz.partial')
    [IO.File]::WriteAllBytes($partialCsv,[byte[]]@())
    for($j=$from;$j -le $to;$j+=5){
      $last=[Math]::Min($to,$j+4)
      $group=[long[]]@($ids[$j..$last])
      ExportIndexedRows $group $partialCsv
      if($last -lt $to){Start-Sleep -Seconds $DelaySeconds}
    }
    if((Get-Item -LiteralPath $partialCsv).Length -le 0){throw "Zero-length exported history chunk: $base"}
    GzipFile $partialCsv $partialZip
    if((Get-Item -LiteralPath $partialZip).Length -le 0){throw "Zero-length compressed history chunk: $base"}
    $post=@(ReadPg 'SELECT pg_postmaster_start_time()')
    if($post.Count -ne 1 -or $post[0] -ne $started[0]){
      throw 'Database restarted during export. DO NOT certify this chunk or retry.'
    }
    # Only now expose the final archive name. Existing archives are never overwritten.
    Move-Item -LiteralPath $partialZip -Destination $zip -ErrorAction Stop
    $info=[ordered]@{
      file=($base+'.csv.gz')
      sha256=(FileHash $zip)
      bytes=(Get-Item -LiteralPath $zip).Length
      first=$ids[$from]
      last=$ids[$to]
      rows=$to-$from+1
    }
    $sidecar=$record+'.writing'
    [IO.File]::WriteAllText($sidecar,($info|ConvertTo-Json -Depth 6),[Text.Encoding]::UTF8)
    Move-Item -LiteralPath $sidecar -Destination $record -ErrorAction Stop
    Write-Host ('PACED CHUNK '+($i+1)+'/'+$chunks+' HASH VERIFIED. Existing backup preserved.')
    # Intentionally retain .paced CSV partials for diagnosis; never delete other files.
    if($i+1 -lt $max){Start-Sleep -Seconds $ChunkPauseSeconds}
  }
  Write-Host 'LIMITED PACED EXPORT FINISHED. STOP HERE AND VERIFY APP CONNECTIVITY.'
  Write-Host 'When all 338 chunks are saved, run original -Phase Verify offline, then isolated restore.'
}catch{
  Write-Warning 'Paced export stopped. All previously verified chunks remain untouched. Do NOT retry during connection problems.'
  throw
}finally{
  foreach($envName in @('PGPASSWORD','PGOPTIONS','PGAPPNAME','PGSSLMODE','PGCONNECT_TIMEOUT')){
    Remove-Item ('Env:'+$envName) -ErrorAction SilentlyContinue
  }
}
