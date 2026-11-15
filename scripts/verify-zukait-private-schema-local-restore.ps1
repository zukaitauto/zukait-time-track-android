#Requires -Version 5.1
<#
ZUKAIT Local-Only Private Schema Recovery Test.
No connections to Supabase. Clones the successful local recovery, then restores
the Mechanical and Vehicle archive and previously omitted public triggers.
Never changes or drops original recovery database, archives or production.
Any failed clone is retained for investigation; no automatic cleanup.
#>
[CmdletBinding()]
param(
    [switch]$ResumeExistingClone
)
Set-StrictMode -Version Latest
$ErrorActionPreference='Stop'
$root='Z:\Zukait-20261025'
$pg='C:\Program Files\PostgreSQL\17\bin'
$psql=Join-Path $pg 'psql.exe'
$createdb=Join-Path $pg 'createdb.exe'
$pgRestore=Join-Path $pg 'pg_restore.exe'
$hostIp='127.0.0.1'
$port='55433'
$sourceDb='zukait_restore_rehearsal_20261114'
$targetDb='zukait_restore_privatecheck_20261115'
$privateDir=Join-Path $root 'ZUKAIT-PRIVATE-SCHEMAS-20261115-080422-fe641b8e'
$privateArchive=Join-Path $privateDir 'zukait-private-mechanical-vehicle.dump'
$privateManifest=Join-Path $privateDir 'schema-export-manifest.json'
$core=Join-Path $root 'ZUKAIT-CORE-20261114-110718\workshop-core.dump'
$work=Join-Path $root 'ZUKAIT-LOCAL-RESTORE-REHEARSAL'
$restoreReport=Join-Path $work 'RESTORE-PASSED.json'
$triggerReport=Join-Path $work 'core-trigger-omissions.json'
$historyManifest=Join-Path $root 'ZUKAIT-HISTORY-CHUNKED\history-export-manifest.json'
$triggerToc=Join-Path $work 'privatecheck-public-triggers.toc'
$outReport=Join-Path $work 'PRIVATE-SCHEMA-RESTORE-TEST.json'

