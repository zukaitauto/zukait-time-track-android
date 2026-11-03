-- QA-only regression test. Run against an isolated database after applying
-- both 20261103123000 and 20261103133000 migrations.
-- Entire test rolls back. It reads but never replaces live workshop records.
begin;
do $test$
declare
  v_rev bigint;
  v_expected jsonb;
  v_actual jsonb;
  v_source text;
begin
  select revision, data into v_rev,v_expected
  from public.workshop_state_history order by revision limit 1;
  if v_rev is not null then
    select data,storage_format into v_actual,v_source
    from zukait_history.read_revision(v_rev);
    if v_actual is distinct from v_expected or v_source <> 'legacy'
    then raise exception 'legacy history compatibility mismatch'; end if;
  end if;
  select revision,data into v_rev,v_expected
  from public.workshop_state where id='main';
  select data,storage_format into v_actual,v_source
  from zukait_history.read_revision(v_rev);
  if v_actual is distinct from v_expected or v_source <> 'current'
  then raise exception 'current-state compatibility mismatch'; end if;
end $test$;

update zukait_history.configuration
set mode='dual',checkpoint_interval=100 where singleton=true;

create temporary table qa_compact_history_state(
  revision bigint,data jsonb,updated_at timestamptz,updated_by text
);
create trigger qa_compact_history_capture
after update of revision,data on qa_compact_history_state for each row
execute function zukait_history.capture_state_update();

insert into qa_compact_history_state
values (999003099,'{"jobs":[{"no":"A"}],"removed":"yes"}'::jsonb,now(),'qa');
update qa_compact_history_state set
 revision=999003100,data='{"jobs":[{"no":"A"},{"no":"B"}],"nullValue":null}'::jsonb;
update qa_compact_history_state set
 revision=999003101,data='{"jobs":[{"no":"B"}],"nullValue":null}'::jsonb;

do $test$
declare v jsonb; v_src text;
begin
  select data,storage_format into v,v_src
  from zukait_history.read_revision(999003100);
  if v_src<>'checkpoint' or
    v <> '{"jobs":[{"no":"A"},{"no":"B"}],"nullValue":null}'::jsonb
  then raise exception 'checkpoint compatibility mismatch'; end if;
  select data,storage_format into v,v_src
  from zukait_history.read_revision(999003101);
  if v_src<>'delta' or
    v <> '{"jobs":[{"no":"B"}],"nullValue":null}'::jsonb
  then raise exception 'delta compatibility mismatch'; end if;
end $test$;
rollback;
