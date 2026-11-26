-- Disposable PostgreSQL only. Run the real state trigger and timer writer together.
begin;
create schema private;
create table public.workshop_state(id text primary key,revision bigint,data jsonb,updated_at timestamptz,updated_by text);
create table public.workshop_live_status(employee_id text primary key,employee_name text,department text,status text,job_no text,assignment_id text,session_id text,session_start bigint,suggested_minutes numeric,vehicle text,registration text,overtime boolean,state_revision bigint,updated_at timestamptz,updated_by text);
create table private.workshop_time_edit_revision(prior_revision bigint,prior_updated_at timestamptz,prior_updated_by text,delta jsonb);
-- These stubs isolate write amplification. Archive correctness has separate acceptance tests.
create function private.normalize_job_edit_archive_candidate(jsonb,jsonb) returns jsonb language sql as 'select $2';
create function private.workshop_time_edit_delta(jsonb,jsonb) returns jsonb language sql as 'select $1';
create function private.undo_workshop_time_edit(jsonb,jsonb) returns jsonb language sql as 'select $2';
\i tests/sql/candidate-refresh-live-status.sql
\i tests/sql/qa-timer-rollback-20261126.sql
;
create function public.timer_fixture_trigger() returns trigger language plpgsql as $$
begin
 perform public.zukait_refresh_live_status_from_state(new.data,new.revision,new.updated_by);
 return new;
end $$;
create trigger refresh_fixture after insert or update of data,revision on public.workshop_state
for each row execute function public.timer_fixture_trigger();
create table public.write_counts(kind text);
create function public.count_fixture_write() returns trigger language plpgsql as $$
begin insert into public.write_counts values (TG_OP); return new; end $$;
create trigger capture_fixture after insert or update or delete on public.workshop_live_status
for each row execute function public.count_fixture_write();
create function private.timer_fixture_run(expected integer) returns void language plpgsql as $$
declare state jsonb; live jsonb; result jsonb; writes integer;
begin
 truncate public.workshop_state, public.workshop_live_status, public.write_counts;
 select jsonb_build_object('users',jsonb_agg(jsonb_build_object('role','Employee','id','E'||i))) into state from generate_series(1,18) i;
 insert into public.workshop_state values ('main',10,state,now(),'QA');
 truncate public.write_counts;
 state:=state || '{"assign":[{"id":"A1","emp":"E1","job":"JC1"}],"sessions":[{"id":"S1","emp":"E1","job":"JC1","start":100}]}'::jsonb;
 select jsonb_agg(jsonb_build_object('employee_id','E'||i,'status',case when i=1 then 'Working' else 'Available' end) ||
   case when i=1 then '{"job_no":"JC1","assignment_id":"A1","session_id":"S1","session_start":100}'::jsonb else '{}'::jsonb end)
 into live from generate_series(1,18) i;
 result:=private.commit_workshop_time_changes(10,state,'QA',live);
 if result->>'revision' is distinct from '11' then raise exception 'commit failed %',result; end if;
 select count(*) into writes from public.write_counts;
 if writes<>expected then raise exception 'expected % writes, observed %',expected,writes; end if;
 if (select count(*) from public.workshop_live_status where status='Working' and session_id='S1')<>1 then raise exception 'timer status mismatch'; end if;
 if expected=1 then
   update public.workshop_live_status set state_revision=99 where employee_id='E2';
   truncate public.write_counts;
   perform private.commit_workshop_time_changes(11,state,'QA',live);
   if (select count(*) from public.write_counts)<>1 or (select state_revision from public.workshop_live_status where employee_id='E2')<>11 then raise exception 'invalid revision repair failed'; end if;
 end if;
 truncate public.write_counts;
 update public.workshop_state set revision=12;
 if (select count(*) from public.write_counts)<>18 then raise exception 'ordinary state refresh changed'; end if;
end $$;
select private.timer_fixture_run(18);
\i tests/sql/candidate-commit-workshop-time-changes.sql
select private.timer_fixture_run(1);
rollback;
