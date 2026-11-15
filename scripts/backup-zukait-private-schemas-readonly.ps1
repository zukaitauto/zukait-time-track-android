#Requires -Version 5.1
<#
ZUKAIT Private Application Schema Backup (2026-11-15)
SCOPE: zukait_mechanical and zukait_vehicle only (definitions and table data).
SAFETY: Source production PostgreSQL is FORCED read-only; no writes, DDL,
schema migration, history query, restart, live changes or deletion.
Produces a new encrypted-Z-drive folder, custom PG17 archive, and hash manifest.
This is NOT a complete Supabase recovery point or restore rehearsal.
RUN only when the workshop app/web synchronization is working normally.
#>
[CmdletBinding()]
param()
$ErrorActionPreference = 'Stop'
Set-StrictMode -Version Latest

$pgBin = 'C:\Program Files\PostgreSQL\17\bin'
$pgDump = Join-Path $pgBin 'pg_dump.exe'
$pgRestore = Join-Path $pgBin 'pg_restore.exe'
$backupRoot = 'Z:\Zukait-20261025'
$prodHost = 'db.pjknotnjkufadqavcmii.supabase.co'
foreach ($exe in @($pgDump,$pgRestore)) {
    if (!(Test-Path -LiteralPath $exe -PathType Leaf)) {
        throw "PostgreSQL 17 binary missing: $exe"
    }
}
if (!(Test-Path -LiteralPath $backupRoot -PathType Container)) {
    throw 'Encrypted Z: backup drive is locked or missing. Refusing to export.'
}
$drive = Get-PSDrive -Name 'Z' -ErrorAction Stop
if ($null -ne $drive.Free -and $drive.Free -lt 500MB) {
    throw 'Less than 500 MB free on backup drive. Refusing to export.'
}
$versionText = (& $pgDump --version | Out-String).Trim()
if ($LASTEXITCODE -ne 0 -or $versionText -notmatch '\b17\.\d+') {
    throw "Local pg_dump must be PostgreSQL 17. Found: $versionText"
}

$stamp = [DateTimeOffset]::UtcNow.ToString('yyyyMMdd-HHmmss')
$folder = Join-Path $backupRoot ('ZUKAIT-PRIVATE-SCHEMAS-' + $stamp + '-' + [guid]::NewGuid().ToString('N').Substring(0,8))
New-Item -ItemType Directory -Path $folder -ErrorAction Stop | Out-Null
$archive = Join-Path $folder 'zukait-private-mechanical-vehicle.dump'
$manifest = Join-Path $folder 'schema-export-manifest.json'

$env:PGSSLMODE = 'require'
$env:PGAPPNAME = 'zukait-private-schema-backup-readonly'
$env:PGOPTIONS = '-c default_transaction_read_only=on -c lock_timeout=3000 -c statement_timeout=120000'

