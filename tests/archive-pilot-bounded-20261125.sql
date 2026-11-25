\set ON_ERROR_STOP on
create schema private;
create schema cron;
create table cron.stops(name text);
create function cron.unschedule(text) returns boolean language sql as $$ insert into cron.stops values ($1) returning true $$;
create table public.workshop_state_history(revision bigint primary key,data jsonb not null,updated_at timestamptz,updated_by text,archived_at timestamptz);
create table public.workshop_state(id text primary key,revision bigint,data jsonb);
create table private.workshop_archive_conversion_pilot(revision bigint primary key,is_checkpoint boolean not null,payload jsonb not null,updated_at timestamptz,updated_by text,archived_at timestamptz);
create table private.workshop_manager_edit_revision(prior_revision bigint,delta jsonb);
create table private.workshop_job_notes_delta(prior_revision bigint);
create table private.workshop_time_edit_revision(prior_revision bigint,delta jsonb);
create table expected(revision bigint primary key,data jsonb,updated_at timestamptz,updated_by text,archived_at timestamptz);
insert into expected
select i,jsonb_build_object('jobs',jsonb_build_array(jsonb_build_object('id','J1','notes',i::text),case when i%2=0 then 'null'::jsonb else jsonb_build_object('id','J2') end),'sessions',case when i%3=0 then '[]'::jsonb else jsonb_build_array(jsonb_build_object('start',i)) end,'nullable',null,'changed',i%3)
 ||case when i%2=0 then jsonb_build_object('removedLater',true) else '{}'::jsonb end,
 '2026-11-25 00:00+00'::timestamptz+i*interval '1 second','QA','2026-11-25 01:00+00'::timestamptz+i*interval '1 second'
from generate_series(17662,17678) i;
insert into public.workshop_state_history select * from expected where revision<>17670;
insert into private.workshop_archive_conversion_pilot select revision,true,data,updated_at,updated_by,archived_at from expected where revision=17670;
insert into public.workshop_state_history values(17684,'{"newer":true}',now(),'QA',now());
\ir fixtures/archive-pilot-live-readers-20261125.sql
\ir ../supabase/staged/WORKSHOP_ARCHIVE_CONVERSION_BOUNDED_20261125.sql
select private.continue_workshop_archive_conversion();
do $$ begin
 if (select count(*) from private.workshop_archive_conversion_pilot)<>5 then raise exception 'batch cap failed'; end if;
 if exists(select 1 from expected e where public.zukait_read_workshop_merge_base(e.revision) is distinct from e.data) then raise exception 'first batch recovery failed'; end if;
end $$;
select private.continue_workshop_archive_conversion();
do $$ begin
 if (select count(*) from private.workshop_archive_conversion_pilot)<>9 then raise exception 'second batch cap failed'; end if;
 if exists(select 1 from expected e where public.zukait_read_workshop_merge_base(e.revision) is distinct from e.data) then raise exception 'second batch recovery failed'; end if;
end $$;
create or replace function public.zukait_read_workshop_merge_base(p_revision bigint) returns jsonb language sql stable set search_path to '' as $$ select case when p_revision=17672 then '{}'::jsonb else private.recover_workshop_revision(p_revision) end $$;
select private.continue_workshop_archive_conversion();
do $$ begin
 if (select count(*) from private.workshop_archive_conversion_pilot)<>9 then raise exception 'failed batch did not roll back'; end if;
 if not exists(select 1 from public.workshop_state_history where revision=17672) then raise exception 'original lost on verification failure'; end if;
 if not exists(select 1 from cron.stops where name='workshop_archive_conversion_17683') then raise exception 'failure did not stop scheduled conversion'; end if;
end $$;
\ir fixtures/archive-pilot-live-readers-20261125.sql
select private.continue_workshop_archive_conversion();
select private.continue_workshop_archive_conversion();
do $$ begin
 if (select count(*) from private.workshop_archive_conversion_pilot)<>17 then raise exception 'conversion incomplete'; end if;
 if exists(select 1 from expected e where public.zukait_read_workshop_merge_base(e.revision) is distinct from e.data) then raise exception 'final reconstruction mismatch'; end if;
 if exists(select 1 from private.workshop_archive_conversion_pilot p join expected e using(revision) where (p.updated_at,p.updated_by,p.archived_at) is distinct from (e.updated_at,e.updated_by,e.archived_at)) then raise exception 'final metadata mismatch'; end if;
 if not exists(select 1 from public.workshop_state_history where revision=17684) then raise exception 'out of scope history changed'; end if;
 if exists(select 1 from public.workshop_state_history where revision<=17683) then raise exception 'originals remain in test scope'; end if;
end $$;
select 'PASS: four-record batches, every revision exact, metadata preserved, failure atomic rollback, scope protected' as result;
