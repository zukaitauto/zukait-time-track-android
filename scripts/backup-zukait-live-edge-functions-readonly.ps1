#Requires -Version 5.1
<#
ZUKAIT - read-only archive of the nine deployed Supabase Edge Functions.
- Uses Supabase CLI "functions download" only, NEVER deploy/delete/push.
- Download source lives only in a unique encrypted Z: backup folder.
- Pinned hash manifest was computed from read-only Management API get_edge_function
  source readbacks on 2026-11-15. No source files or secrets in GitHub.
- Fails closed on drift/mismatch; does not touch other existing backups.
- Does NOT export runtime secrets, custom domains, hosted config, Auth/Storage,
  database or produce a complete application recovery point.
#>
[CmdletBinding()]
param()
$ErrorActionPreference='Stop'
Set-StrictMode -Version Latest
$project='pjknotnjkufadqavcmii'
$root='Z:\Zukait-20261025'
$manifestUrl='https://raw.githubusercontent.com/zukaitauto/zukait-time-track-android/dc29833970d17b1be954482a845aa48cadf8eb46/docs/storage/EDGE_FUNCTION_LIVE_SOURCE_SHA256_20261115.json'
if(!(Test-Path -LiteralPath $root -PathType Container)){
    throw 'Encrypted Z: backup drive unavailable. Unlock it first.'
}
$drive=Get-PSDrive Z -ErrorAction Stop
if($null -eq $drive.Free -or $drive.Free -lt 100MB){
    throw 'Less than 100 MB free on encrypted Z: drive. Refusing export.'
}
$expectedSlugs=@('staff-auth','workshop-api','pc-app','pc-app-v2','pc-app-v3','publish-pc-site','publish-pc-svg','auth-diagnostic','voice-api')
$cli=Get-Command 'supabase' -ErrorAction SilentlyContinue
if($null -ne $cli){
    $runner=$cli.Source
    $prefix=@()
    Write-Host ('Using installed Supabase CLI: {0}' -f $runner)
} else {
    $npx=Get-Command 'npx' -ErrorAction SilentlyContinue
    if($null -eq $npx){
        throw 'Neither supabase CLI nor npx was found. Install Supabase CLI on this PC; no backup started. Do not use production database credentials here.'
    }
    $runner=$npx.Source
    $prefix=@('--yes','supabase@latest')
    Write-Host 'Supabase CLI not installed; using npx to fetch/run Supabase CLI in the npm cache (may require internet).'
}
function RunSupabase([string[]]$arguments){
    $oldPref=$ErrorActionPreference
    try{
        $ErrorActionPreference='Continue'
        & $runner @prefix @arguments
        $exit=$LASTEXITCODE
    } finally {
        $ErrorActionPreference=$oldPref
    }
    if($exit -ne 0){
        throw ('Supabase CLI command failed (exit {0}): {1}. If authentication expired, run: supabase login on your own PC. Never paste a token or password into chat.' -f $exit,($arguments -join ' '))
    }
}
$oldPref=$ErrorActionPreference
try{
    $ErrorActionPreference='Continue'
    $helpLines=@(& $runner @prefix functions download --help 2>&1)
    $helpExit=$LASTEXITCODE
} finally { $ErrorActionPreference=$oldPref }
$help=$helpLines -join [Environment]::NewLine
if($helpExit -ne 0){throw 'Supabase CLI functions download --help failed. No production action or backup started.'}
if($help -match '(?m)--remote(?:\b|[=\[])'){
    $remoteArgs=@('--remote='+$project)
} elseif($help -match '--project-ref'){
    $remoteArgs=@('--project-ref',$project)
} else {
    throw 'Current CLI exposes neither --remote nor --project-ref; refusing to guess a project.'
}
if($help -notmatch '--use-api'){
    throw 'Current CLI does not expose --use-api. Aborting instead of requiring Docker or altering production.'
}
Write-Host 'Testing read-only function listing and local CLI authorization...'
RunSupabase (@('functions','list') + $remoteArgs)
$raw=Invoke-WebRequest -UseBasicParsing -Uri $manifestUrl -TimeoutSec 45
$manifest=("$($raw.Content)" | ConvertFrom-Json)
if($manifest.project_ref -ne $project -or
   $manifest.status -ne 'SOURCE_HASH_INVENTORY__NOT_YET_SAVED_TO_PC' -or
   @($manifest.functions).Count -ne 9){
    throw 'Pinned Edge source SHA256 inventory is missing or invalid. No backup started.'
}
$entries=@($manifest.functions)
for($i=0;$i -lt $expectedSlugs.Count;$i++){
    if($entries[$i].slug -cne $expectedSlugs[$i] -or
       $entries[$i].version -lt 1 -or
       $entries[$i].source_file_count -lt 1 -or
       @($entries[$i].files).Count -ne [int]$entries[$i].source_file_count){
        throw 'Pinned Edge Function inventory drift or unexpected order. No backup started.'
    }
}
$expectedFiles=0
foreach($fn in $entries){$expectedFiles += [int]$fn.source_file_count}
if($expectedFiles -ne 53 -or
   $entries[1].slug -ne 'workshop-api' -or
   [int]$entries[1].version -ne 123 -or
   [int]$entries[1].source_file_count -ne 43){
    throw 'Expected nine live functions and 53 source files including deno.json. No backup started.'
}
$stamp=[DateTimeOffset]::UtcNow.ToString('yyyyMMdd-HHmmss')
$dest=Join-Path $root ('ZUKAIT-EDGE-SOURCES-'+$stamp+'-'+[guid]::NewGuid().ToString('N').Substring(0,8))
New-Item -ItemType Directory -Path $dest -ErrorAction Stop | Out-Null
$localManifest=Join-Path $dest 'EXPECTED-LIVE-SOURCE-SHA256.json'
[IO.File]::WriteAllText($localManifest,[string]$raw.Content,[Text.UTF8Encoding]::new($false))
$startedUtc=[DateTimeOffset]::UtcNow.ToString('o')
$functionRoot=Join-Path $dest 'supabase\functions'
New-Item -ItemType Directory -Path $functionRoot -Force -ErrorAction Stop | Out-Null

