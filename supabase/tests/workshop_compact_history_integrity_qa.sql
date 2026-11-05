-- ZUKAIT ERP: isolated QA negative tests for compact history recovery.
-- Ensures tampering and missing revisions FAIL CLOSED; no partial recovery.
-- ROLLBACK guarantees zero persisted changes. Never run on production.
BEGIN;

DO $qa$
DECLARE
  prior public.workshop_state%rowtype;
  current_rev bigint;
  i integer;
  recovered jsonb;
  correctly_rejected boolean;
BEGIN
  FOR i IN 1..2 LOOP
    SELECT * INTO prior FROM public.workshop_state WHERE id='main' FOR UPDATE;
    INSERT INTO public.workshop_state_history(revision,data,updated_at,updated_by)
    VALUES(prior.revision,prior.data,prior.updated_at,prior.updated_by)
    ON CONFLICT (revision) DO NOTHING;
    UPDATE public.workshop_state
    SET revision=prior.revision+1,
        data=jsonb_set(prior.data,'{_integrityQaMarker}',to_jsonb(i),true),
        updated_at=clock_timestamp(),updated_by='rollback_only_qa'
    WHERE id='main';
  END LOOP;
  SELECT revision INTO current_rev FROM public.workshop_state WHERE id='main';
  recovered:=zukait_history.reconstruct_state(current_rev);
  IF recovered IS DISTINCT FROM
    (SELECT data FROM public.workshop_state WHERE id='main') THEN
    RAISE EXCEPTION 'qa_baseline_reconstruction_wrong';
  END IF;

  -- Tamper with latest delta and verify digest blocks reconstruction.
  UPDATE zukait_history.revisions SET payload='{}'::jsonb
  WHERE revision=current_rev;
  correctly_rejected:=false;
  BEGIN
    PERFORM zukait_history.reconstruct_state(current_rev);
  EXCEPTION WHEN raise_exception THEN
    correctly_rejected:=true;
  END;
  IF NOT correctly_rejected THEN
    RAISE EXCEPTION 'tampered_history_was_accepted';
  END IF;

  -- Restore the valid delta, remove one revision and verify gap detection.
  UPDATE zukait_history.revisions
  SET payload=jsonb_build_object('_integrityQaMarker',2)
  WHERE revision=current_rev;
  DELETE FROM zukait_history.revisions WHERE revision=current_rev-1;
  correctly_rejected:=false;
  BEGIN
    PERFORM zukait_history.reconstruct_state(current_rev);
  EXCEPTION WHEN raise_exception THEN
    correctly_rejected:=true;
  END;
  IF NOT correctly_rejected THEN
    RAISE EXCEPTION 'history_gap_was_accepted';
  END IF;
END $qa$;

ROLLBACK;