$secret = Read-Host 'Enter PRODUCTION PostgreSQL password (hidden; never share it here)' -AsSecureString
$ptr = [Runtime.InteropServices.Marshal]::SecureStringToBSTR($secret)
try { $env:PGPASSWORD = [Runtime.InteropServices.Marshal]::PtrToStringBSTR($ptr) }
finally { [Runtime.InteropServices.Marshal]::ZeroFreeBSTR($ptr) }
try {
    if ([string]::IsNullOrWhiteSpace($env:PGPASSWORD)) {
        throw 'Password entry was empty. Nothing was exported.'
    }
    Write-Host 'Starting bounded READ-ONLY export of two small private ZUKAIT application schemas.'
    Write-Host 'No workshop history data is being read.'
    $dumpArgs = @(
        '-w', '-h', $prodHost, '-p', '5432', '-U', 'postgres', '-d', 'postgres',
        '--format=custom','--compress=1',
        '--schema=zukait_mechanical','--schema=zukait_vehicle',
        '--lock-wait-timeout=3000','--file='+$archive
    )
    $oldErrorPreference = $ErrorActionPreference
    try {
        # PowerShell 5.1 may surface native stderr as a terminating exception.
        $ErrorActionPreference = 'Continue'
        & $pgDump @dumpArgs
        $dumpExit = $LASTEXITCODE
    } finally { $ErrorActionPreference = $oldErrorPreference }
    if ($dumpExit -ne 0) {
        throw 'Private-schema dump did not complete. Leave INCOMPLETE folder unchanged; do not retry during API errors.'
    }
    $f = Get-Item -LiteralPath $archive
    if ($f.Length -lt 4096) {
        throw 'Private-schema archive unexpectedly small; no verified backup.'
    }
    $toc = @(& $pgRestore --list $archive)
    if ($LASTEXITCODE -ne 0 -or $toc.Count -eq 0) {
        throw 'pg_restore cannot read the private-schema archive TOC.'
    }
    $mechanicalTables = @($toc | Where-Object { "$_" -match '^\s*\d+;\s+\d+\s+\d+\s+TABLE\s+zukait_mechanical\s+' }).Count
    $vehicleTables = @($toc | Where-Object { "$_" -match '^\s*\d+;\s+\d+\s+\d+\s+TABLE\s+zukait_vehicle\s+' }).Count
    $mechanicalData = @($toc | Where-Object { "$_" -match '^\s*\d+;\s+\d+\s+\d+\s+TABLE DATA\s+zukait_mechanical\s+' }).Count
    $vehicleData = @($toc | Where-Object { "$_" -match '^\s*\d+;\s+\d+\s+\d+\s+TABLE DATA\s+zukait_vehicle\s+' }).Count
    if ($mechanicalTables -ne 18 -or $vehicleTables -ne 3 -or
        $mechanicalData -ne 18 -or $vehicleData -ne 3) {
        throw ("Archive table inventory differs from live preflight (mechanical={0}/{1}, vehicle={2}/{3}). NO backup verification." -f $mechanicalTables,$mechanicalData,$vehicleTables,$vehicleData)
    }
    $hash = (Get-FileHash -LiteralPath $archive -Algorithm SHA256).Hash.ToLowerInvariant()
    [pscustomobject]@{
        project_ref = 'pjknotnjkufadqavcmii'
        mode = 'READ_ONLY_PRODUCTION_TO_LOCAL_ENCRYPTED_DRIVE'
        status = 'CUSTOM_ARCHIVE_TOC_AND_HASH_VERIFIED__RESTORE_NOT_TESTED'
        schema_scope = @('zukait_mechanical','zukait_vehicle')
        included_table_definitions = @{ zukait_mechanical = $mechanicalTables; zukait_vehicle = $vehicleTables }
        included_table_data_sections = @{ zukait_mechanical = $mechanicalData; zukait_vehicle = $vehicleData }
        archive = 'zukait-private-mechanical-vehicle.dump'
        archive_bytes = [long]$f.Length
        sha256 = $hash
        created_utc = [DateTimeOffset]::UtcNow.ToString('o')
        caveats = @(
            'Not a full production or Supabase backup',
            'Different timestamp from core/history backup; not transaction-consistent with them',
            'Public-table triggers and cross-schema dependencies need isolated verification',
            'Auth, Storage object bytes, Edge functions/secrets and roles require separate recovery procedures'
        )
    } | ConvertTo-Json -Depth 6 | Set-Content -LiteralPath $manifest -Encoding UTF8
    Write-Host 'PRIVATE SCHEMA EXPORT VERIFIED: 18 Mechanical tables and 3 Vehicle tables.'
    Write-Host "Archive: $archive"
    Write-Host "Manifest: $manifest"
    Write-Host 'Preserve BOTH previous backups, this archive and the local restore database.'
    Write-Warning 'This is NOT yet a complete application restore. Further local-only recovery qualification is required.'
}
finally {
    Remove-Item Env:\PGPASSWORD -ErrorAction SilentlyContinue
    Remove-Item Env:\PGOPTIONS -ErrorAction SilentlyContinue
    Remove-Item Env:\PGAPPNAME -ErrorAction SilentlyContinue
    Remove-Item Env:\PGSSLMODE -ErrorAction SilentlyContinue
}
