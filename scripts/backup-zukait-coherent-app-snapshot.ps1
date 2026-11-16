#Requires -Version 5.1
<#
ZUKAIT: ONE coherent public + Mechanical + Vehicle PostgreSQL 17 backup.
Operator-only, off-hours, low-I/O-risk, immutable encrypted Z: destination.
ONE pg_dump transaction/snapshot eliminates cross-time public/private drift.
Production is READ ONLY. No restart, write, history deletion or migration.
This is APP-DATABASE scope, NOT a complete Supabase/Auth/Storage/Edge backup.
Final success requires a separate isolated restore and FK/app-read verification.
#>
[CmdletBinding()]
param(
    [string]$BackupRoot='Z:\Zukait-20261025'
)
Set-StrictMode -Version Latest
$ErrorActionPreference='Stop'
$project='pjknotnjkufadqavcmii'
$prodHost='db.pjknotnjkufadqavcmii.supabase.co'
$pgBin='C:\Program Files\PostgreSQL\17\bin'
$pgDump=Join-Path $pgBin 'pg_dump.exe'
$pgRestore=Join-Path $pgBin 'pg_restore.exe'
foreach($exe in @($pgDump,$pgRestore)){
    if(!(Test-Path -LiteralPath $exe -PathType Leaf)){throw "PostgreSQL 17 client missing: $exe"}
}
$root=[IO.Path]::GetFullPath($BackupRoot)
if(!(Test-Path -LiteralPath $root -PathType Container) -or
   -not $root.StartsWith('Z:\',[StringComparison]::OrdinalIgnoreCase)){
    throw 'Use an unlocked encrypted Z: destination. No export attempted.'
}
$drive=Get-PSDrive -Name Z -ErrorAction Stop
if($null -ne $drive.Free -and $drive.Free -lt 2GB){
    throw 'Encrypted Z: has less than 2 GB free. Do not export.'
}
foreach($exe in @($pgDump,$pgRestore)){
    $v=(& $exe --version | Out-String).Trim()
    if($LASTEXITCODE -ne 0 -or $v -notmatch '\b17\.\d+'){
        throw "PostgreSQL 17 client required: $v"
    }
}
Write-Host 'IMPORTANT: Run ONLY while workshop service is healthy, after work hours and after I/O balance has recovered.'
Write-Host 'This single source snapshot includes PUBLIC, ZUKAIT_MECHANICAL and ZUKAIT_VEHICLE together.'
$choice=Read-Host 'Type BACKUP to start the read-only consistent app backup (anything else cancels)'
if($choice -cne 'BACKUP'){throw 'Cancelled. Production unchanged.'}
$stamp=[DateTimeOffset]::UtcNow.ToString('yyyyMMdd-HHmmss')
$folder=Join-Path $root ('ZUKAIT-COHERENT-APP-'+$stamp+'-'+[Guid]::NewGuid().ToString('N').Substring(0,8))
New-Item -ItemType Directory -Path $folder -ErrorAction Stop | Out-Null
$archive=Join-Path $folder 'zukait-public-mechanical-vehicle.dump'
$manifestPath=Join-Path $folder 'COHERENT-APP-BACKUP.json'
$env:PGSSLMODE='require'
$env:PGAPPNAME='zukait-coherent-app-backup-operator-readonly'
$env:PGOPTIONS='-c default_transaction_read_only=on -c lock_timeout=3000'
$pw=Read-Host 'Production database password (hidden; never share in chat)' -AsSecureString
$ptr=[Runtime.InteropServices.Marshal]::SecureStringToBSTR($pw)
try {$env:PGPASSWORD=[Runtime.InteropServices.Marshal]::PtrToStringBSTR($ptr)}
finally {[Runtime.InteropServices.Marshal]::ZeroFreeBSTR($ptr)}
$start=[DateTimeOffset]::UtcNow.ToString('o')
try {
    if([string]::IsNullOrWhiteSpace($env:PGPASSWORD)){throw 'Empty password; no export.'}
    $fileArg='--file='+$archive
    $argsList=@(
        '-w','-h',$prodHost,'-p','5432','-U','postgres','-d','postgres',
        '--format=custom','--compress=1',
        '--serializable-deferrable',
        '--no-owner','--no-acl',
        '--lock-wait-timeout=3000',
        '--schema=public','--schema=zukait_mechanical','--schema=zukait_vehicle',
        $fileArg
    )
    $old=$ErrorActionPreference
    try {
        $ErrorActionPreference='Continue'
        & $pgDump @argsList
        $rc=$LASTEXITCODE
    } finally {$ErrorActionPreference=$old}
    if($rc -ne 0){throw 'Coherent pg_dump FAILED. Do not use the incomplete archive.'}
    $item=Get-Item -LiteralPath $archive -ErrorAction Stop
    if($item.Length -lt 1048576){throw 'Archive unexpectedly small. No PASS report.'}
    $toc=@(& $pgRestore --list $archive)
    if($LASTEXITCODE -ne 0 -or $toc.Count -lt 80){
        throw 'Archive table of contents unreadable or unusually short.'
    }
    $required=@(
        'TABLE DATA public workshop_state ',
        'TABLE DATA public workshop_state_history ',
        'TABLE DATA zukait_mechanical ',
        'TABLE DATA zukait_vehicle '
    )
    foreach($marker in $required){
        if(-not ($toc | Where-Object { "$_" -like ('*'+$marker+'*') })){
            throw "Missing expected backup data entry: $marker"
        }
    }
    $sha=(Get-FileHash -LiteralPath $archive -Algorithm SHA256).Hash.ToLowerInvariant()
    [pscustomobject]@{
        project_ref=$project
        status='SINGLE_TRANSACTION_APP_ARCHIVE_HASH_AND_TOC_VERIFIED__RESTORE_NOT_YET_TESTED'
        source='production-postgres17-read-only'
        transaction_snapshot='pg_dump --serializable-deferrable single client invocation'
        exported_schemas=@('public','zukait_mechanical','zukait_vehicle')
        archive='zukait-public-mechanical-vehicle.dump'
        archive_bytes=[long]$item.Length
        archive_sha256=$sha
        started_utc=$start
        finished_utc=[DateTimeOffset]::UtcNow.ToString('o')
        next_step='Restore into isolated PostgreSQL 17; check every required FK including Vehicle audit, trigger count and history revision; do NOT overwrite production or existing backups.'
        excludes=@('auth managed schemas','storage managed schemas','Storage object bytes','Edge Function source','Edge Function secrets','role passwords','external app configuration')
    } | ConvertTo-Json -Depth 6 | Set-Content -LiteralPath $manifestPath -Encoding UTF8
    Write-Host 'APP BACKUP ARCHIVE AND CHECKSUM COMPLETE; RESTORE STILL REQUIRED.'
    Write-Host "Encrypted backup: $archive"
    Write-Host "Manifest: $manifestPath"
} finally {
    foreach($name in @('PGPASSWORD','PGOPTIONS','PGAPPNAME','PGSSLMODE')){
        Remove-Item "Env:\$name" -ErrorAction SilentlyContinue
    }
}
