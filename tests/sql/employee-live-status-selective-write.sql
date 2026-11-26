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
rollback;
