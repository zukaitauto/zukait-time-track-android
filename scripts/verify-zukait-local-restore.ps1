#Requires -Version 5.1
<#
ZUKAIT - ISOLATED LOCAL PostgreSQL 17 restore rehearsal.
SOURCE: private encrypted Z: drive core dump + verified gzipped binary COPY chunks.
DESTINATION: PostgreSQL on 127.0.0.1 ONLY. No Supabase endpoint, connection,
production writes, migrations, retention changes, or automatic cleanup.
Reruns safely resume a locally interrupted history import.
Database is deliberately retained for later read-only acceptance tests.
#>
[CmdletBinding()]
param(
    [string]$BackupRoot = 'Z:\Zukait-20261025',
    [string]$LocalPort = '5432',
    [string]$LocalUser = 'postgres',
    [string]$LocalDatabase = 'zukait_restore_rehearsal_20261114'
)
$ErrorActionPreference = 'Stop'
Set-StrictMode -Version Latest
$pg = 'C:\Program Files\PostgreSQL\17\bin'
$psql = Join-Path $pg 'psql.exe'
$createdb = Join-Path $pg 'createdb.exe'
$pgRestore = Join-Path $pg 'pg_restore.exe'
$localHost = '127.0.0.1'
foreach ($binary in @($psql,$createdb,$pgRestore)) {
    if (!(Test-Path -LiteralPath $binary -PathType Leaf)) {
        throw "Missing PostgreSQL 17 executable: $binary"
    }
}
if ($LocalDatabase -notmatch '^zukait_restore_rehearsal_[0-9]{8}$') {
    throw 'Refusing a database name outside the dedicated rehearsal prefix.'
}
if ($LocalPort -notmatch '^[0-9]{2,5}$') { throw 'Invalid local PostgreSQL port.' }
if (!(Test-Path -LiteralPath $BackupRoot -PathType Container)) {
    throw 'Unlock the encrypted Z: drive first.'
}
$root = [IO.Path]::GetFullPath($BackupRoot)
$core = Join-Path $root 'ZUKAIT-CORE-20261114-110718\workshop-core.dump'
$history = Join-Path $root 'ZUKAIT-HISTORY-CHUNKED'
$manifestPath = Join-Path $history 'history-export-manifest.json'
$work = Join-Path $root 'ZUKAIT-LOCAL-RESTORE-REHEARSAL'
$statePath = Join-Path $work 'rehearsal-state.json'
$passedPath = Join-Path $work 'RESTORE-PASSED.json'
if (!(Test-Path -LiteralPath $core -PathType Leaf) -or (Get-Item -LiteralPath $core).Length -lt 1000) {
    throw 'Verified core archive is absent or too short. No restore started.'
}
if (!(Test-Path -LiteralPath $manifestPath -PathType Leaf)) {
    throw 'History export manifest missing. No restore started.'
}
$plan = Get-Content -LiteralPath $manifestPath -Raw | ConvertFrom-Json
if ($plan.project_ref -ne 'pjknotnjkufadqavcmii' -or
    $plan.format -ne 'PG17_BINARY_COPY_GZIP_V1' -or
    $plan.status -ne 'ALL_CHUNKS_COMPRESSED_AND_READ_BACK_VERIFIED' -or
    [long]$plan.exported_rows -ne [long]$plan.expected_rows -or
    [long]$plan.expected_rows -lt 10000) {
    throw 'History export manifest has not passed its final checks.'
}
$sidecarFiles = @(Get-ChildItem -LiteralPath $history -File -Filter 'rev-*.json' | Sort-Object Name)
if ($sidecarFiles.Count -lt 2) { throw 'No verified history chunk sidecars found.' }
$chunks = [Collections.Generic.List[object]]::new()
$nextRevision = [long]$plan.first_revision
$expectedRecords = [long]0
foreach ($metaFile in $sidecarFiles) {
    if ($metaFile.Name -notmatch '^rev-(\d{8})-(\d{8})\.json$') {
        throw "Unexpected chunk filename: $($metaFile.Name)"
    }
    $lo = [long]$Matches[1]
    $hi = [long]$Matches[2]
    if ($lo -ne $nextRevision -or $lo -gt $hi) {
        throw "History chunk gap or overlap at revision $nextRevision"
    }
    $record = Get-Content -LiteralPath $metaFile.FullName -Raw | ConvertFrom-Json
    if ([long]$record.first_revision -ne $lo -or [long]$record.last_revision -ne $hi -or
        [long]$record.rows -lt 0 -or
        [long]$record.rows -gt ($hi-$lo+1) -or
        $record.format -ne 'PG17_BINARY_COPY_GZIP_V1') {
        throw "Bad history chunk metadata: $($metaFile.Name)"
    }
    $gzName = ('rev-{0:D8}-{1:D8}.bin.gz' -f $lo,$hi)
    $gz = Join-Path $history $gzName
    if (!(Test-Path -LiteralPath $gz -PathType Leaf)) {
        throw "Missing compressed history chunk: $gzName"
    }
    $chunks.Add([pscustomobject]@{
        low=$lo; high=$hi; rows=[long]$record.rows
        gz=$gz; gzHash=[string]$record.gz_sha256
        rawHash=[string]$record.raw_sha256
        name=$gzName
    })
    $expectedRecords += [long]$record.rows
    $nextRevision = $hi+1
}
if ($nextRevision -ne [long]$plan.cutoff_revision+1 -or
    $expectedRecords -ne [long]$plan.expected_rows) {
    throw 'History chunk continuity or row totals do not match the final manifest.'
}
Write-Host "HISTORY MANIFEST PASSED: $($chunks.Count) chunks; $expectedRecords rows; through revision $($plan.cutoff_revision)."

