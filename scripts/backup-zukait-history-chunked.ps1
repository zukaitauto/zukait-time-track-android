#Requires -Version 5.1
<#
ZUKAIT resumable read-only workshop history backup.
Uses Windows PostgreSQL 17, local encrypted Z: drive, and small COPY chunks.
No Supabase writes, history deletion, schema updates or extra paid service.
The core backup and an isolated restore test remain separate requirements.
#>
[CmdletBinding()]
param(
    [string]$BackupRoot = 'Z:\Zukait-20261025',
    [ValidateRange(25,500)][int]$ChunkSize = 100
)
$ErrorActionPreference = 'Stop'
Set-StrictMode -Version Latest
$psql = 'C:\Program Files\PostgreSQL\17\bin\psql.exe'
$hostName = 'db.pjknotnjkufadqavcmii.supabase.co'
$projectRef = 'pjknotnjkufadqavcmii'
$format = 'PG17_BINARY_COPY_GZIP_V1'
if (!(Test-Path -LiteralPath $psql -PathType Leaf)) { throw 'PostgreSQL 17 psql.exe not found.' }
if (!(Test-Path -LiteralPath $BackupRoot -PathType Container)) { throw 'Unlock encrypted backup drive first.' }
$folder = Join-Path ([IO.Path]::GetFullPath($BackupRoot)) 'ZUKAIT-HISTORY-CHUNKED'
if (!(Test-Path -LiteralPath $folder)) { New-Item -ItemType Directory -Path $folder | Out-Null }
$manifestPath = Join-Path $folder 'history-export-manifest.json'
$common = @('-X','-v','ON_ERROR_STOP=1','-h',$hostName,'-p','5432','-U','postgres','-d','postgres')
$env:PGSSLMODE = 'require'
$env:PGAPPNAME = 'zukait-history-chunked-export'
$env:PGOPTIONS = '-c default_transaction_read_only=on -c statement_timeout=90000'
$secret = Read-Host 'Enter production PostgreSQL password (hidden)' -AsSecureString
$ptr = [Runtime.InteropServices.Marshal]::SecureStringToBSTR($secret)
try { $env:PGPASSWORD = [Runtime.InteropServices.Marshal]::PtrToStringBSTR($ptr) }
finally { [Runtime.InteropServices.Marshal]::ZeroFreeBSTR($ptr) }

