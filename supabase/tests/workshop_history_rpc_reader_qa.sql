-- ZUKAIT ERP reader compatibility checks. QA ONLY.
-- Tests private service-role wrapper, legacy revisions, compact-only history,
-- access restrictions, and rollback. No persistent workshop change.
begin;

do $verify$
declare
  s public.workshop_state%rowtype;
  changed public.workshop_state%rowtype;
  v_state jsonb;
  v_legacy_count bigint;
begin
  if has_function_privilege('anon','public.zukait_history_revision_data(bigint)','execute')
     or has_function_privilege('authenticated','public.zukait_history_revision_data(bigint)','execute')
     or not has_function_privilege('service_role','public.zukait_history_revision_data(bigint)','execute')
  then raise exception 'history_reader_acl_broken'; end if;

  select * into s from public.workshop_state where id='main' for update;
  if public.zukait_history_revision_data(s.revision) is distinct from s.data
  then raise exception 'current_revision_read_mismatch'; end if;
  if public.zukait_history_revision_data(999999999) is not null
  then raise exception 'unknown_revision_should_return_null'; end if;

  select count(*) into v_legacy_count from public.workshop_state_history;
  update zukait_history.configuration
  set mode='compact',cutover_approved=true
  where singleton=true;
  insert into public.workshop_state_history(revision,data,updated_at,updated_by)
  values (s.revision,s.data,s.updated_at,s.updated_by)
  on conflict(revision) do nothing;
  update public.workshop_state
    set revision=s.revision+1,
        data=jsonb_set(s.data,'{_readerQaMarker}','"rollback-only"'::jsonb,true),
        updated_at=clock_timestamp(),updated_by='qa_rollback'
  where id='main';
  select * into changed from public.workshop_state where id='main';
  if (select count(*) from public.workshop_state_history)<>v_legacy_count
  then raise exception 'compact_only_wrote_full_snapshot'; end if;
  if public.zukait_history_revision_data(changed.revision)
        is distinct from changed.data
  then raise exception 'compact_current_read_failed'; end if;
  v_state:=zukait_history.reconstruct_state(changed.revision);
  if v_state is distinct from changed.data then
    raise exception 'compact_revision_recovery_failed'; end if;
  if public.zukait_history_revision_data(s.revision) is distinct from s.data
  then raise exception 'legacy_or_checkpoint_read_failed'; end if;
end $verify$;

rollback;
