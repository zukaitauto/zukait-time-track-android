#!/usr/bin/env bash
# Isolated PostgreSQL concurrency test: two sessions contend for the same
# workshop revision. Never connect this script to a live workshop database.
set -euo pipefail
: "${PGDATABASE:?Set PGDATABASE to a disposable test database}"
psql -X -v ON_ERROR_STOP=1 <<'SQL'
begin;
create table if not exists public.timer_cas_qa (
 id text primary key, revision bigint not null
);
insert into public.timer_cas_qa values ('main', 1)
on conflict(id) do update set revision=excluded.revision;
commit;
SQL
# Hold the row lock in one session while a second attempts the same revision.
psql -X -v ON_ERROR_STOP=1 <<'SQL' &
begin;
select revision from public.timer_cas_qa where id='main' for update;
select pg_sleep(2);
update public.timer_cas_qa set revision=2 where id='main' and revision=1;
commit;
SQL
first=$!
sleep 0.5
psql -X -v ON_ERROR_STOP=1 <<'SQL'
begin;
do $$
declare current_revision bigint;
begin
 select revision into current_revision from public.timer_cas_qa where id='main' for update;
 if current_revision = 1 then
   update public.timer_cas_qa set revision=2 where id='main';
 else
   raise notice 'PASS: second session saw conflict at revision %', current_revision;
 end if;
end $$;
commit;
SQL
wait "$first"
result=$(psql -X -At -v ON_ERROR_STOP=1 -c "select revision from public.timer_cas_qa where id='main'")
test "$result" = 2 || { echo "FAIL: expected one committed revision, got $result"; exit 1; }
echo 'PASS: row lock serialized simultaneous expected-revision writers.'
