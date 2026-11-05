-- ZUKAIT ERP compact history growth & recovery regression.
-- QA-only. Requires history foundation + reader migrations.
-- Every change is rolled back and never persists to staff or production.
-- Run only against isolated project omqgkqknbdcnotabffek.
BEGIN;
UPDATE zukait_history.configuration
SET mode='dual',checkpoint_interval=100,cutover_approved=false
WHERE singleton=true;

DO $qa$
DECLARE
  before_state public.workshop_state%rowtype;
  after_state public.workshop_state%rowtype;
  current_revision bigint;
  legacy_bytes bigint:=0;
  compact_bytes bigint:=0;
  recovered jsonb;
  i integer;
BEGIN
  SELECT * INTO before_state FROM public.workshop_state WHERE id='main' FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'missing_workshop_state'; END IF;

  FOR i IN 1..20 LOOP
    SELECT * INTO before_state FROM public.workshop_state WHERE id='main' FOR UPDATE;
    INSERT INTO public.workshop_state_history(revision,data,updated_at,updated_by)
    VALUES(before_state.revision,before_state.data,before_state.updated_at,before_state.updated_by)
    ON CONFLICT (revision) DO NOTHING;

    UPDATE public.workshop_state SET
      data=jsonb_set(before_state.data,'{_compactHistoryGrowthQa}',to_jsonb(i),true),
      revision=before_state.revision+1,
      updated_at=clock_timestamp(),
      updated_by='compact_history_growth_qa'
    WHERE id='main';

    SELECT * INTO after_state FROM public.workshop_state WHERE id='main';
    IF after_state.revision<>before_state.revision+1 THEN
      RAISE EXCEPTION 'non_sequential_revision_at_iteration_%',i;
    END IF;
    recovered:=zukait_history.reconstruct_state(after_state.revision);
    IF recovered IS DISTINCT FROM after_state.data THEN
      RAISE EXCEPTION 'lossy_reconstruction_at_iteration_%',i;
    END IF;
    SELECT data INTO recovered
    FROM zukait_history.read_revision(before_state.revision);
    IF recovered IS DISTINCT FROM before_state.data THEN
      RAISE EXCEPTION 'legacy_compatibility_failed_at_iteration_%',i;
    END IF;
    legacy_bytes:=legacy_bytes+pg_column_size(before_state.data);
  END LOOP;

  SELECT COALESCE(sum(pg_column_size(payload)+pg_column_size(removed_keys)),0)::bigint
  INTO compact_bytes
  FROM zukait_history.revisions
  WHERE revision>=after_state.revision-20 AND revision<=after_state.revision;

  IF compact_bytes<=0 OR legacy_bytes<=0 THEN
    RAISE EXCEPTION 'no_history_bytes_measured';
  END IF;
  -- Include first full baseline checkpoint in compact numerator.
  -- Real QA state (~17 KB) must achieve >= 50%% reduction on 20 tiny updates.
  IF compact_bytes*2 >= legacy_bytes THEN
    RAISE EXCEPTION 'compact_history_not_smaller: % vs %',
      compact_bytes,legacy_bytes;
  END IF;
END $qa$;
ROLLBACK;