# LOCAL-ONLY DATABASE CONNECTION. Host is literal IPv4 loopback, NEVER remote.
$env:PGSSLMODE = 'disable'
$secret = Read-Host 'Enter LOCAL PostgreSQL postgres password (not Supabase password)' -AsSecureString
$ptr = [Runtime.InteropServices.Marshal]::SecureStringToBSTR($secret)
try { $env:PGPASSWORD = [Runtime.InteropServices.Marshal]::PtrToStringBSTR($ptr) }
finally { [Runtime.InteropServices.Marshal]::ZeroFreeBSTR($ptr) }
$baseArgs = @('-X','-v','ON_ERROR_STOP=1','-h',$localHost,'-p',$LocalPort,'-U',$LocalUser)
try {
    $identity = & $psql @baseArgs -d postgres -At -F '|' -c "select inet_server_addr()::text,current_setting('server_version_num'),current_setting('data_directory')"
    if ($LASTEXITCODE -ne 0) { throw 'Local PostgreSQL is not reachable; start the local PostgreSQL 17 service.' }
    $parts = "$identity".Trim() -split '\|',3
    if ($parts.Count -ne 3 -or $parts[0] -ne $localHost -or [int]$parts[1] -lt 170000 -or [int]$parts[1] -ge 180000) {
        throw 'Refusing to restore: target is not local PostgreSQL 17 on 127.0.0.1.'
    }
    $dataDirectory = $parts[2]
    $dataRoot = [IO.Path]::GetPathRoot($dataDirectory)
    if ($dataRoot -notmatch '^[A-Za-z]:\\$') {
        throw 'Local PostgreSQL data directory is not a Windows drive; check disk space manually.'
    }
    $dataDrive = Get-PSDrive -Name $dataRoot.Substring(0,1)
    $minFree = 8GB
    if ($dataDrive.Free -lt $minFree) {
        throw ('Insufficient space on local PostgreSQL data drive {0}: {1:N1} GB free; at least 8 GB required.' -f $dataRoot,($dataDrive.Free/1GB))
    }
    if (!(Test-Path -LiteralPath $work)) {
        New-Item -ItemType Directory -Path $work | Out-Null
    }

    # The marker must exist to allow use of an existing local DB. This prevents
    # touching any earlier rehearsal or any other user-owned local database.
    $markerExists = Test-Path -LiteralPath $statePath
    if ($markerExists) {
        $state = Get-Content -LiteralPath $statePath -Raw | ConvertFrom-Json
        if ($state.database -ne $LocalDatabase -or $state.host -ne $localHost -or
            [long]$state.cutoff_revision -ne [long]$plan.cutoff_revision -or
            [long]$state.expected_rows -ne $expectedRecords) {
            throw 'Existing rehearsal marker does not match the target or backup. Refusing to overwrite.'
        }
    }
    $existing = & $psql @baseArgs -d postgres -At -c "select count(*) from pg_database where datname='$LocalDatabase'"
    if ($LASTEXITCODE -ne 0) { throw 'Could not check the local rehearsal database name.' }
    if (!$markerExists -and "$existing".Trim() -ne '0') {
        throw "Local database $LocalDatabase already exists without our safety marker; refusing access."
    }
    if ($markerExists -and "$existing".Trim() -ne '1') {
        throw 'Rehearsal marker exists but the local database is missing. Refusing to guess.'
    }

    if (!$markerExists) {
        # Write marker BEFORE creating database. Never connect to Supabase.
        [pscustomobject]@{
            database=$LocalDatabase
            host=$localHost
            port=$LocalPort
            cutoff_revision=[long]$plan.cutoff_revision
            expected_rows=$expectedRecords
            started_utc=[DateTimeOffset]::UtcNow.ToString('o')
        } | ConvertTo-Json | Set-Content -LiteralPath $statePath -Encoding UTF8
        & $createdb -h $localHost -p $LocalPort -U $LocalUser -T template0 $LocalDatabase
        if ($LASTEXITCODE -ne 0) { throw 'Creating isolated local rehearsal database failed. Nothing touched in production.' }
        Write-Host "CREATED LOCAL-ONLY DATABASE: $LocalDatabase"
    }

    $coreFlag = Join-Path $work 'core-restored.flag'
    if (!(Test-Path -LiteralPath $coreFlag)) {
        $objects = & $psql @baseArgs -d $LocalDatabase -At -c "select count(*) from pg_class c join pg_namespace n on n.oid=c.relnamespace where n.nspname='public' and c.relname in ('workshop_state','workshop_state_history')"
        if ($LASTEXITCODE -ne 0) { throw 'Could not inspect the new local database.' }
        if ("$objects".Trim() -ne '0') {
            throw 'Partial local schema restore exists. Stop and inspect; automatic cleanup is forbidden.'
        }
        Write-Host 'RESTORING CORE ARCHIVE TO LOCAL DATABASE (not Supabase).'
        & $pgRestore -h $localHost -p $LocalPort -U $LocalUser -d $LocalDatabase --no-owner --no-privileges --clean --if-exists --exit-on-error --single-transaction $core
        if ($LASTEXITCODE -ne 0) {
            throw 'Local core schema/data restore failed. No remote database was used. Save this error for diagnosis.'
        }
        $coreRows = & $psql @baseArgs -d $LocalDatabase -At -c "select count(*) from public.workshop_state where id='main'"
        $historyRows = & $psql @baseArgs -d $LocalDatabase -At -c "select count(*) from public.workshop_state_history"
        if ($LASTEXITCODE -ne 0 -or "$coreRows".Trim() -ne '1' -or "$historyRows".Trim() -ne '0') {
            throw 'Local core archive did not restore expected main state and empty history table.'
        }
        'CORE_RESTORED_LOCALLY' | Set-Content -LiteralPath $coreFlag
        Write-Host 'CORE RESTORE VERIFIED: workshop_state main row present, history table empty.'
    }

    $temp = Join-Path $work 'chunk-replay.bin.part'
    foreach ($chunk in $chunks) {
        $localCount = & $psql @baseArgs -d $LocalDatabase -At -c "select count(*) from public.workshop_state_history where revision >= $($chunk.low) and revision <= $($chunk.high)"
        if ($LASTEXITCODE -ne 0) { throw 'Local restored-history read failed.' }
        $count = [long]"$localCount".Trim()
        if ($count -eq $chunk.rows -and $chunk.rows -gt 0) {
            Write-Host "Already restored: $($chunk.low)-$($chunk.high)"
            continue
        }
        if ($count -ne 0) {
            throw "Local history contains $count unexpected/partial records in range $($chunk.low)-$($chunk.high). Stopping."
        }
        if ((Get-FileHash -LiteralPath $chunk.gz -Algorithm SHA256).Hash -ne $chunk.gzHash) {
            throw "Backup archive checksum mismatch for $($chunk.name)"
        }
        if (Test-Path -LiteralPath $temp) { Remove-Item -LiteralPath $temp -Force }
        $input = [IO.File]::OpenRead($chunk.gz)
        $gunzip = [IO.Compression.GZipStream]::new($input,[IO.Compression.CompressionMode]::Decompress)
        $output = [IO.File]::Create($temp)
        try { $gunzip.CopyTo($output) }
        finally { $output.Dispose();$gunzip.Dispose();$input.Dispose() }
        if ((Get-FileHash -LiteralPath $temp -Algorithm SHA256).Hash -ne $chunk.rawHash) {
            throw "Restored compressed bytes do not match original binary export: $($chunk.name)"
        }
        $source = $temp.Replace('\','/').Replace("'","''")
        $copy = "\copy public.workshop_state_history (revision,data,updated_at,updated_by,archived_at) from '$source' with (format binary)"
        $response = & $psql @baseArgs -d $LocalDatabase -c $copy
        if ($LASTEXITCODE -ne 0) {
            throw "Local COPY restoration failed for $($chunk.name). Existing backups are untouched."
        }
        $verified = & $psql @baseArgs -d $LocalDatabase -At -c "select count(*) from public.workshop_state_history where revision >= $($chunk.low) and revision <= $($chunk.high)"
        if ($LASTEXITCODE -ne 0 -or [long]"$verified".Trim() -ne $chunk.rows) {
            throw "Local imported row-count mismatch for $($chunk.name)"
        }
        Remove-Item -LiteralPath $temp -Force
        Write-Host ("Restored locally: {0}-{1} ({2} records)" -f $chunk.low,$chunk.high,$chunk.rows)
    }

    $summary = & $psql @baseArgs -d $LocalDatabase -At -F '|' -c "select count(*),min(revision),max(revision),count(*) filter(where data is null) from public.workshop_state_history"
    if ($LASTEXITCODE -ne 0) { throw 'Could not verify total restored history.' }
    $totals = "$summary".Trim() -split '\|'
    if ($totals.Count -ne 4 -or
        [long]$totals[0] -ne $expectedRecords -or
        [long]$totals[1] -ne [long]$plan.first_revision -or
        [long]$totals[2] -ne [long]$plan.cutoff_revision -or
        [long]$totals[3] -ne 0) {
        throw "Restored history control totals FAILED: $summary"
    }
    [pscustomobject]@{
        status='LOCAL_CORE_AND_HISTORY_RESTORE_VERIFIED'
        database=$LocalDatabase; host='127.0.0.1'; source_backup='ZUKAIT'
        history_rows=[long]$totals[0]; min_revision=[long]$totals[1]
        max_revision=[long]$totals[2]; null_json_rows=[long]$totals[3]
        finished_utc=[DateTimeOffset]::UtcNow.ToString('o')
        recovery_point_note='Core dump and history export were captured separately; not one transaction-consistent production point.'
        pending='Separate app/read compatibility, permissions, disk headroom and rollout gates.'
    } | ConvertTo-Json | Set-Content -LiteralPath $passedPath -Encoding UTF8
    Write-Host "LOCAL RESTORE PASSED - $expectedRecords history records restored and checked"
    Write-Host "LOCAL DATABASE: $LocalDatabase"
    Write-Host "REPORT: $passedPath"
    Write-Host 'Original backups unchanged. Production Supabase was NOT contacted.'
}
finally {
    Remove-Item Env:\PGPASSWORD -ErrorAction SilentlyContinue
    Remove-Item Env:\PGSSLMODE -ErrorAction SilentlyContinue
}
