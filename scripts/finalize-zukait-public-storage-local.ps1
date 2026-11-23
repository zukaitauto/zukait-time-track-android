#Requires -Version 5.1
<#
OFFLINE ONLY: finish the 2026-11-15 ZUKAIT seven-object public Storage backup.
Original download succeeded and each hash was printed, but PowerShell 5.1
raised "Argument types do not match" when constructing the final manifest.
This script checks the files ALREADY on the encrypted Z: drive against the
seven exact SHA-256 hashes and sizes from the successful download output.
It never contacts Supabase/HTTPS, changes source files, deletes or overwrites.
#>
[CmdletBinding()]
param([string]$BackupFolder = '')
$ErrorActionPreference = 'Stop'
Set-StrictMode -Version Latest
$root = 'Z:\Zukait-20261025'
if (!(Test-Path -LiteralPath $root -PathType Container)) {
    throw 'Encrypted Z: backup drive is locked or unavailable.'
}
$rootFull = [IO.Path]::GetFullPath($root).TrimEnd('\','/')
if ([string]::IsNullOrWhiteSpace($BackupFolder)) {
    # Do not guess between multiple unfinished folders. Require an exact
    # unambiguous match or explicit -BackupFolder for manual review.
    $candidates = @(Get-ChildItem -LiteralPath $root -Directory |
        Where-Object {
            $_.Name -match '^ZUKAIT-STORAGE-PUBLIC-\d{8}-\d{6}-[a-f0-9]{8}$' -and
            !(Test-Path -LiteralPath (Join-Path $_.FullName 'STORAGE-BACKUP-PASSED.json'))
        })
    if ($candidates.Count -ne 1) {
        $folderNames = @($candidates | ForEach-Object { $_.FullName })
        throw ("Expected one unfinished public Storage folder, found {0}. To disambiguate, pass -BackupFolder with the exact existing folder path. Candidates: {1}" -f $candidates.Count,($folderNames -join '; '))
    }
    $dest = $candidates[0].FullName
} else {
    $dest = [IO.Path]::GetFullPath($BackupFolder)
}
$destFull = [IO.Path]::GetFullPath($dest).TrimEnd('\','/')
$parentFull = [IO.Path]::GetFullPath((Split-Path $destFull -Parent)).TrimEnd('\','/')
$leaf = Split-Path $destFull -Leaf
if ($parentFull -ine $rootFull -or
    $leaf -notmatch '^ZUKAIT-STORAGE-PUBLIC-\d{8}-\d{6}-[a-f0-9]{8}$' -or
    !(Test-Path -LiteralPath $destFull -PathType Container)) {
    throw 'Refusing to inspect a folder outside the expected encrypted Z: Storage backup directory.'
}
$manifest = Join-Path $destFull 'STORAGE-BACKUP-PASSED.json'
if (Test-Path -LiteralPath $manifest) {
    throw 'The manifest already exists. Refusing to overwrite it.'
}
$expected = @(
    [pscustomobject]@{name='app.svg';size=266011;sha='333fe47a9907ebed597b132f5b1fc3e934fdcfdbb43e6c8fe77536b063aed5ec'},
    [pscustomobject]@{name='cloud_sync.js';size=11476;sha='d6900a599466dad5c378203a7262f9e68130c863c53f4baf50efa5beb1488980'},
    [pscustomobject]@{name='index.html';size=260907;sha='3c0eb33fcba519b6a5668c8ec29e59b80d2946938aa1db82bce86d330a26c14d'},
    [pscustomobject]@{name='production_pilot.js';size=14741;sha='a4f5bf75d181fab8dbcfc14cd412696a04084768b9e747658bb54ca2ff6e1ba8'},
    [pscustomobject]@{name='professional_ux.js';size=16177;sha='93e4bc412cc0b3a68335f005b3e957bffebbd6293923ee95293b919175879ba4'},
    [pscustomobject]@{name='secure_auth.js';size=10614;sha='be923e6256b2ab5c831108ad3a1886c3eb9e17624e5eaee396ca7921e60c929d'},
    [pscustomobject]@{name='zukait_logo.webp';size=4052;sha='bf35e9dc2ddc44e2893a8f4a61dc27d0fb67b35f9d8d3aff0ddd45c524b91e53'}
)
$files = @(Get-ChildItem -LiteralPath $destFull -File)
if ($files.Count -ne 7) {
    throw ("Expected exactly 7 source files in backup folder, found {0}. No manifest created." -f $files.Count)
}
$records = @()
foreach ($item in $expected) {
    $file = Join-Path $destFull $item.name
    if (!(Test-Path -LiteralPath $file -PathType Leaf)) {
        throw "Missing downloaded file: $($item.name)"
    }
    $length = (Get-Item -LiteralPath $file).Length
    $hash = (Get-FileHash -LiteralPath $file -Algorithm SHA256).Hash.ToLowerInvariant()
    if ($length -ne [long]$item.size -or $hash -cne $item.sha) {
        throw ("Checksum or size mismatch: {0}. Nothing modified." -f $item.name)
    }
    $records += [pscustomobject]@{name=$item.name;bytes=[long]$length;sha256=$hash}
    Write-Host ("LOCAL VERIFIED: {0} ({1} bytes)" -f $item.name,$length)
}
if ($records.Count -ne 7) {
    throw 'Only part of the download could be verified; no manifest created.'
}
$objectArray = [object[]]$records
$payload = [pscustomobject]@{
    status = 'STORAGE_PUBLIC_SEVEN_OBJECTS_DOWNLOADED_SIZE_AND_SHA256_VERIFIED'
    project_ref = 'pjknotnjkufadqavcmii'
    bucket = 'zukait-pc'
    visibility = 'public'
    verified_at_utc = [DateTimeOffset]::UtcNow.ToString('o')
    object_count = 7
    objects = $objectArray
    other_bucket = 'employee-voice-notes'
    other_bucket_observed_object_count = 0
    note = 'Completed offline using previously downloaded files. Seven hash values independently match the original user-visible download log.'
    scope_limitation = 'Not a full Supabase recovery point. Storage permissions, other configurations, Edge Functions and new objects are not included.'
    no_production_changes = $true
}
# Write, parse and validate a new manifest before making it final.
$tmp = Join-Path $destFull ('STORAGE-BACKUP-PASSED.json.tmp.' + [guid]::NewGuid().ToString('N'))
$payload | ConvertTo-Json -Depth 7 | Set-Content -LiteralPath $tmp -Encoding UTF8
$check = Get-Content -LiteralPath $tmp -Raw | ConvertFrom-Json
if ($check.status -ne 'STORAGE_PUBLIC_SEVEN_OBJECTS_DOWNLOADED_SIZE_AND_SHA256_VERIFIED' -or
    [int]$check.object_count -ne 7 -or @($check.objects).Count -ne 7) {
    throw 'Manifest round-trip validation failed; no final manifest was published.'
}
if (Test-Path -LiteralPath $manifest) {
    throw 'Final manifest appeared during verification; refusing overwrite.'
}
Move-Item -LiteralPath $tmp -Destination $manifest -ErrorAction Stop
Write-Host 'PUBLIC STORAGE BACKUP PASSED - 7 existing files and hashes verified offline.'
Write-Host "Backup folder: $destFull"
Write-Host "Report: $manifest"
Write-Warning 'Not a full platform recovery point. Keep previous backups unchanged.'
