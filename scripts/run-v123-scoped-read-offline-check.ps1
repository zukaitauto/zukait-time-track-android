#Requires -Version 5.1
<#
Runs the pinned ZUKAIT workshop-api v123 isolated runtime qualification locally.
Downloads only PUBLIC test metadata/tools from pinned GitHub commit.
It never sends backed-up source, passwords or user data over the network.
The test harness verifies 43 source hashes then applies the patch in memory,
compares synthetic API responses and writes a report to a separate folder.
Never touches Supabase production or the original encrypted backup contents.
#>
[CmdletBinding()]
param()
$ErrorActionPreference='Stop'
Set-StrictMode -Version Latest
$base='Z:\Zukait-20261025'
$backup=Join-Path $base 'ZUKAIT-EDGE-SOURCES-20261115-124648-f701d082'
$dir=Join-Path $backup 'supabase\functions\workshop-api'
$manifest=Join-Path $backup 'EXPECTED-LIVE-SOURCE-SHA256.json'
$node=Get-Command node -ErrorAction SilentlyContinue
if($null -eq $node){throw 'Node.js 22 or newer was not found. No backup changed. Please install supported Node.js or request a different test method.'}
$versionText=& $node.Source --version
if($LASTEXITCODE -ne 0){throw 'Node.js executable did not run.'}
$major=[int](([string]$versionText).TrimStart('v').Split('.')[0])
if($major -lt 22){throw ("Node.js 22+ required; installed version is "+$versionText)}
if(!(Test-Path -LiteralPath $dir -PathType Container)){throw "Expected encrypted Z: backup is missing: $dir"}
if(!(Test-Path -LiteralPath $manifest -PathType Leaf)){throw "Expected pinned source hash manifest is missing: $manifest"}
$rev='4629f07562e8c68d74d55242f54f800e7843b4e8'
$root="https://raw.githubusercontent.com/zukaitauto/zukait-time-track-android/$rev/"
$workspace=Join-Path $env:TEMP ('zukait-v123-test-'+[guid]::NewGuid().ToString('N').Substring(0,10))
New-Item -ItemType Directory -Path $workspace -ErrorAction Stop | Out-Null
$harness=Join-Path $workspace 'verify-v123-scoped-read-isolated.mjs'
$patch=Join-Path $workspace 'WORKSHOP_API_V123_SCOPED_READ_ONLY.patch'
Write-Host 'Preparing pinned test files (no source backup is uploaded)...'
Invoke-WebRequest -UseBasicParsing -Uri ($root+'scripts/verify-v123-scoped-read-isolated.mjs') -OutFile $harness -TimeoutSec 45
Invoke-WebRequest -UseBasicParsing -Uri ($root+'docs/storage/WORKSHOP_API_V123_SCOPED_READ_ONLY.patch') -OutFile $patch -TimeoutSec 45
Write-Host ('Running isolated synthetic tests against actual v123 backup. Node '+$versionText)
# Windows PowerShell 5.1 converts native STDERR (including harmless Node warnings)
# into ErrorRecord objects. Temporarily allow non-terminating STDERR, while
# still failing closed on the actual Node process exit code.
$priorErrorActionPreference=$ErrorActionPreference
try {
    $ErrorActionPreference='Continue'
    $out=@(& $node.Source $harness --function-dir $dir --manifest $manifest --patch $patch 2>&1)
    $exit=$LASTEXITCODE
} finally {
    $ErrorActionPreference=$priorErrorActionPreference
}
foreach($line in $out){Write-Host ([string]$line)}
if($exit -ne 0){throw ('Isolated test did not pass; exit code '+$exit+'. Original encrypted backup is unchanged. Do not deploy.')}
$reports=@($out | ForEach-Object {[string]$_} | Where-Object {$_ -like 'REPORT: *'})
if($reports.Count -ne 1){throw 'The synthetic test passed but the report path was not unambiguous. No production effect.'}
$sourceReport=$reports[0].Substring(8).Trim()
if(!(Test-Path -LiteralPath $sourceReport -PathType Leaf)){throw 'Synthetic test report was not found.'}
$parsed=Get-Content -LiteralPath $sourceReport -Raw | ConvertFrom-Json
if($parsed.status -cne 'V123_EXACT_43_FILES_OFFLINE_RUNTIME_TEST_PASSED' -or
   [int]$parsed.verified_source_file_count -ne 43 -or
   [int]$parsed.synthetic_cases -ne 7 -or
   [int]$parsed.production_requests -ne 0 -or
   [int]$parsed.production_writes -ne 0){
    throw 'Synthetic runtime manifest failed structural validation; no PASSED report will be saved.'
}
$destination=Join-Path $base ('ZUKAIT-V123-RUNTIME-TEST-'+[DateTimeOffset]::UtcNow.ToString('yyyyMMdd-HHmmss')+'-'+[guid]::NewGuid().ToString('N').Substring(0,8))
New-Item -ItemType Directory -Path $destination -ErrorAction Stop | Out-Null
$target=Join-Path $destination 'V123-ISOLATED-RUNTIME-TEST-PASSED.json'
Copy-Item -LiteralPath $sourceReport -Destination $target -ErrorAction Stop
Write-Host 'ZUKAIT V123 ISOLATED QUALIFICATION PASSED - Original 43-file source backup untouched.'
Write-Host "REPORT ON ENCRYPTED Z: $target"
Write-Warning 'This is synthetic offline validation, not a production deployment or EBS I/O capacity measurement.'
