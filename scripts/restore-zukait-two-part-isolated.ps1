#Requires -Version 5.1
<#
ZUKAIT two-part offline RECOVERY REHEARSAL. LOCAL PostgreSQL 17 ONLY.
Never connects to, modifies, restarts or drops production.
The destination must be a fresh empty local database created by operator.
No production roles/secrets, Auth managed schemas, Storage files, or Edge settings
are contained in the two-part application export.
#>
[CmdletBinding()]
param(
 [Parameter(Mandatory=$true)][string]$SessionFolder,
 [Parameter(Mandatory=$true)][ValidatePattern('^zukait_restore_[a-z0-9_]+$')][string]$LocalDatabase,
 [ValidateRange(1,65535)][int]$LocalPort=5432,
 [string]$PgBin='C:\Program Files\PostgreSQL\17\bin'
)
Set-StrictMode -Version Latest
$ErrorActionPreference='Stop'
$psql=Join-Path $PgBin 'psql.exe'
$pgrestore=Join-Path $PgBin 'pg_restore.exe'
$project='pjknotnjkufadqavcmii'
function HashFile([string]$file) {
 $sha=[Security.Cryptography.SHA256]::Create()
 $stream=[IO.File]::OpenRead($file)
 try {return ([BitConverter]::ToString($sha.ComputeHash($stream))).Replace('-','').ToLowerInvariant()}
 finally {$stream.Dispose();$sha.Dispose()}
}
function LocalSql([string]$sql) {
 $rows=@(& $psql '-X' '-q' '-t' '-A' '-w' '-v' 'ON_ERROR_STOP=1' '-h' '127.0.0.1' '-p' "$LocalPort" '-U' 'postgres' '-d' $LocalDatabase '-c' $sql)
 if($LASTEXITCODE -ne 0){throw 'Local PostgreSQL SQL command failed.'}
 return $rows
}
function ImportGzip([string]$file) {
 $sql='COPY public.workshop_state_history (revision,data,updated_at,updated_by,archived_at) FROM STDIN WITH (FORMAT csv)'
 $psi=New-Object System.Diagnostics.ProcessStartInfo
 $psi.FileName=$psql
 $psi.Arguments='-X -q -w -v ON_ERROR_STOP=1 -h 127.0.0.1 -p '+$LocalPort+' -U postgres -d "'+$LocalDatabase+'" -c "'+$sql+'"'
 $psi.UseShellExecute=$false
 $psi.CreateNoWindow=$true
 $psi.RedirectStandardInput=$true
 $psi.RedirectStandardOutput=$true
 $psi.RedirectStandardError=$true
 $proc=[Diagnostics.Process]::Start($psi)
 try {
  $stream=[IO.File]::OpenRead($file)
  $gz=New-Object IO.Compression.GZipStream($stream,[IO.Compression.CompressionMode]::Decompress)
  try {$gz.CopyTo($proc.StandardInput.BaseStream)}
  finally {$gz.Dispose();$stream.Dispose();$proc.StandardInput.Close()}
  $reply=$proc.StandardOutput.ReadToEnd()
  $err=$proc.StandardError.ReadToEnd()
  $proc.WaitForExit()
  if($proc.ExitCode -ne 0){throw ('Local restore chunk failed: '+$err.Substring(0,[Math]::Min(400,$err.Length)))}
 } finally {$proc.Dispose()}
}
$root=[IO.Path]::GetFullPath($SessionFolder)
if(-not $root.StartsWith('Z:\',[StringComparison]::OrdinalIgnoreCase) -or
   -not (Test-Path -LiteralPath $root -PathType Container)){throw 'Use the existing encrypted Z: export folder.'}
foreach($bin in @($psql,$pgrestore)){
 if(-not (Test-Path -LiteralPath $bin)){throw "PostgreSQL 17 tool missing: $bin"}
 if((& $bin --version) -notmatch '\b17[.]'){throw 'PostgreSQL 17 is required.'}
}
$manifestPath=Join-Path $root 'two-part-manifest.json'
if(-not (Test-Path -LiteralPath $manifestPath)){throw 'Two-part export manifest is missing.'}
$manifest=Get-Content -LiteralPath $manifestPath -Raw|ConvertFrom-Json
if($manifest.project_ref -ne $project -or
   $manifest.status -ne 'FILES_COMPLETE_AND_HASH_VERIFIED__ISOLATED_RESTORE_PENDING'){throw 'History export is unfinished.'}
$archive=Join-Path $root $manifest.core_file
$inventory=Join-Path $root $manifest.inventory_file
if((HashFile $archive) -ne $manifest.core_sha256 -or (HashFile $inventory) -ne $manifest.inventory_sha256){throw 'Source backup checksum mismatch.'}
$expected=@(Get-Content -LiteralPath $inventory | ForEach-Object {[long]$_})
$rowsPerChunk=[int]$manifest.chunk_rows
$chunks=[int][Math]::Ceiling($expected.Count/[double]$rowsPerChunk)
for($i=0;$i -lt $chunks;$i++){
 $start=$i*$rowsPerChunk;$end=[Math]::Min($expected.Count-1,$start+$rowsPerChunk-1)
 $name='history-'+$i.ToString('D5')
 $record=Join-Path $root ($name+'.json')
 $zip=Join-Path $root ($name+'.csv.gz')
 if(-not (Test-Path -LiteralPath $record) -or -not (Test-Path -LiteralPath $zip)){throw "Missing history chunk: $name"}
 $meta=Get-Content -LiteralPath $record -Raw|ConvertFrom-Json
 if($meta.first -ne $expected[$start] -or $meta.last -ne $expected[$end] -or
    $meta.rows -ne ($end-$start+1) -or $meta.sha256 -ne (HashFile $zip)){throw "Chunk integrity mismatch: $name"}
}
Write-Host 'IMPORTANT: This imports into an EXISTING EMPTY LOCAL TEST DATABASE ONLY.'
Write-Host "Destination: 127.0.0.1:$LocalPort / $LocalDatabase"
if((Read-Host 'Type RESTORE to load into this empty local test database') -cne 'RESTORE'){throw 'Operator cancelled.'}
# Always override connection environment to avoid an inherited production host.
$env:PGHOST='127.0.0.1'
$env:PGPORT="$LocalPort"
$env:PGSSLMODE='prefer'
$env:PGCONNECT_TIMEOUT='10'
$pw=Read-Host 'Local PostgreSQL password, if any (hidden)' -AsSecureString
$ptr=[Runtime.InteropServices.Marshal]::SecureStringToBSTR($pw)
try {$env:PGPASSWORD=[Runtime.InteropServices.Marshal]::PtrToStringBSTR($ptr)}
finally {[Runtime.InteropServices.Marshal]::ZeroFreeBSTR($ptr)}
try {
 $tables=@(LocalSql "SELECT tablename FROM pg_tables WHERE schemaname NOT IN ('pg_catalog','information_schema') LIMIT 1")
 if($tables.Count -ne 0){throw 'Local target database is not empty. Refusing to overwrite any data.'}
 & $pgrestore '-w' '-h' '127.0.0.1' '-p' "$LocalPort" '-U' 'postgres' '-d' $LocalDatabase '--exit-on-error' '--no-owner' '--no-acl' $archive
 if($LASTEXITCODE -ne 0){throw 'Core restore failed. Retain logs and do not call this a recoverable backup.'}
 for($i=0;$i -lt $chunks;$i++) {
  $name='history-'+$i.ToString('D5')
  ImportGzip (Join-Path $root ($name+'.csv.gz'))
  Write-Host ('Restored history '+($i+1)+'/'+$chunks)
 }
 $actual=@(LocalSql 'SELECT revision FROM public.workshop_state_history ORDER BY revision'|ForEach-Object {[long]$_})
 if($expected.Count -ne $actual.Count -or ($expected -join ',') -ne ($actual -join ',')){throw 'History revision inventory mismatch after restore.'}
 $rev=@(LocalSql "SELECT revision FROM public.workshop_state WHERE id='main'")
 if($rev.Count -ne 1 -or [long]$rev[0] -ne [long]$manifest.source_revision){throw 'Restored workshop state revision does not match the core snapshot.'}
 $unvalidated=@(LocalSql "SELECT count(*) FROM pg_constraint WHERE contype='f' AND NOT convalidated")
 if($unvalidated.Count -ne 1 -or [long]$unvalidated[0] -ne 0){throw 'One or more foreign keys are unvalidated.'}
 $report=[ordered]@{
  status='ISOLATED_APP_RESTORE_VERIFIED__NOT_FULL_SUPABASE_RECOVERY'
  project_ref=$project;source_revision=$manifest.source_revision
  restored_history_count=$actual.Count;first=$actual[0];last=$actual[$actual.Count-1]
  unvalidated_foreign_keys=0
  destination='127.0.0.1/'+$LocalDatabase
  finished_utc=[DateTimeOffset]::UtcNow.ToString('o')
  exclusions=@('Auth managed schemas','Storage object bytes','Edge secrets','roles','external application configuration')
  note='Local app archive/manifest/complete history revision inventory validated; separate functional, role and Vehicle-audit row checks still required.'
 }
 $resultFile=Join-Path $root 'LOCAL-RESTORE-RESULT.json'
 [IO.File]::WriteAllText($resultFile,($report|ConvertTo-Json -Depth 5),[Text.Encoding]::UTF8)
 Write-Host "LOCAL APP RESTORE OK. Further system-level recovery verification is needed. Report: $resultFile"
} finally {
 foreach($name in @('PGPASSWORD','PGHOST','PGPORT','PGSSLMODE','PGCONNECT_TIMEOUT')){
  Remove-Item ('Env:'+$name) -ErrorAction SilentlyContinue
 }
}