# Use an isolated local directory. The CLI init operation is LOCAL ONLY
# and creates a basic config; no Supabase link or production config changes.
Push-Location $dest
try{
    Write-Host 'Initializing isolated local download workspace (no production changes)...'
    RunSupabase @('init')
    foreach($fn in $entries){
        Write-Host ('Downloading {0} (expected deployed v{1}) ...' -f $fn.slug,$fn.version)
        RunSupabase (@('functions','download',[string]$fn.slug) + $remoteArgs + @('--use-api'))
    }
} finally { Pop-Location }

# Current CLI may omit deno.json from a downloaded Edge Function. Only
# fill the three precise, independently read-back tiny dependency files.
# Their contents were read via the Supabase Management API; hashes below
# are checked against the pinned full per-file inventory before writing.
$denoContent=@{
    'staff-auth'=[byte[]](123,125,10)
    'workshop-api'=[byte[]](123,125)
    'voice-api'=[byte[]](123,125)
}
$sourceBackupFiles=0
$hashRows=New-Object 'System.Collections.Generic.List[object]'
foreach($fn in $entries){
    $folder=Join-Path $functionRoot ([string]$fn.slug)
    if(!(Test-Path -LiteralPath $folder -PathType Container)){
        throw ("Downloaded directory missing for {0}; incomplete backup preserved at {1}" -f $fn.slug,$dest)
    }
    foreach($file in @($fn.files)){
        $logical=[string]$file.path
        if($logical.StartsWith('/') -or
           $logical.Contains('\') -or
           $logical -match '(^|/)\.\.?(/|$)' -or
           $logical -notmatch '^[A-Za-z0-9_.\-/]+$'){
            throw ('Unexpected unsafe relative source path in checksum inventory: {0}' -f $logical)
        }
        $target=Join-Path $folder ($logical.Replace('/','\'))
        $parent=Split-Path -Path $target -Parent
        if($logical -eq 'deno.json' -and !(Test-Path -LiteralPath $target) -and
           $denoContent.ContainsKey([string]$fn.slug)){
            $bytes=[byte[]]$denoContent[[string]$fn.slug]
            $sha=[System.Security.Cryptography.SHA256]::Create()
            try{
                $actualHash=([BitConverter]::ToString($sha.ComputeHash($bytes))).Replace('-','').ToLowerInvariant()
            } finally { $sha.Dispose() }
            if($actualHash -cne [string]$file.sha256 -or
               $bytes.Length -ne [long]$file.bytes){
                throw ('Cannot independently match exact deno.json bytes for '+$fn.slug)
            }
            New-Item -Path $parent -ItemType Directory -Force -ErrorAction Stop | Out-Null
            [IO.File]::WriteAllBytes($target,$bytes)
            Write-Host ('Recovered missing deno.json using verified deployed readback: '+$fn.slug)
        }
        if(!(Test-Path -LiteralPath $target -PathType Leaf)){
            throw ("Missing deployed source file: {0}/{1} (backup preserved, incomplete)" -f $fn.slug,$logical)
        }
        $size=(Get-Item -LiteralPath $target).Length
        $hash=(Get-FileHash -LiteralPath $target -Algorithm SHA256).Hash.ToLowerInvariant()
        if($size -ne [long]$file.bytes -or $hash -cne [string]$file.sha256){
            throw ("Downloaded source differs from pinned deployed readback: {0}/{1}. Do not deploy; backup remains incomplete. Keep folder for investigation: {2}" -f $fn.slug,$logical,$dest)
        }
        $hashRows.Add([pscustomobject]@{
            slug=[string]$fn.slug
            source_file=$logical
            bytes=[long]$size
            sha256=$hash
        }) | Out-Null
        $sourceBackupFiles++
    }
}
if($sourceBackupFiles -ne 53 -or $hashRows.Count -ne 53){
    throw 'Final source-file count mismatch: expected 53, backup incomplete.'
}
# Ensure an unexpected CLI-generated function directory is not mistaken
# for a verified source. Do not delete extra files; report as caveat.
$extraFolders=@(Get-ChildItem -LiteralPath $functionRoot -Directory | Where-Object {$expectedSlugs -notcontains $_.Name})
if($extraFolders.Count -gt 0){
    throw ('Unexpected extra functions in download workspace; do not claim an exact nine-function backup.')
}
$filesArray=$hashRows.ToArray()
$report=Join-Path $dest 'EDGE-SOURCE-BACKUP-PASSED.json'
if(Test-Path -LiteralPath $report){throw 'Unexpected already present report; refusing to overwrite.'}
[pscustomobject]@{
    status='NINE_DEPLOYED_EDGE_FUNCTIONS_53_FILES_HASH_VERIFIED_AGAINST_PINNED_LIVE_READBACK'
    project_ref=$project
    started_utc=$startedUtc
    finished_utc=[DateTimeOffset]::UtcNow.ToString('o')
    function_count=9
    file_count=53
    pinned_inventory='EDGE_FUNCTION_LIVE_SOURCE_SHA256_20261115.json'
    files=$filesArray
    caveats=@(
        'Deployed source readback was captured separately on 2026-11-15; source/content SHA match is verified but live deployed function versions may have changed during download',
        'deno.json contents for staff-auth, workshop-api and voice-api may be reconstructed locally only when they match pinned deployment SHA256',
        'Does not include runtime secret values, all platform config, Supabase Auth/Storage or database backups',
        'Not a transaction-consistent recoverable application or an approval to optimize production history'
    )
    no_production_changes=$true
} | ConvertTo-Json -Depth 8 | Set-Content -LiteralPath $report -Encoding UTF8
Write-Host 'EDGE SOURCE BACKUP PASSED - 9 functions and 53 files match live SHA256 readback.'
Write-Host "Backup directory: $dest"
Write-Host "Report: $report"
Write-Warning 'No functions deployed. Runtime secrets/config and full recovery remain separate checks.'