try {
    $who = & $psql @common -At -c 'select current_database()'
    if ($LASTEXITCODE -ne 0 -or "$who".Trim() -ne 'postgres') { throw 'Database credential check failed.' }

    if (Test-Path -LiteralPath $manifestPath) {
        $plan = Get-Content -LiteralPath $manifestPath -Raw | ConvertFrom-Json
        if ($plan.project_ref -ne $projectRef -or $plan.format -ne $format -or
            [int]$plan.chunk_size -ne $ChunkSize) {
            throw 'Existing export manifest is incompatible; refusing to mix backup files.'
        }
    } else {
        $meta = & $psql @common -At -F '|' -c 'select coalesce(min(revision),0),coalesce(max(revision),0),count(*) from public.workshop_state_history'
        if ($LASTEXITCODE -ne 0) { throw 'Could not read history bounds.' }
        $parts = "$meta".Trim() -split '\|'
        if ($parts.Count -ne 3) { throw 'Unexpected history metadata format.' }
        $plan = [pscustomobject]@{
            project_ref=$projectRef; format=$format; status='INCOMPLETE'
            first_revision=[long]$parts[0]; cutoff_revision=[long]$parts[1]
            expected_rows=[long]$parts[2]; chunk_size=$ChunkSize
            started_at_utc=[DateTimeOffset]::UtcNow.ToString('o')
            completed_at_utc=$null; exported_rows=0
        }
        $plan | ConvertTo-Json | Set-Content -LiteralPath $manifestPath -Encoding UTF8
    }

    $total = [long]0
    $first = [long]$plan.first_revision
    $cutoff = [long]$plan.cutoff_revision
    Write-Host "Starting/resuming bounded history export: revisions $first to $cutoff"
    for ($lo = $first; $lo -le $cutoff; $lo += $ChunkSize) {
        $hi = [Math]::Min($cutoff,$lo+$ChunkSize-1)
        $base = 'rev-{0:D8}-{1:D8}' -f $lo,$hi
        $bin = Join-Path $folder ($base+'.bin.part')
        $gzPart = Join-Path $folder ($base+'.bin.gz.part')
        $verify = Join-Path $folder ($base+'.verified.part')
        $gz = Join-Path $folder ($base+'.bin.gz')
        $sidecar = Join-Path $folder ($base+'.json')
        if (Test-Path -LiteralPath $sidecar) {
            if (!(Test-Path -LiteralPath $gz)) { throw "Missing saved data: $base" }
            $record = Get-Content -LiteralPath $sidecar -Raw | ConvertFrom-Json
            if ([long]$record.first_revision -ne $lo -or [long]$record.last_revision -ne $hi -or
                (Get-FileHash -LiteralPath $gz -Algorithm SHA256).Hash -ne $record.gz_sha256) {
                throw "Saved chunk validation failed: $base"
            }
            $total += [long]$record.rows
            Write-Host "Existing chunk verified: $base"
            continue
        }
        if (Test-Path -LiteralPath $gz) { throw "Unverified archive exists, refusing overwrite: $base" }
        foreach ($tmp in @($bin,$gzPart,$verify)) {
            if (Test-Path -LiteralPath $tmp) { Remove-Item -LiteralPath $tmp -Force }
        }
        $destination = $bin.Replace('\','/').Replace("'","''")
        $copyCommand = "\copy (select revision,data,updated_at,updated_by,archived_at from public.workshop_state_history where revision >= $lo and revision <= $hi order by revision) to '$destination' with (format binary)"
        $copyMessage = & $psql @common -c $copyCommand 2>&1
        if ($LASTEXITCODE -ne 0) { throw "Export failed for $base. Rerun to resume. $copyMessage" }
        $match = [regex]::Match(($copyMessage -join [Environment]::NewLine),'(?m)^COPY\s+(\d+)\s*$')
        if (!$match.Success) { throw "Missing confirmed COPY row count: $base" }
        $count = [long]$match.Groups[1].Value
        if (!(Test-Path -LiteralPath $bin) -or (Get-Item -LiteralPath $bin).Length -lt 21) {
            throw "Incomplete binary export: $base"
        }
        $sourceHash = (Get-FileHash -LiteralPath $bin -Algorithm SHA256).Hash

        # Local gzip compression; no remote server CPU work for compression.
        $inputStream = [IO.File]::OpenRead($bin)
        $outputStream = [IO.File]::Create($gzPart)
        $compressor = [IO.Compression.GZipStream]::new($outputStream,[IO.Compression.CompressionLevel]::Optimal,$true)
        try { $inputStream.CopyTo($compressor) }
        finally { $compressor.Dispose();$outputStream.Dispose();$inputStream.Dispose() }

        # Read the entire compressed stream back locally and compare hashes.
        $compressedStream = [IO.File]::OpenRead($gzPart)
        $decompressor = [IO.Compression.GZipStream]::new($compressedStream,[IO.Compression.CompressionMode]::Decompress)
        $verificationStream = [IO.File]::Create($verify)
        try { $decompressor.CopyTo($verificationStream) }
        finally { $verificationStream.Dispose();$decompressor.Dispose();$compressedStream.Dispose() }
        if ((Get-FileHash -LiteralPath $verify -Algorithm SHA256).Hash -ne $sourceHash) {
            throw "Compressed chunk verification failed: $base"
        }
        $gzHash = (Get-FileHash -LiteralPath $gzPart -Algorithm SHA256).Hash
        Move-Item -LiteralPath $gzPart -Destination $gz
        [pscustomobject]@{
            first_revision=$lo;last_revision=$hi;rows=$count
            raw_sha256=$sourceHash;gz_sha256=$gzHash;format=$format
        } | ConvertTo-Json | Set-Content -LiteralPath $sidecar -Encoding UTF8
        Remove-Item -LiteralPath $bin,$verify -Force
        $total += $count
        Write-Host ("Verified {0} ({1} records)" -f $base,$count)
        Start-Sleep -Milliseconds 350
    }
    $readBack = & $psql @common -At -c "select count(*) from public.workshop_state_history where revision >= $first and revision <= $cutoff"
    if ($LASTEXITCODE -ne 0 -or "$readBack".Trim() -ne "$total" -or $total -ne [long]$plan.expected_rows) {
        throw "Revision count mismatch. Exported $total expected $($plan.expected_rows) server $readBack"
    }
    $plan.status = 'ALL_CHUNKS_COMPRESSED_AND_READ_BACK_VERIFIED'
    $plan.exported_rows = $total
    $plan.completed_at_utc = [DateTimeOffset]::UtcNow.ToString('o')
    $plan | ConvertTo-Json | Set-Content -LiteralPath $manifestPath -Encoding UTF8
    Write-Host "HISTORY BACKUP COMPLETED - $total records verified"
    Write-Host "Saved to: $folder"
    Write-Host 'Keep the core dump. A separate isolated restore test is still required.'
}
finally {
    Remove-Item Env:\PGPASSWORD -ErrorAction SilentlyContinue
    Remove-Item Env:\PGOPTIONS -ErrorAction SilentlyContinue
    Remove-Item Env:\PGAPPNAME -ErrorAction SilentlyContinue
}
