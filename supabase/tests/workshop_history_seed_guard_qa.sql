-- ISOLATED SYNTHETIC QA ONLY; never execute on the live garage.
-- BEFORE INSERT instrumentation measures attempted archive seeds, not just rows
-- surviving ON CONFLICT. Existing checksums/readers must remain exact.
begin;
update zukait_history.configuration set mode='compact',cutover_approved=true,
 checkpoint_interval=10 where singleton;
create temporary table qa_history_seed_attempts(revision bigint);
create function pg_temp.qa_history_seed_probe() returns trigger language plpgsql as $$
begin insert into qa_history_seed_attempts values(new.revision);return new;end $$;
create trigger qa_history_seed_probe before insert on zukait_history.revisions
 for each row execute function pg_temp.qa_history_seed_probe();
do $qa$
declare initial public.workshop_state%rowtype; before_save public.workshop_state%rowtype;
 result jsonb; original_rows bigint; existing_seeds bigint; expected_attempts bigint; i integer;
begin
 select * into strict initial from public.workshop_state where id='main';
 select count(*) into original_rows from public.workshop_state_history;
 select count(*) into existing_seeds from zukait_history.revisions where revision=initial.revision;
 expected_attempts:=12+case when existing_seeds=0 then 1 else 0 end;
 for i in 1..12 loop
  select * into strict before_save from public.workshop_state where id='main';
  result:=public.zukait_commit_workshop_state_v2(before_save.revision,
   jsonb_set(before_save.data,'{_historySeedQa}',to_jsonb(i),true),'isolated_seed_qa','[]'::jsonb);
  if result->>'ok' is distinct from 'true' then raise exception 'seed_save_failed_%',i;end if;
  if zukait_history.reconstruct_state(before_save.revision) is distinct from before_save.data then
   raise exception 'seed_old_state_changed_%',i;end if;
  if zukait_history.reconstruct_state(before_save.revision+1) is distinct from
   (select data from public.workshop_state where id='main') then
   raise exception 'seed_new_state_changed_%',i;end if;
 end loop;
 if (select count(*) from qa_history_seed_attempts)<>expected_attempts
 or exists(select 1 from qa_history_seed_attempts group by revision having count(*)>1) then
  raise exception 'redundant_history_seed_attempts';
 end if;
 if (select count(*) from public.workshop_state_history)<>original_rows then
  raise exception 'compact_legacy_archive_regression';end if;
 if not exists(select 1 from zukait_history.revisions where revision>initial.revision
   and revision<=initial.revision+12 and kind='checkpoint') then
  raise exception 'periodic_checkpoint_missing';end if;
 if (select revision from public.workshop_state where id='main')<>initial.revision+12 then
  raise exception 'seed_revision_mismatch';end if;
end $qa$;
rollback;
