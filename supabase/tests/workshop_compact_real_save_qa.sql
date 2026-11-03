-- REAL SAVE-PATH QA: test against isolated staging ONLY.
-- Requires both history migrations. Runs the existing production-style
-- zukait_commit_workshop_state_v2() function with compact mode inside rollback.
-- Do not run this script on the production project: it intentionally exercises
-- workshop_state and its trigger graph before rolling back.
begin;

update zukait_history.configuration
set mode='compact', cutover_approved=true
where singleton=true;

do $verify$
declare
  old_s public.workshop_state%rowtype;
  new_s public.workshop_state%rowtype;
  result jsonb;
  restored jsonb;
  storage_kind text;
  legacy_count bigint;
begin
  select * into old_s from public.workshop_state where id='main';
  if not found then raise exception 'qa_workshop_state_missing'; end if;
  select count(*) into legacy_count from public.workshop_state_history;

  select public.zukait_commit_workshop_state_v2(
    old_s.revision,
    jsonb_set(old_s.data,'{_compactHistoryQaMarker}',
              '"rollback-only"'::jsonb,true),
    'rollback_only_qa','[]'::jsonb
  ) into result;

  if result->>'ok' <> 'true' then
    raise exception 'save_failed: %',result;
  end if;
  select * into new_s from public.workshop_state where id='main';
  if new_s.revision <> old_s.revision+1 then
    raise exception 'new_revision_missing';
  end if;
  if (select count(*) from public.workshop_state_history) <> legacy_count then
    raise exception 'legacy_snapshot_still_written';
  end if;
  if (select count(*) from zukait_history.revisions
      where revision in (old_s.revision,new_s.revision)) <> 2 then
    raise exception 'compact_history_entries_missing';
  end if;

  restored:=zukait_history.reconstruct_state(new_s.revision);
  if restored is distinct from new_s.data then
    raise exception 'compact_state_reconstruction_mismatch';
  end if;
  select data,storage_format into restored,storage_kind
  from zukait_history.read_revision(new_s.revision);
  if storage_kind <> 'current' or restored is distinct from new_s.data then
    raise exception 'current_state_read_mismatch';
  end if;
  select data into restored
  from zukait_history.read_revision(old_s.revision);
  if restored is distinct from old_s.data then
    raise exception 'historical_revision_read_mismatch';
  end if;
end $verify$;

rollback;
