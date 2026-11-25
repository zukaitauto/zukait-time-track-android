-- Copy only explicitly chosen historical revisions, preserving every source field.
-- Never delete or update the source. Pilot scope must not overlap the running
-- legacy conversion (revision <= 17683) in production.
ALTER TABLE private.workshop_consumables_shadow_history ADD COLUMN IF NOT EXISTS source_archived_at timestamptz;
CREATE OR REPLACE FUNCTION private.stage_consumables_history_batch(p_revisions bigint[])
RETURNS jsonb LANGUAGE plpgsql VOLATILE SECURITY INVOKER SET search_path='' AS $$
DECLARE r bigint; h public.workshop_state_history%ROWTYPE; stored private.workshop_consumables_shadow_history%ROWTYPE; n integer:=0; original_bytes bigint:=0; packed_bytes bigint:=0;
BEGIN
 IF p_revisions IS NULL OR cardinality(p_revisions) NOT BETWEEN 1 AND 4 OR array_position(p_revisions,NULL) IS NOT NULL OR cardinality(p_revisions)<>(SELECT count(DISTINCT x) FROM unnest(p_revisions) x) THEN RAISE EXCEPTION 'invalid_history_batch'; END IF;
 IF NOT pg_try_advisory_xact_lock(7290145563301::bigint) THEN RAISE EXCEPTION 'consumables_stage_busy'; END IF;
 FOREACH r IN ARRAY p_revisions LOOP
   SELECT * INTO h FROM public.workshop_state_history WHERE revision=r FOR SHARE;
   IF NOT FOUND THEN RAISE EXCEPTION 'source_revision_missing_%',r; END IF;
   PERFORM private.store_workshop_consumables_shadow(h.revision,h.data,h.updated_at,h.updated_by);
   SELECT * INTO stored FROM private.workshop_consumables_shadow_history WHERE revision=r;
   IF stored.source_archived_at IS NULL THEN
     -- Metadata attachment is restricted to the database owner. No public RPC.
     UPDATE private.workshop_consumables_shadow_history SET source_archived_at=h.archived_at WHERE revision=r AND source_archived_at IS NULL;
   END IF;
   SELECT * INTO stored FROM private.workshop_consumables_shadow_history WHERE revision=r;
   IF stored.source_archived_at IS DISTINCT FROM h.archived_at OR stored.updated_at IS DISTINCT FROM h.updated_at OR stored.updated_by IS DISTINCT FROM h.updated_by OR private.read_workshop_consumables_shadow(r)->'data' IS DISTINCT FROM h.data THEN RAISE EXCEPTION 'staged_revision_mismatch_%',r; END IF;
   n:=n+1; original_bytes:=original_bytes+octet_length(h.data::text); packed_bytes:=packed_bytes+octet_length(stored.packed_state::text);
 END LOOP;
 RETURN jsonb_build_object('verified_revisions',n,'original_logical_bytes',original_bytes,'packed_logical_bytes',packed_bytes,'source_records_removed',0);
END $$;
REVOKE ALL ON FUNCTION private.stage_consumables_history_batch(bigint[]) FROM PUBLIC,anon,authenticated,service_role;
-- Only the maintenance database owner can stage original archive timestamps.
CREATE OR REPLACE FUNCTION private.stage_consumables_history_after_hours(p_revisions bigint[])
RETURNS jsonb LANGUAGE plpgsql VOLATILE SECURITY INVOKER SET search_path='' AS $$
DECLARE oman_hour integer:=extract(hour from clock_timestamp() AT TIME ZONE 'Asia/Muscat');
BEGIN
 IF oman_hour>=7 AND oman_hour<19 THEN RAISE EXCEPTION 'outside_maintenance_window'; END IF;
 IF EXISTS(SELECT 1 FROM unnest(p_revisions) r WHERE r<=17683) THEN RAISE EXCEPTION 'legacy_conversion_scope_overlap'; END IF;
 RETURN private.stage_consumables_history_batch(p_revisions);
END $$;
REVOKE ALL ON FUNCTION private.stage_consumables_history_after_hours(bigint[]) FROM PUBLIC,anon,authenticated,service_role;