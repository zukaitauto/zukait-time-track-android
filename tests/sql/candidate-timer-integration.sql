-- Disposable PostgreSQL integration harness for the actual candidate function.
-- Never execute against production or QA workshop data.
begin;
create schema private;
create table public.workshop_state(id text primary key, revision bigint not null, data jsonb not null, updated_at timestamptz default now(),updated_by text);
create table public.workshop_live_status(
 employee_id text primary key,employee_name text,department text,status text,
 job_no text,assignment_id text,session_id text,session_start bigint,
 suggested_minutes numeric,vehicle text,registration text,overtime boolean,
 state_revision bigint,updated_at timestamptz,updated_by text
);
create table private.workshop_time_edit_revision(prior_revision bigint,prior_updated_at timestamptz,prior_updated_by text,delta jsonb);
create function private.normalize_job_edit_archive_candidate(jsonb,jsonb) returns jsonb language sql as 'select $2';
create function private.workshop_time_edit_delta(jsonb,jsonb) returns jsonb language sql as 'select ''{}''::jsonb';
create function private.undo_workshop_time_edit(jsonb,jsonb) returns jsonb language sql as 'select ''{}''::jsonb';
create table public.live_write_audit(employee_id text,operation text);
create function public.audit_live_write() returns trigger language plpgsql as $$
begin
 insert into public.live_write_audit values (new.employee_id,TG_OP);
 return new;
end $$;
create trigger audit_live_write after insert or update on public.workshop_live_status
for each row execute function public.audit_live_write();
insert into public.workshop_state(id,revision,data,updated_by) values ('main',10,'{}','QA');
\i tests/sql/candidate-commit-workshop-time-changes.sql
do $$
declare payload jsonb; result jsonb; writes int; revision bigint;
begin
 select jsonb_agg(jsonb_build_object('employee_id','E'||g,'employee_name','Employee '||g,'status','Available'))
 into payload from generate_series(1,20) g;
 result:=private.commit_workshop_time_changes(10,'{}','QA',payload);
 if result->>'ok'<>'true' then raise exception 'initial candidate commit failed: %',result; end if;
 select count(*) into writes from public.live_write_audit;
 if writes<>20 then raise exception 'expected 20 initial inserts, got %',writes; end if;
 truncate public.live_write_audit;
 -- Unchanged projection at same revision must not rewrite rows.
 result:=private.commit_workshop_time_changes(10,'{}','QA',payload);
 select count(*) into writes from public.live_write_audit;
 if writes<>0 then raise exception 'unchanged candidate rewrote % rows',writes; end if;
 -- Simulate an unrelated workshop revision advance; only E7 changes status.
 update public.workshop_state set revision=11 where id='main';
 payload:=(select jsonb_agg(case when value->>'employee_id'='E7' then jsonb_set(value,'{status}','"Working"') else value end)
 from jsonb_array_elements(payload));
 result:=private.commit_workshop_time_changes(11,'{}','QA',payload);
 select count(*) into writes from public.live_write_audit;
 if writes<>1 then raise exception 'one employee change rewrote % rows',writes; end if;
 select state_revision into revision from public.workshop_live_status where employee_id='E1';
 if revision<>10 then raise exception 'unchanged employee revision changed: %',revision; end if;
 select state_revision into revision from public.workshop_live_status where employee_id='E7';
 if revision<>11 then raise exception 'changed employee revision not advanced: %',revision; end if;
end $$;
rollback;