foreach($f in @($psql,$createdb,$pgRestore,$privateArchive,$privateManifest,$core,$restoreReport,$triggerReport,$historyManifest)){
    if(!(Test-Path -LiteralPath $f -PathType Leaf)){throw "Missing required file: $f"}
}
$pm=Get-Content -LiteralPath $privateManifest -Raw | ConvertFrom-Json
$rr=Get-Content -LiteralPath $restoreReport -Raw | ConvertFrom-Json
$tr=Get-Content -LiteralPath $triggerReport -Raw | ConvertFrom-Json
$hm=Get-Content -LiteralPath $historyManifest -Raw | ConvertFrom-Json
if($pm.project_ref -ne 'pjknotnjkufadqavcmii' -or
   $pm.status -ne 'CUSTOM_ARCHIVE_TOC_AND_HASH_VERIFIED__RESTORE_NOT_TESTED' -or
   $pm.archive -ne 'zukait-private-mechanical-vehicle.dump' -or
   @($pm.schema_scope).Count -ne 2 -or
   @($pm.schema_scope) -notcontains 'zukait_mechanical' -or
   @($pm.schema_scope) -notcontains 'zukait_vehicle' -or
   $rr.status -ne 'LOCAL_DATA_RECOVERY_WITH_TRIGGERS_OMITTED' -or
   $rr.database -ne $sourceDb -or
   [long]$rr.history_rows -ne 16410 -or
   $hm.status -ne 'ALL_CHUNKS_COMPRESSED_AND_READ_BACK_VERIFIED' -or
   [long]$hm.expected_rows -ne 16410 -or
   [int]$tr.trigger_definitions_omitted -ne 31){
    throw 'Backup control manifests mismatch. No clone or restore attempted.'
}
$len=(Get-Item -LiteralPath $privateArchive).Length
$hash=(Get-FileHash -LiteralPath $privateArchive -Algorithm SHA256).Hash
if([long]$pm.archive_bytes -ne $len -or $hash -ine $pm.sha256){
    throw 'Private archive checksum failed. No clone attempted.'
}
$privateToc=@(& $pgRestore --list $privateArchive)
if($LASTEXITCODE -ne 0 -or $privateToc.Count -eq 0){
    throw 'Cannot read private backup archive contents.'
}
$mt=@($privateToc | Where-Object {"$_" -match '^\s*\d+;\s+\d+\s+\d+\s+TABLE\s+zukait_mechanical\s+'}).Count
$vt=@($privateToc | Where-Object {"$_" -match '^\s*\d+;\s+\d+\s+\d+\s+TABLE\s+zukait_vehicle\s+'}).Count
$md=@($privateToc | Where-Object {"$_" -match '^\s*\d+;\s+\d+\s+\d+\s+TABLE DATA\s+zukait_mechanical\s+'}).Count
$vd=@($privateToc | Where-Object {"$_" -match '^\s*\d+;\s+\d+\s+\d+\s+TABLE DATA\s+zukait_vehicle\s+'}).Count
if($mt -ne 18 -or $md -ne 18 -or $vt -ne 3 -or $vd -ne 3){
    throw 'Private backup must contain precisely 18 Mechanical and 3 Vehicle table definitions and data sections.'
}
# The private audit export (15 Nov) contains request IDs that were created
# after the public-only core export (14 Nov). Preserve ALL audit rows.
# In this *isolated local test only*, postpone validation of exactly the
# expected cross-snapshot FK; pg_restore still restores every other constraint.
$deferredFkEntries=@($privateToc | Where-Object {
    "$_" -match '^\s*\d+;\s+\d+\s+\d+\s+FK CONSTRAINT\s+zukait_vehicle\s+direct_job_customer_role_audit\s+direct_job_customer_role_audit_request_id_fkey(?:\s|$)'
})
if($deferredFkEntries.Count -ne 1){
    throw 'Expected exactly one cross-snapshot Vehicle audit request FK. No restore attempted.'
}
$filteredPrivateToc=@($privateToc | ForEach-Object {
    if("$_" -match '^\s*\d+;\s+\d+\s+\d+\s+FK CONSTRAINT\s+zukait_vehicle\s+direct_job_customer_role_audit\s+direct_job_customer_role_audit_request_id_fkey(?:\s|$)'){
        ';'+"$_"
    } else {
        "$_"
    }
})
$privateTocForRehearsal=Join-Path $work 'privatecheck-deferred-one-fk.toc'
[IO.File]::WriteAllLines($privateTocForRehearsal,[string[]]$filteredPrivateToc,[Text.UTF8Encoding]::new($false))
$coreToc=@(& $pgRestore --list $core)
if($LASTEXITCODE -ne 0){throw 'Cannot read original core backup contents.'}
$triggerEntries=@($coreToc | Where-Object {"$_" -match '^\s*\d+;\s+\d+\s+\d+\s+TRIGGER\s+public\s+'})
if($triggerEntries.Count -ne 31){throw 'Original core backup does not list expected 31 public triggers.'}
$filtered=@($coreToc | ForEach-Object {
    if("$_" -match '^\s*\d+;\s+\d+\s+\d+\s+TRIGGER\s+public\s+' -or "$_".StartsWith(';')){"$_"}
    else{';'+"$_"}
})
[IO.File]::WriteAllLines($triggerToc,[string[]]$filtered,[Text.UTF8Encoding]::new($false))
Write-Host 'LOCAL BACKUP CHECKS PASSED: 21 private tables and 31 archived triggers.'
Write-Host 'This test will connect ONLY to 127.0.0.1:55433.'
$env:PGSSLMODE='disable'
$env:PGCONNECT_TIMEOUT='8'
$secret=Read-Host 'Enter LOCAL PostgreSQL password (not production password)' -AsSecureString
$ptr=[Runtime.InteropServices.Marshal]::SecureStringToBSTR($secret)
try{$env:PGPASSWORD=[Runtime.InteropServices.Marshal]::PtrToStringBSTR($ptr)}
finally{[Runtime.InteropServices.Marshal]::ZeroFreeBSTR($ptr)}
try{
    if([string]::IsNullOrWhiteSpace($env:PGPASSWORD)){throw 'Empty local password.'}
    $base=@('-X','-w','-v','ON_ERROR_STOP=1','-h',$hostIp,'-p',$port,'-U','postgres')
    $identity=@(& $psql @base -d postgres -At -F '|' -c "select 'ZUKAIT_LOCAL_CHECK',host(inet_server_addr()),inet_server_port()::text,current_setting('server_version_num'),current_setting('data_directory')")
    if($LASTEXITCODE -ne 0){throw 'Local PostgreSQL not running at 127.0.0.1:55433. Start the existing local instance; do NOT run initdb again.'}
    $matches=@($identity | Where-Object {"$_" -like 'ZUKAIT_LOCAL_CHECK|*'})
    if($matches.Count -ne 1){throw 'Could not verify local PostgreSQL instance.'}
    $parts="$($matches[0])" -split '\|',5
    if($parts.Count -ne 5){throw 'Local server identity response invalid.'}
    $actualDir=[IO.Path]::GetFullPath($parts[4].Trim()).TrimEnd('\','/')
    $expectedDir=[IO.Path]::GetFullPath((Join-Path $env:LOCALAPPDATA 'ZUKAIT\pg17-restore-20261114')).TrimEnd('\','/')
    if($parts[1].Trim() -ne $hostIp -or $parts[2].Trim() -ne $port -or
       $parts[3].Trim() -notmatch '^17[0-9]{4}$' -or $actualDir -ine $expectedDir){
        throw 'Refusing unsafe local database identity (host, port, version or data folder differs).'
    }
    $dataRoot=[IO.Path]::GetPathRoot($actualDir)
    if($dataRoot -notmatch '^[A-Za-z]:\\$'){throw 'Local data drive not recognized.'}
    $free=(Get-PSDrive -Name $dataRoot.Substring(0,1)).Free
    $sizeInfo=@(& $psql @base -d postgres -At -F '|' -c "select pg_database_size('$sourceDb'),(select count(*) from pg_stat_activity where datname='$sourceDb')")
    if($LASTEXITCODE -ne 0 -or $sizeInfo.Count -ne 1){throw 'Cannot verify local source recovery database.'}
    $info="$($sizeInfo[0])" -split '\|'
    if($info.Count -ne 2){throw 'Invalid local source database size result.'}
    $size=[long]$info[0]
    $sessions=[long]$info[1]
    if($size -lt 100MB){throw 'Local source database size unexpectedly small.'}
    if($sessions -ne 0){throw 'Close clients connected to the original local recovery database before cloning.'}
    $needed=[long]([Math]::Ceiling($size*1.4)+2GB)
    $existing=@(& $psql @base -d postgres -At -c "select count(*) from pg_database where datname='$targetDb'")
    if($LASTEXITCODE -ne 0 -or $existing.Count -ne 1){
        throw "Cannot confirm the expected local test database state. Refusing to proceed."
    }
    $targetCount=[int]"$($existing[0])".Trim()
    if($targetCount -ne 0 -and $targetCount -ne 1){
        throw 'Unexpected duplicate database count. Refusing to proceed.'
    }
    if($targetCount -eq 0){
        if($ResumeExistingClone){
            throw 'Resume requested, but the test clone does not exist. Refusing to create it implicitly.'
        }
        if($null -eq $free -or $free -lt $needed){
            throw ('Not enough local free space for cloned recovery (available {0:N1} GB, need {1:N1} GB).' -f ($free/1GB),($needed/1GB))
        }
        Write-Host ('DISK SPACE VERIFIED: local source {0:N2} GB; free {1:N2} GB.' -f ($size/1GB),($free/1GB))
        Write-Host "CREATING NEW LOCAL COPY: $targetDb (original stays unchanged)"
        $old=$ErrorActionPreference
        try{$ErrorActionPreference='Continue'; & $createdb -w -h $hostIp -p $port -U postgres -T $sourceDb $targetDb; $createExit=$LASTEXITCODE}
        finally{$ErrorActionPreference=$old}
        if($createExit -ne 0){throw 'Local database cloning failed; original recovery and backups remain safe.'}
        Write-Host 'NEW LOCAL COPY CREATED.'
    } else {
        if(!$ResumeExistingClone){
            throw "Target local database $targetDb exists. To inspect and resume only an untouched clone, specify -ResumeExistingClone."
        }
        # This branch is intentionally STRICT: resume only an exact expected
        # pre-private-restore database. Anything partially restored or modified
        # stays untouched and requires separate manual diagnosis.
        if($null -eq $free -or $free -lt 500MB){
            throw 'Less than 500 MB free on local PostgreSQL volume. Refusing to restore.'
        }
        $sourceCheck=@(& $psql @base -d $sourceDb -At -F '|' -c "select (select count(*) from public.workshop_state_history),(select min(revision) from public.workshop_state_history),(select max(revision) from public.workshop_state_history),(select count(*) from public.workshop_state where id='main'),(select count(*) from pg_namespace where nspname in ('zukait_mechanical','zukait_vehicle')),(select count(*) from pg_trigger t join pg_class c on c.oid=t.tgrelid join pg_namespace n on n.oid=c.relnamespace where n.nspname='public' and not t.tgisinternal)")
        if($LASTEXITCODE -ne 0 -or $sourceCheck.Count -ne 1){
            throw 'Could not verify the original local recovery database. Refusing to resume.'
        }
        $targetCheck=@(& $psql @base -d $targetDb -At -F '|' -c "select (select count(*) from public.workshop_state_history),(select min(revision) from public.workshop_state_history),(select max(revision) from public.workshop_state_history),(select count(*) from public.workshop_state where id='main'),(select count(*) from pg_namespace where nspname in ('zukait_mechanical','zukait_vehicle')),(select count(*) from pg_trigger t join pg_class c on c.oid=t.tgrelid join pg_namespace n on n.oid=c.relnamespace where n.nspname='public' and not t.tgisinternal)")
        if($LASTEXITCODE -ne 0 -or $targetCheck.Count -ne 1){
            throw 'Could not verify existing local test clone. Refusing to resume.'
        }
        $srcParts="$($sourceCheck[0])" -split '\|'
        $dstParts="$($targetCheck[0])" -split '\|'
        if($srcParts.Count -ne 6 -or $dstParts.Count -ne 6 -or
           "$($sourceCheck[0])" -cne "$($targetCheck[0])" -or
           [long]$dstParts[0] -ne 16410 -or [long]$dstParts[3] -ne 1 -or
           [long]$dstParts[4] -ne 0 -or [long]$dstParts[5] -ne 0){
            throw ("Existing test clone differs from the verified unmodified recovery state. Actual control totals: {0}. Nothing restored." -f $targetCheck[0])
        }
        Write-Host 'EXISTING LOCAL CLONE VERIFIED: 16410 history records, 1 workshop main row, 0 private schemas, 0 public triggers.'
        Write-Host 'RESUMING PRIVATE-SCHEMA RESTORE IN THIS CLONE ONLY. No new clone or cleanup.'
    }
    Write-Host 'RESTORING 18 Mechanical and 3 Vehicle tables into LOCAL COPY...'
    Write-Warning 'One known cross-snapshot Vehicle audit FK will be recreated NOT VALID locally. No audit rows are discarded.'
    $old=$ErrorActionPreference
    try{$ErrorActionPreference='Continue'; & $pgRestore -w -h $hostIp -p $port -U postgres -d $targetDb --no-owner --no-privileges --single-transaction --exit-on-error -L $privateTocForRehearsal $privateArchive; $privateExit=$LASTEXITCODE}
    finally{$ErrorActionPreference=$old}
    if($privateExit -ne 0){throw 'Local private schema restore failed (another dependency may differ). Send the first pg_restore error; backups/original recovery unchanged.'}
    $schemaInfo=@(& $psql @base -d $targetDb -At -F '|' -c "select (select count(*) from pg_class c join pg_namespace n on n.oid=c.relnamespace where n.nspname='zukait_mechanical' and c.relkind in ('r','p')),(select count(*) from pg_class c join pg_namespace n on n.oid=c.relnamespace where n.nspname='zukait_vehicle' and c.relkind in ('r','p')),(select count(*) from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname='zukait_mechanical')")
    if($LASTEXITCODE -ne 0 -or $schemaInfo.Count -ne 1){throw 'Cannot verify local private schema object totals.'}
    $si="$($schemaInfo[0])" -split '\|'
    if($si.Count -ne 3 -or [int]$si[0] -ne 18 -or [int]$si[1] -ne 3 -or [int]$si[2] -lt 1){
        throw "Private schema object counts mismatch: $($schemaInfo[0])"
    }
    Write-Host ("PRIVATE SCHEMAS RESTORED: Mechanical={0}, Vehicle={1}, Mechanical functions={2}." -f $si[0],$si[1],$si[2])
    # A NOT VALID FK enforces referential integrity for future changes but
    # does not retroactively reject historic rows from different backup times.
    # This is deliberately confined to the local clone. The production FK
    # and all source archives remain intact and unchanged.
    $addDeferredFk = @'
BEGIN;
SET LOCAL statement_timeout = '30000';
ALTER TABLE ONLY zukait_vehicle.direct_job_customer_role_audit
  ADD CONSTRAINT direct_job_customer_role_audit_request_id_fkey
  FOREIGN KEY (request_id)
  REFERENCES public.workshop_reception_commands(request_id) NOT VALID;
COMMIT;
'@
    & $psql @base -d $targetDb -c $addDeferredFk
    if($LASTEXITCODE -ne 0){
        throw 'Could not recreate the deferred Vehicle audit FK in LOCAL CLONE. Do not modify original restore or backup.'
    }
    $auditSummary=@(& $psql @base -d $targetDb -At -F '|' -c "select (select count(*) from zukait_vehicle.direct_job_customer_role_audit),(select count(*) from zukait_vehicle.direct_job_customer_role_audit a left join public.workshop_reception_commands c on c.request_id=a.request_id where c.request_id is null),(select count(*) from pg_constraint k join pg_class r on r.oid=k.conrelid join pg_namespace n on n.oid=r.relnamespace where n.nspname='zukait_vehicle' and r.relname='direct_job_customer_role_audit' and k.conname='direct_job_customer_role_audit_request_id_fkey' and k.contype='f' and not k.convalidated)")
    if($LASTEXITCODE -ne 0 -or $auditSummary.Count -ne 1){
        throw 'Could not verify local audit row preservation and deferred FK.'
    }
    $auditParts="$($auditSummary[0])" -split '\|'
    if($auditParts.Count -ne 3 -or [long]$auditParts[2] -ne 1 -or
       [long]$auditParts[1] -gt [long]$auditParts[0] -or [long]$auditParts[1] -lt 0){
        throw "Local audit count or NOT VALID FK check failed: $($auditSummary[0])"
    }
    $auditTotal=[long]$auditParts[0]
    $missingRequests=[long]$auditParts[1]
    Write-Host ("LOCAL AUDIT PRESERVED: {0} audit records; {1} request reference(s) absent from older core backup." -f $auditTotal,$missingRequests)
    Write-Warning 'This local FK is NOT VALIDATED against existing records; the backups are not one consistent point in time.'
    Write-Host 'RESTORING 31 PUBLIC TRIGGERS INTO LOCAL COPY...'
    $old=$ErrorActionPreference
    try{$ErrorActionPreference='Continue'; & $pgRestore -w -h $hostIp -p $port -U postgres -d $targetDb --no-owner --no-privileges --single-transaction --exit-on-error -L $triggerToc $core; $triggerExit=$LASTEXITCODE}
    finally{$ErrorActionPreference=$old}
    if($triggerExit -ne 0){throw 'Local public trigger restore failed. Source backups remain safe; report the first pg_restore error.'}
    $totals=@(& $psql @base -d $targetDb -At -F '|' -c "select (select count(*) from public.workshop_state_history),(select count(*) from pg_trigger t join pg_class c on c.oid=t.tgrelid join pg_namespace n on n.oid=c.relnamespace where n.nspname='public' and not t.tgisinternal),(select count(*) from public.workshop_state where id='main')")
    if($LASTEXITCODE -ne 0 -or $totals.Count -ne 1){throw 'Unable to verify final local counts.'}
    $nums="$($totals[0])" -split '\|'
    if($nums.Count -ne 3 -or [long]$nums[0] -ne 16410 -or [long]$nums[1] -ne 31 -or [long]$nums[2] -ne 1){
        throw "Final local control totals incorrect: $($totals[0])"
    }
    [pscustomobject]@{
        status='LOCAL_APP_SCHEMAS_TRIGGERS_WITH_DEFERRED_VEHICLE_FK__NOT_FULL_RECOVERY'
        clone=$targetDb
        original=$sourceDb
        local_port=55433
        history_rows=[long]$nums[0]
        public_triggers=[long]$nums[1]
        mechanical_tables=[int]$si[0]
        vehicle_tables=[int]$si[1]
        mechanical_functions=[int]$si[2]
        private_sha256=$hash.ToLowerInvariant()
        vehicle_audit_rows_preserved=$auditTotal
        vehicle_audit_missing_core_request_references=$missingRequests
        vehicle_audit_fk_recreated_not_validated=$true
        verified_at_utc=[DateTimeOffset]::UtcNow.ToString('o')
        limitations=@(
            'One Vehicle audit FK is NOT VALID in local clone due to different backup capture times; new writes are still checked',
            'Core, history and private tables were captured at different times',
            'Supabase auth/storage object bytes, Edge functions, secrets, permissions, extensions and app behavior need separate checks',
            'No production history deletion, rewrite or compact mode authorized'
        )
    } | ConvertTo-Json -Depth 6 | Set-Content -LiteralPath $outReport -Encoding UTF8
    Write-Host 'LOCAL PRIVATE SCHEMA + TRIGGER RECOVERY TEST PASSED WITH CROSS-SNAPSHOT FK EXCEPTION.'
    Write-Host '21 private tables, 31 public triggers and 16410 history records verified locally.'
    Write-Warning ("The Vehicle audit FK is NOT VALID in the local clone; {0} historic request reference(s) are missing from the older core backup." -f $missingRequests)
    Write-Host "NEW LOCAL TEST DATABASE: $targetDb"
    Write-Host "REPORT: $outReport"
    Write-Warning 'Full Supabase/platform recovery is NOT established; production optimization remains on hold.'
}
finally{
    Remove-Item Env:\PGPASSWORD -ErrorAction SilentlyContinue
    Remove-Item Env:\PGSSLMODE -ErrorAction SilentlyContinue
    Remove-Item Env:\PGCONNECT_TIMEOUT -ErrorAction SilentlyContinue
}
