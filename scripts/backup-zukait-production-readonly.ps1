#Requires -Version 7
<#
  Zukait V305: read-only Supabase Free-plan database export.
  Run on a trusted Windows PC/Server with PowerShell 7, Docker and Supabase CLI.
  Use a PRIVATE ENCRYPTED destination outside Git repositories.
  No restore, migration, release, database write or object deletion.
  Storage object bytes and Edge functions need separate backups.
#>
[CmdletBinding()]
param(
  [Parameter(Mandatory=$true)][string]$BackupRoot,
  [switch]$EncryptedOffsiteConfirmed
)
$ErrorActionPreference = 'Stop'
Set-StrictMode -Version Latest
$productionRef = 'pjknotnjkufadqavcmii'
$qaRef = 'omqgkqknbdcnotabffek'
if (-not $EncryptedOffsiteConfirmed) {
  throw 'Confirm a private encrypted off-site backup destination with -EncryptedOffsiteConfirmed.'
}
$url = [Environment]::GetEnvironmentVariable('ZUKAIT_PROD_DB_URL', 'Process')
if ([string]::IsNullOrWhiteSpace($url) -or
    $url -notmatch '^postgres(ql)?://' -or
    -not $url.Contains($productionRef) -or
    $url.Contains($qaRef)) {
  throw 'A valid private PRODUCTION database connection URL is required in ZUKAIT_PROD_DB_URL. Refusing an unknown or QA target.'
}
$root = [IO.Path]::GetFullPath($BackupRoot)
if (-not (Test-Path -LiteralPath $root -PathType Container)) {
  throw 'BackupRoot must be a pre-existing private encrypted folder.'
}
$repository = [IO.Path]::GetFullPath((Join-Path $PSScriptRoot '..'))
if ($root.TrimEnd('\','/').StartsWith($repository.TrimEnd('\','/') + [IO.Path]::DirectorySeparatorChar,[StringComparison]::OrdinalIgnoreCase) -or
    $root.TrimEnd('\','/').Equals($repository.TrimEnd('\','/'),[StringComparison]::OrdinalIgnoreCase)) {
  throw 'Refusing to put workshop backup data inside the Git repository.'
}
foreach ($tool in @('supabase','docker')) {
  if (-not (Get-Command $tool -ErrorAction SilentlyContinue)) {
    throw "$tool is required before beginning; no backup was created."
  }
}
& docker info 1>$null 2>$null
if ($LASTEXITCODE -ne 0) { throw 'Docker engine unavailable; no backup was created.' }
& supabase --version 1>$null 2>$null
if ($LASTEXITCODE -ne 0) { throw 'Supabase CLI unavailable; no backup was created.' }

# The random suffix protects existing backups from accidental overwrite.
# Failed/incomplete backup directories remain private, but lack a PASS manifest.
$stamp=[DateTimeOffset]::UtcNow.ToString('yyyyMMddTHHmmssZ')
$folderName='ZUKAIT-PRODUCTION-'+$stamp+'-'+[Guid]::NewGuid().ToString('N').Substring(0,8)
$folder=Join-Path $root $folderName
New-Item -ItemType Directory -Path $folder -ErrorAction Stop | Out-Null
$started=[DateTimeOffset]::UtcNow.ToString('o')
$success=$false
Push-Location -LiteralPath $folder
try {
  # Supabase CLI excludes reserved cloud internals unlike raw pg_dump.
  # Native CLI arguments do NOT come from source control; never print the URI.
  $exports=@(
    @{ file='roles.sql';    flags=@('--role-only') },
    @{ file='schema.sql';   flags=@() },
    @{ file='data.sql';     flags=@('--data-only','--use-copy') }
  )
  foreach ($entry in $exports) {
    $argsList=@('db','dump','--db-url',$url,'-f',$entry.file)+$entry.flags
    & supabase @argsList 1>$null 2>$null
    if ($LASTEXITCODE -ne 0) {
      throw "Supabase $($entry.file) export failed. Backup is INCOMPLETE; do not restore or approve."
    }
    $item=Get-Item -LiteralPath $entry.file -ErrorAction Stop
    if ($item.Length -lt 64) {
      throw "$($entry.file) appears empty or truncated. Backup is INCOMPLETE."
    }
  }
  $schema=[IO.File]::ReadAllText((Join-Path $folder 'schema.sql'))
  $data=[IO.File]::ReadAllText((Join-Path $folder 'data.sql'))
  foreach ($table in @('workshop_state','workshop_v2_spare_part_state','workshop_receptions')) {
    if (-not $schema.Contains($table) -or -not $data.Contains($table)) {
      throw "Backup is missing an expected workshop table marker: $table."
    }
  }
  # Never write connection strings, customer data or staff credentials to the manifest.
  $entries=@('roles.sql','schema.sql','data.sql') | ForEach-Object {
    $f=Get-Item -LiteralPath $_
    @{ file=$_.ToString(); bytes=$f.Length; sha256=(Get-FileHash -LiteralPath $_ -Algorithm SHA256).Hash.ToLowerInvariant() }
  }
  $manifest=@{
    project='zukait-production'; exportedAtUtc=[DateTimeOffset]::UtcNow.ToString('o')
    startedAtUtc=$started; state='EXPORT_VERIFIED_FILES_ONLY'
    databaseRestoreTest='NOT_RUN'; storageObjectBackup='NOT_INCLUDED'
    edgeFunctionBackup='NOT_INCLUDED'; contents=$entries
  }
  $manifest | ConvertTo-Json -Depth 6 | Set-Content -LiteralPath 'backup-manifest.json' -Encoding utf8
  $success=$true
}
finally { Pop-Location }
if (-not $success) { throw 'Production backup export did not complete.' }
Write-Output "Read-only SQL export files verified at $folder"
Write-Output 'NOT a complete recovery point: restore rehearsal, Storage objects and Edge functions remain outstanding.'
