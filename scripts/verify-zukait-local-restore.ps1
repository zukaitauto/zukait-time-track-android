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
# -w prevents psql from asking for a second password. Only the password
# entered once at the secure Read-Host prompt is ever used.
$baseArgs = @('-X','-w','-v','ON_ERROR_STOP=1','-h',$localHost,'-p',$LocalPort,'-U',$LocalUser)
try {
    if ([string]::IsNullOrEmpty($env:PGPASSWORD)) {
        throw 'The local PostgreSQL password entry was empty. Run again and enter the NEW local password.'
    }
    # An exact tagged row avoids interpreting native Windows prompts as SQL.
    $identityLines = @(& $psql @baseArgs -d postgres -At -F '|' -c "select 'ZUKAIT_LOCAL_PG17',host(inet_server_addr()),inet_server_port()::text,current_setting('server_version_num'),current_setting('data_directory')")
    $identityExitCode = $LASTEXITCODE
    if ($identityExitCode -ne 0) {
        throw ("Local PostgreSQL connection/authentication failed on 127.0.0.1:{0}. Use the NEW password created with initdb, not the Supabase password." -f $LocalPort)
    }
    $identityMatches = @($identityLines | Where-Object { "$_".StartsWith('ZUKAIT_LOCAL_PG17|') })
    if ($identityMatches.Count -ne 1) {
        Write-Host ("Local identity check returned {0} unrecognized output line(s)." -f $identityLines.Count)
        throw 'Unable to parse the exact local PostgreSQL identity; no restore attempted.'
    }
    $parts = "$($identityMatches[0])".Trim() -split '\|',5
    if ($parts.Count -ne 5) { throw 'Malformed local PostgreSQL identity fields; no restore attempted.' }
    $seenAddress = $parts[1].Trim()
    $seenPort = $parts[2].Trim()
    $seenVersion = $parts[3].Trim()
    $seenDataDir = $parts[4].Trim()
    Write-Host ("LOCAL SERVER CHECK: address={0}, port={1}, version_num={2}" -f $seenAddress,$seenPort,$seenVersion)
    # PostgreSQL inet may render local IPv4 as 127.0.0.1/32 in older outputs.
    $isLocalIpv4 = ($seenAddress -eq $localHost -or $seenAddress -eq ($localHost + '/32'))
    if (!$isLocalIpv4 -or $seenPort -ne $LocalPort -or
        $seenVersion -notmatch '^[0-9]{6}$' -or
        [int]$seenVersion -lt 170000 -or [int]$seenVersion -ge 180000) {
        throw 'Refusing to restore: server address/port/PostgreSQL 17 verification failed.'
    }
    $dataDirectory = $seenDataDir
    # The rehearsal instance on port 55433 must use its known local folder.
    # Reject localhost proxies or a different PostgreSQL installation.
    if ($LocalPort -eq '55433') {
        $expectedDir = Join-Path $env:LOCALAPPDATA 'ZUKAIT\pg17-restore-20261114'
        $actualDir = [IO.Path]::GetFullPath($dataDirectory).TrimEnd('\','/')
        if ($actualDir -ine ([IO.Path]::GetFullPath($expectedDir).TrimEnd('\','/'))) {
            throw ("Refusing to restore: port 55433 does not lead to expected local data folder: {0}" -f $expectedDir)
        }
    }
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
        # Only mark a restore as resumable AFTER local database creation.
        & $createdb -h $localHost -p $LocalPort -U $LocalUser -T template0 $LocalDatabase
        if ($LASTEXITCODE -ne 0) { throw 'Creating isolated local rehearsal database failed. Nothing touched in production.' }
        [pscustomobject]@{
            database=$LocalDatabase
            host=$localHost
            port=$LocalPort
            cutoff_revision=[long]$plan.cutoff_revision
            expected_rows=$expectedRecords
            started_utc=[DateTimeOffset]::UtcNow.ToString('o')
        } | ConvertTo-Json | Set-Content -LiteralPath $statePath -Encoding UTF8
        Write-Host "CREATED LOCAL-ONLY DATABASE: $LocalDatabase"
    }

    $coreFlag = Join-Path $work 'core-restored.flag'
    if (!(Test-Path -LiteralPath $coreFlag)) {
        $objects = & $psql @baseArgs -d $LocalDatabase -At -c "select count(*) from pg_class c join pg_namespace n on n.oid=c.relnamespace where n.nspname='public' and c.relname in ('workshop_state','workshop_state_history')"
        if ($LASTEXITCODE -ne 0) { throw 'Could not inspect the new local database.' }
        if ("$objects".Trim() -ne '0') {
            throw 'Partial local schema restore exists. Stop and inspect; automatic cleanup is forbidden.'
        }
        # The core archive was taken with pg_dump -n public. Its trigger
        # definitions can depend on functions in schemas excluded from the
        # archive (for example zukait_mechanical). Do NOT fabricate stubs or
        # connect to production. For this local DATA RECOVERY rehearsal only,
        # omit every archived TRIGGER entry from pg_restore's TOC; retain all
        # remaining tables, data, constraints, indexes, functions and views.
        # This is NOT proof of a complete application/database recovery.
        $tocLines = @(& $pgRestore --list $core)
        if ($LASTEXITCODE -ne 0 -or $tocLines.Count -eq 0) {
            throw 'Could not inspect the core archive TOC; no local restore attempted.'
        }
        $omittedTriggers = @($tocLines | Where-Object { "$_" -match '^\s*\d+;\s+\d+\s+\d+\s+TRIGGER\s+' })
        if ($omittedTriggers.Count -eq 0) {
            throw 'Archive TOC contains no TRIGGER definitions; cannot apply the expected limited data-recovery path.'
        }
        $tocFiltered = @($tocLines | ForEach-Object {
            if ("$_" -match '^\s*\d+;\s+\d+\s+\d+\s+TRIGGER\s+') {
                ';' + $_
            } else {
                $_
            }
        })
        $tocFilterPath = Join-Path $work 'core-restore-omit-triggers.toc'
        [IO.File]::WriteAllLines($tocFilterPath,[string[]]$tocFiltered,[Text.UTF8Encoding]::new($false))
        Write-Host ("RESTORING CORE DATA LOCALLY; skipping {0} trigger definition(s) requiring separate dependency validation." -f $omittedTriggers.Count)
        $previousErrorAction = $ErrorActionPreference
        try {
            $ErrorActionPreference = 'Continue'
            & $pgRestore -h $localHost -p $LocalPort -U $LocalUser -d $LocalDatabase --no-owner --no-privileges --clean --if-exists --exit-on-error --single-transaction -L $tocFilterPath $core
            $restoreCode = $LASTEXITCODE
        } finally { $ErrorActionPreference = $previousErrorAction }
        if ($restoreCode -ne 0) {
            throw 'Local core restore still failed. A non-trigger dependency may be missing; no remote database was used. Send the pg_restore error.'
        }
        $coreRows = & $psql @baseArgs -d $LocalDatabase -At -c "select count(*) from public.workshop_state where id='main'"
        $historyRows = & $psql @baseArgs -d $LocalDatabase -At -c "select count(*) from public.workshop_state_history"
        if ($LASTEXITCODE -ne 0 -or "$coreRows".Trim() -ne '1' -or "$historyRows".Trim() -ne '0') {
            throw 'Local core archive did not restore expected main state and empty history table.'
        }
        [pscustomobject]@{
            mode='LOCAL_DATA_RECOVERY_REHEARSAL_ONLY'
            trigger_definitions_omitted=$omittedTriggers.Count
            toc_entries_omitted=@($omittedTriggers)
            reason='The public-only core archive omits non-public schemas and functions used by public-table triggers.'
            limitation='Not a complete application restore. Preserve core dump and collect all dependent schemas separately.'
        } | ConvertTo-Json -Depth 5 | Set-Content -LiteralPath (Join-Path $work 'core-trigger-omissions.json') -Encoding UTF8
        'CORE_DATA_RESTORED_LOCALLY_WITHOUT_TRIGGERS' | Set-Content -LiteralPath $coreFlag
        Write-Host 'CORE DATA RESTORE VERIFIED: workshop_state main row present, history table empty.'
        Write-Warning 'TRIGGERS OMITTED LOCALLY. Full application recovery is NOT verified.'
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
        $compressedInput = [IO.File]::OpenRead($chunk.gz)
        $gunzip = [IO.Compression.GZipStream]::new($compressedInput,[IO.Compression.CompressionMode]::Decompress)
        $output = [IO.File]::Create($temp)
        try { $gunzip.CopyTo($output) }
        finally { $output.Dispose();$gunzip.Dispose();$compressedInput.Dispose() }
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
        status='LOCAL_DATA_RECOVERY_WITH_TRIGGERS_OMITTED'
        database=$LocalDatabase; host='127.0.0.1'; source_backup='ZUKAIT'
        history_rows=[long]$totals[0]; min_revision=[long]$totals[1]
        max_revision=[long]$totals[2]; null_json_rows=[long]$totals[3]
        finished_utc=[DateTimeOffset]::UtcNow.ToString('o')
        recovery_point_note='Core dump and history export were captured separately; not one transaction-consistent production point.'
        pending='Full application restore NOT proven: non-public schemas and trigger dependencies were absent from public-only core dump. Verify full schema, auth/storage, app/read compatibility, permissions, disk headroom before rollout.'
        trigger_omissions_report=(Join-Path $work 'core-trigger-omissions.json')
    } | ConvertTo-Json | Set-Content -LiteralPath $passedPath -Encoding UTF8
    Write-Host "LOCAL DATA RECOVERY PASSED - $expectedRecords history records restored and checked"
    Write-Warning 'Not a complete application restore: non-public schema dependencies and triggers were omitted locally.'
    Write-Host "LOCAL DATABASE: $LocalDatabase"
    Write-Host "REPORT: $passedPath"
    Write-Host 'Original backups unchanged. Production Supabase was NOT contacted.'
}
finally {
    Remove-Item Env:\PGPASSWORD -ErrorAction SilentlyContinue
    Remove-Item Env:\PGSSLMODE -ErrorAction SilentlyContinue
}
