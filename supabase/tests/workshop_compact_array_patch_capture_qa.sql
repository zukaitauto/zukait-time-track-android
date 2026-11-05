-- ZUKAIT QA: array-level capture integrated with real workshop_state trigger.
-- Do not run against production. ALL state/history changes are rolled back.
-- Requires compact foundation, array patch primitives and capture migration.
BEGIN;
DO $test$
DECLARE
  before_state public.workshop_state%rowtype;
  after_state public.workshop_state%rowtype;
  restored jsonb;
  i integer;
  v_patch jsonb;
  v_data jsonb;
  v_array jsonb;
  v_kind text;
BEGIN
  IF (SELECT mode FROM zukait_history.configuration WHERE singleton) <> 'dual'
  THEN RAISE EXCEPTION 'qa_dual_mode_required'; END IF;
  FOR i IN 1..2 LOOP
    SELECT * INTO before_state FROM public.workshop_state WHERE id='main' FOR UPDATE;
    IF jsonb_array_length(before_state.data->'jobs')=0 THEN
      RAISE EXCEPTION 'qa_fixture_no_jobs'; END IF;
    v_array:=jsonb_set(before_state.data->'jobs',
      array['0','_compactHistoryQaMarker'],to_jsonb(i),true);
    INSERT INTO public.workshop_state_history(revision,data,updated_at,updated_by)
    VALUES(before_state.revision,before_state.data,before_state.updated_at,
           before_state.updated_by)
    ON CONFLICT(revision) DO NOTHING;
    UPDATE public.workshop_state
    SET revision=before_state.revision+1,
        data=jsonb_set(before_state.data,'{jobs}',v_array),
        updated_at=clock_timestamp(),updated_by='qa_rollback_only'
    WHERE id='main';

    SELECT * INTO after_state FROM public.workshop_state WHERE id='main';
    IF after_state.revision <> before_state.revision+1 THEN
      RAISE EXCEPTION 'qa_revision_not_incremented'; END IF;
    SELECT payload,array_patches,kind INTO v_data,v_patch,v_kind
    FROM zukait_history.revisions WHERE revision=after_state.revision;
    IF v_kind <> 'delta' THEN RAISE EXCEPTION 'qa_expected_delta'; END IF;
    IF v_data ? 'jobs' OR NOT (v_patch ? 'jobs') THEN
      RAISE EXCEPTION 'qa_array_patch_was_not_selected'; END IF;
    restored:=zukait_history.reconstruct_state(after_state.revision);
    IF restored IS DISTINCT FROM after_state.data THEN
      RAISE EXCEPTION 'qa_patch_reconstruction_mismatch'; END IF;
  END LOOP;
  -- Old and new live state recovery should work through the existing reader.
  SELECT data INTO restored FROM zukait_history.read_revision(before_state.revision);
  IF restored IS DISTINCT FROM before_state.data THEN
    RAISE EXCEPTION 'qa_legacy_compatibility_mismatch'; END IF;
END $test$;
ROLLBACK;
