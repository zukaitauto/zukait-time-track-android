-- ZUKAIT ERP - dual history compatibility smoke test
-- Run on an ISOLATED QA project only, after applying the two
-- compact history foundation + read-compatibility migrations.
-- No deletion, cleanup or production activation. Entire transaction rolls back.
--
-- Dual mode is a transitional compatibility configuration:
-- both legacy full snapshots and compact delta/checkpoints are written.
-- This deliberately DOES NOT reduce history disk usage yet.
begin;
update zukait_history.configuration
set mode='dual',checkpoint_interval=100,cutover_approved=false
where singleton=true;

do $verify$
declare
  old_s public.workshop_state%rowtype;
  new_s public.workshop_state%rowtype;
  result jsonb;
  old_copy jsonb;
  rebuilt jsonb;
  source_type text;
begin
  select * into old_s from public.workshop_state where id='main';
  if not found then raise exception 'qa_workshop_state_missing'; end if;

  select public.zukait_commit_workshop_state_v2(
    old_s.revision,
    jsonb_set(old_s.data,'{_dualHistoryQaMarker}',
              '"reversible-qa"'::jsonb,true),
    'rollback_only_qa','[]'::jsonb
  ) into result;
  if result->>'ok'<>'true' then
    raise exception 'qa_save_failed: %',result;
  end if;

  select * into new_s from public.workshop_state where id='main';
  if new_s.revision<>old_s.revision+1 then
    raise exception 'revision_failed_to_advance';
  end if;

  select data into old_copy from public.workshop_state_history
  where revision=old_s.revision;
  if old_copy is distinct from old_s.data then
    raise exception 'legacy_snapshot_not_preserved';
  end if;

  rebuilt:=zukait_history.reconstruct_state(new_s.revision);
  if rebuilt is distinct from new_s.data then
    raise exception 'compact_shadow_reconstruction_mismatch';
  end if;

  select data,storage_format into old_copy,source_type
  from zukait_history.read_revision(old_s.revision);
  if old_copy is distinct from old_s.data or source_type<>'legacy' then
    raise exception 'legacy_read_compatibility_broken';
  end if;
end $verify$;

rollback;
