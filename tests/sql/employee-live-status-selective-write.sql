-- Isolated SQL regression. Run on a disposable PostgreSQL database only.
-- Models the existing ON CONFLICT condition and candidate business-only condition.
begin;
create temporary table employee_status_candidate (
 employee_id text primary key, status text not null,
 job_no text, state_revision bigint not null, updated_by text not null
) on commit drop;
insert into employee_status_candidate(employee_id,status,job_no,state_revision,updated_by)
select 'E'||g,'Available',null,100,'QA' from generate_series(1,18) g;
do $$
declare n int; changed int; i int;
begin
  -- A revision-only advance should cause zero physical updates.
  for i in 101..1100 loop
    update employee_status_candidate
       set status='Available',job_no=null,state_revision=i,updated_by='QA'
     where (status,job_no) is distinct from ('Available'::text,null::text);
    get diagnostics changed = row_count;
    if changed<>0 then raise exception 'revision-only changed % rows',changed; end if;
  end loop;
  -- One actual status transition updates exactly one row.
  update employee_status_candidate
     set status='Working',job_no='JC123',state_revision=1101,updated_by='QA'
   where employee_id='E7'
     and (status,job_no) is distinct from ('Working'::text,'JC123'::text);
  get diagnostics changed = row_count;
  if changed<>1 then raise exception 'expected one changed employee, got %',changed; end if;
  select count(*) into n from employee_status_candidate where state_revision=100;
  if n<>17 then raise exception 'unchanged employee revision history lost: %',n; end if;
  -- Replaying the same business state must not rewrite E7.
  update employee_status_candidate
     set status='Working',job_no='JC123',state_revision=1102,updated_by='QA'
   where employee_id='E7'
     and (status,job_no) is distinct from ('Working'::text,'JC123'::text);
  get diagnostics changed = row_count;
  if changed<>0 then raise exception 'duplicate transition rewrote % rows',changed; end if;
end $$;

-- Check all live-status business fields, not just status/job number.
create temporary table employee_status_full (
 employee_id text primary key, employee_name text, department text, status text,
 job_no text, assignment_id text, session_id text, session_start bigint,
 suggested_minutes numeric, vehicle text, registration text, overtime boolean,
 state_revision bigint, updated_by text
) on commit drop;
insert into employee_status_full values
 ('E1','Employee One','Paint','Working','JC1','A1','S1',100,60,'Toyota','123-M',false,5,'Manager');
do $$
declare n integer;
begin
 -- Same business state, newer global revision and different actor: no write.
 update employee_status_full set state_revision=6,updated_by='Supervisor'
 where employee_id='E1' and
 row(employee_name,department,status,job_no,assignment_id,session_id,session_start,suggested_minutes,vehicle,registration,overtime)
 is distinct from
 row('Employee One','Paint','Working','JC1','A1','S1',100::bigint,60::numeric,'Toyota','123-M',false);
 get diagnostics n=row_count;
 if n<>0 then raise exception 'metadata-only rewrite'; end if;
 -- Null-safe session change must write exactly once.
 update employee_status_full set session_id=null,state_revision=6,updated_by='Supervisor'
 where employee_id='E1' and
 row(employee_name,department,status,job_no,assignment_id,session_id,session_start,suggested_minutes,vehicle,registration,overtime)
 is distinct from
 row('Employee One','Paint','Working','JC1','A1',null::text,100::bigint,60::numeric,'Toyota','123-M',false);
 get diagnostics n=row_count;
 if n<>1 then raise exception 'session null transition missed'; end if;
 -- Repeating the same session removal must not write.
 update employee_status_full set session_id=null,state_revision=7
 where employee_id='E1' and
 row(employee_name,department,status,job_no,assignment_id,session_id,session_start,suggested_minutes,vehicle,registration,overtime)
 is distinct from
 row('Employee One','Paint','Working','JC1','A1',null::text,100::bigint,60::numeric,'Toyota','123-M',false);
 get diagnostics n=row_count;
 if n<>0 then raise exception 'duplicate session removal rewrote row'; end if;
end $$;

-- Two different employees changing status in one revision must update exactly two rows.
do $$
declare changed integer; unchanged integer;
begin
  update employee_status_candidate
     set status='Paused', job_no='JC200', state_revision=1200
   where employee_id in ('E3','E9')
     and (status,job_no) is distinct from ('Paused'::text,'JC200'::text);
  get diagnostics changed=row_count;
  if changed<>2 then raise exception 'two-employee batch changed % rows',changed; end if;
  select count(*) into unchanged from employee_status_candidate where state_revision=100;
  if unchanged<>15 then raise exception 'unrelated employee revisions changed: %',unchanged; end if;
  -- Repeating the same batch must not rewrite either row.
  update employee_status_candidate
     set status='Paused',job_no='JC200',state_revision=1201
   where employee_id in ('E3','E9')
     and (status,job_no) is distinct from ('Paused'::text,'JC200'::text);
  get diagnostics changed=row_count;
  if changed<>0 then raise exception 'replayed two-employee batch rewrote % rows',changed; end if;
end $$;
rollback;
