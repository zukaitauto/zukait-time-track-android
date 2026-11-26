-- Run with psql -X -v ON_ERROR_STOP=1 on an isolated restored database only.
-- Requires all raw history CSV chunks and core archive restored first.
-- This script does not change data or permissions. Counts are the minimum
-- established production baseline on 2026-11-26, not a replacement for
-- comparing the backup manifest inventories.
\set ON_ERROR_STOP on
BEGIN READ ONLY;
DO $guard$
BEGIN
 IF current_database() !~ '^zukait_restore_[a-z0-9_]+$'
    OR inet_server_addr() IS NULL
    OR inet_server_addr() NOT IN ('127.0.0.1'::inet,'::1'::inet) THEN
   RAISE EXCEPTION 'Use an isolated loopback database named zukait_restore_...';
 END IF;
END
$guard$;
DO $verify$
DECLARE r record; restored jsonb; raw jsonb; n bigint:=0; m bigint:=0;
BEGIN
 IF (SELECT count(*) FROM private.workshop_archive_conversion_pilot WHERE revision<=17683)<>2970 THEN
   RAISE EXCEPTION 'Compact legacy history count mismatch';
 END IF;
 IF (SELECT count(*) FROM private.workshop_consumables_shadow_history WHERE revision>17683 AND revision<=18062)<>160 THEN
   RAISE EXCEPTION 'Consumables archive count mismatch';
 END IF;
 FOR r IN SELECT revision FROM private.workshop_archive_conversion_pilot WHERE revision<=17683 ORDER BY revision LOOP
   restored:=private.read_workshop_archive_pilot(r.revision);
   IF restored IS NULL OR jsonb_typeof(restored)<>'object' THEN
     RAISE EXCEPTION 'Legacy recovery failed for revision %',r.revision;
   END IF;
   IF public.zukait_read_workshop_merge_base(r.revision) IS DISTINCT FROM restored THEN
     RAISE EXCEPTION 'Legacy API mismatch at revision %',r.revision;
   END IF;
   n:=n+1;
 END LOOP;
 FOR r IN SELECT * FROM private.workshop_consumables_shadow_history WHERE revision>17683 AND revision<=18062 ORDER BY revision LOOP
   restored:=private.read_workshop_consumables_shadow(r.revision);
   SELECT h.data INTO raw FROM public.workshop_state_history h WHERE h.revision=r.revision
      AND h.updated_at IS NOT DISTINCT FROM r.updated_at
      AND h.updated_by IS NOT DISTINCT FROM r.updated_by
      AND h.archived_at IS NOT DISTINCT FROM r.source_archived_at;
   IF NOT FOUND OR restored->'data' IS DISTINCT FROM raw OR
      private.consumables_content_hash(raw) IS DISTINCT FROM r.source_digest OR
      public.zukait_read_workshop_merge_base(r.revision) IS DISTINCT FROM raw THEN
     RAISE EXCEPTION 'Consumables snapshot or metadata mismatch at revision %',r.revision;
   END IF;
   m:=m+1;
 END LOOP;
 RAISE NOTICE 'All % legacy revisions recover; all % consumables snapshots match original data and metadata',n,m;
END
$verify$;
ROLLBACK;
-- Separately verify backup manifest inventory, role grants/RLS, and fallback
-- with raw originals absent in a rolled-back LOCAL transaction. Do not
-- certify the restore solely from this script or deploy a no-ACL restore.
