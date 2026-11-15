#Requires -Version 5.1
<#
ZUKAIT Public Storage Objects backup — 2026-11-15.
Read-only HTTPS download of the seven known, publicly accessible objects
in Supabase Storage bucket zukait-pc. No token, database connection, upload,
object mutation, service restart, overwrite or cleanup.
Preserves original bytes in a new folder on encrypted Z: drive.
Source metadata sizes were read through a read-only production catalog query.
This is a snapshot of files downloaded sequentially, NOT a transaction-
consistent database + Storage recovery point.
#>
[CmdletBinding()]
param()
$ErrorActionPreference = 'Stop'
Set-StrictMode -Version Latest
$root = 'Z:\Zukait-20261025'
if (!(Test-Path -LiteralPath $root -PathType Container)) {
    throw 'Encrypted Z: backup drive not present/unlocked.'
}
$drive = Get-PSDrive -Name Z -ErrorAction Stop
if ($null -eq $drive.Free -or $drive.Free -lt 100MB) {
    throw 'Less than 100 MB available on encrypted Z: drive. No download.'
}
$origin = 'https://pjknotnjkufadqavcmii.supabase.co'
$bucket = 'zukait-pc'
$items = @(
    [pscustomobject]@{name='app.svg';size=266011},
    [pscustomobject]@{name='cloud_sync.js';size=11476},
    [pscustomobject]@{name='index.html';size=260907},
    [pscustomobject]@{name='production_pilot.js';size=14741},
    [pscustomobject]@{name='professional_ux.js';size=16177},
    [pscustomobject]@{name='secure_auth.js';size=10614},
    [pscustomobject]@{name='zukait_logo.webp';size=4052}
)
$stamp = [DateTimeOffset]::UtcNow.ToString('yyyyMMdd-HHmmss')
$dest = Join-Path $root ("ZUKAIT-STORAGE-PUBLIC-" + $stamp + "-" + [guid]::NewGuid().ToString('N').Substring(0,8))
New-Item -ItemType Directory -Path $dest -ErrorAction Stop | Out-Null
$records = New-Object 'System.Collections.Generic.List[object]'
foreach ($item in $items) {
    # Names are an exact, hard-coded allowlist; never accept paths from HTTP.
    if ($item.name -notmatch '^[a-z0-9_.-]+$' -or $item.name -match '^\.+$') {
        throw "Unexpected object path: $($item.name)"
    }
    $url = $origin + '/storage/v1/object/public/' + $bucket + '/' + [Uri]::EscapeDataString($item.name)
    $target = Join-Path $dest $item.name
    Write-Host ("Downloading Storage object {0} ..." -f $item.name)
    Invoke-WebRequest -UseBasicParsing -Uri $url -OutFile $target -TimeoutSec 60 -ErrorAction Stop | Out-Null
    $bytes = (Get-Item -LiteralPath $target -ErrorAction Stop).Length
    if ($bytes -ne [long]$item.size) {
        throw ("Storage content size mismatch for {0} (got {1}, expected {2}). Stop; preserve this folder for diagnosis." -f $item.name,$bytes,$item.size)
    }
    $sha = (Get-FileHash -LiteralPath $target -Algorithm SHA256).Hash.ToLowerInvariant()
    $records.Add([pscustomobject]@{
        name=$item.name
        bytes=[long]$bytes
        sha256=$sha
    }) | Out-Null
    Write-Host ("Verified {0}: {1} bytes, SHA256={2}" -f $item.name,$bytes,$sha)
}
if ($records.Count -ne 7) {
    throw 'Expected exactly seven downloaded object records; backup not verified.'
}
$manifest = Join-Path $dest 'STORAGE-BACKUP-PASSED.json'
[pscustomobject]@{
    status='STORAGE_PUBLIC_SEVEN_OBJECTS_DOWNLOADED_SIZE_AND_SHA256_VERIFIED'
    project_ref='pjknotnjkufadqavcmii'
    bucket='zukait-pc'
    visibility='public'
    captured_utc=[DateTimeOffset]::UtcNow.ToString('o')
    object_count=$records.Count
    objects=$records.ToArray()
    other_bucket='employee-voice-notes'
    other_bucket_observed_object_count=0
    scope_limitation='Does not export bucket policies, other Supabase configuration, Edge Functions, private or future objects; not a consistent database snapshot.'
    no_production_changes=$true
} | ConvertTo-Json -Depth 7 | Set-Content -LiteralPath $manifest -Encoding UTF8
Write-Host 'PUBLIC STORAGE BACKUP PASSED - 7 objects downloaded and hashed.'
Write-Host "Backup folder: $dest"
Write-Host "Report: $manifest"
Write-Warning 'Not a complete Supabase backup. Keep the original core/history/private-schema archives.'
