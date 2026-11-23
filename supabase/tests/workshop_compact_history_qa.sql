-- Run only in an isolated QA project after applying
-- 20261103123000_workshop_compact_history_foundation.sql.
-- All sample changes are transactional and ROLLBACK at end.
-- Tests:
--   * checkpoint seed and incremental changes
--   * top-level deletion and JSON null preservation
--   * periodic checkpoint at revision divisible by 100
--   * lossless reconstruction & digest validation
--   * compact archive gate suppresses a legacy INSERT
-- Never run with live production traffic.
begin;

update zukait_history.configuration
set mode='dual',checkpoint_interval=100
where singleton=true;

create temporary table compact_history_fixture (
  revision bigint not null,
  data jsonb not null,
  updated_at timestamptz not null default now(),
  updated_by text
);

create trigger qa_compact_capture
after update of revision,data on compact_history_fixture
for each row
execute function zukait_history.capture_state_update();

insert into compact_history_fixture(revision,data,updated_by)
values (999000098,'{"jobs":[{"no":"JC1"}],"removed":"yes","nullable":null}'::jsonb,'qa');

update compact_history_fixture set
  revision=999000099,
  data='{"jobs":[{"no":"JC1"},{"no":"JC2"}],"nullable":null,"new":true}'::jsonb;
update compact_history_fixture set
  revision=999000100,
  data='{"jobs":[{"no":"JC1"},{"no":"JC2"}],"nullable":null,"new":false}'::jsonb;
update compact_history_fixture set
  revision=999000101,
  data='{"jobs":[{"no":"JC2"}],"nullable":null,"new":false}'::jsonb;

do $verify$
declare
  v jsonb;
  v_kind text;
begin
  if zukait_history.reconstruct_state(999000098)
       <> '{"jobs":[{"no":"JC1"}],"removed":"yes","nullable":null}'::jsonb
  then raise exception 'initial checkpoint mismatch'; end if;
  if zukait_history.reconstruct_state(999000099)
       <> '{"jobs":[{"no":"JC1"},{"no":"JC2"}],"nullable":null,"new":true}'::jsonb
  then raise exception 'delta / deletion mismatch'; end if;
  if zukait_history.reconstruct_state(999000101)
       <> '{"jobs":[{"no":"JC2"}],"nullable":null,"new":false}'::jsonb
  then raise exception 'reconstruction across periodic checkpoint failed'; end if;
  select kind into v_kind from zukait_history.revisions where revision=999000100;
  if v_kind <> 'checkpoint' then raise exception '100th checkpoint missing'; end if;
  select kind into v_kind from zukait_history.revisions where revision=999000099;
  if v_kind <> 'delta' then raise exception 'delta not generated'; end if;
end $verify$;

update zukait_history.configuration
set mode='compact',cutover_approved=true
where singleton=true;

insert into public.workshop_state_history
(revision,data,updated_at,updated_by)
values (999000999,'{"doNotPersist":"full snapshot"}'::jsonb,now(),'qa')
on conflict (revision) do nothing;

do $verify_gate$
begin
  if exists(select 1 from public.workshop_state_history
       where revision=999000999) then
    raise exception 'compact archive gate failed to suppress snapshot';
  end if;
end $verify_gate$;

rollback;
