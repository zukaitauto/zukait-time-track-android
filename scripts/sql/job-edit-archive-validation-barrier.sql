-- Validation-only final barrier: never silently change the stored snapshot
-- after a caller has calculated its recovery delta.
CREATE OR REPLACE FUNCTION private.assert_workshop_job_edit_archive()
RETURNS trigger LANGUAGE plpgsql SECURITY INVOKER SET search_path='' AS $$
DECLARE
 marker jsonb := OLD.data->'jobEditArchive';
 candidate_marker jsonb := NEW.data->'jobEditArchive';
 normalized jsonb;
BEGIN
 IF OLD.id <> 'main' THEN RETURN NEW; END IF;
 IF marker IS NULL THEN
  -- Activation is a separately reviewed operation; until then forbid markers.
  IF candidate_marker IS NOT NULL THEN RAISE EXCEPTION 'job_edit_archive_activation_required'; END IF;
  RETURN NEW;
 END IF;
 IF candidate_marker IS DISTINCT FROM marker THEN RAISE EXCEPTION 'job_edit_archive_marker_changed'; END IF;
 IF NEW.data->'jobEdits' IS NOT DISTINCT FROM OLD.data->'jobEdits' THEN RETURN NEW; END IF;
 normalized:=private.normalize_job_edit_archive_candidate(OLD.data,NEW.data);
 IF normalized IS DISTINCT FROM NEW.data THEN RAISE EXCEPTION 'job_edit_archive_not_normalized'; END IF;
 RETURN NEW;
END;
$$;
REVOKE ALL ON FUNCTION private.assert_workshop_job_edit_archive() FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION private.assert_workshop_job_edit_archive() TO service_role;
CREATE TRIGGER zukait_job_edit_archive_assertion
AFTER UPDATE OF data ON public.workshop_state
FOR EACH ROW EXECUTE FUNCTION private.assert_workshop_job_edit_archive();