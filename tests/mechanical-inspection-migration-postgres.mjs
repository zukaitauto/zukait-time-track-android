// Test the deployable V377 migration against a disposable local PostgreSQL 17 DB.
// Never connects to production. The actual production authorization definition
// is extracted from the committed foundation migration.
import {execFileSync} from 'node:child_process';
import fs from 'node:fs';
import assert from 'node:assert/strict';
assert.equal(process.env.ZUKAIT_MECHANICAL_NATIVE,'1');
assert.equal(process.env.PGHOST,'127.0.0.1');
assert.equal(process.env.PGPORT,'5432');
assert.equal(process.env.PGUSER??'postgres','postgres');
assert.equal(process.env.PGDATABASE??'postgres','postgres');
for(const k of ['PGHOSTADDR','PGSERVICE','PGSERVICEFILE','PGPASSFILE','PGOPTIONS','PGTARGETSESSIONATTRS','PGREQUIRESSL'])
 assert.equal(process.env[k],undefined,`unexpected PostgreSQL override ${k}`);
const args=['-X','-h','127.0.0.1','-p','5432','-U','postgres','-v','ON_ERROR_STOP=1','-At'];
const run=(sql,database='v377_inspection_test')=>execFileSync('psql',[...args,'-d',database],{input:sql,encoding:'utf8'});
run('create database v377_inspection_test;','postgres');
const foundation=fs.readFileSync('supabase/migrations/20261025073818_mechanical_department_inactive_foundation.sql','utf8');
const auth=foundation.match(/create function zukait_mechanical\.authorize_session\([\s\S]*?grant execute on function zukait_mechanical\.authorize_session\(text,text,text\) to service_role;/i)?.[0];
assert.ok(auth,'real Mechanical session authorization must exist in the foundation');
const setup=`
DO $roles$ DECLARE n text; BEGIN
 FOR n IN SELECT unnest(ARRAY['anon','authenticated','service_role']) LOOP
  IF NOT EXISTS(SELECT 1 FROM pg_roles WHERE rolname=n) THEN EXECUTE format('CREATE ROLE %I NOLOGIN',n);END IF;
 END LOOP;
END $roles$;
-- Match Supabase's service_role RLS bypass in this disposable test database.
alter role service_role bypassrls;
create table public.staff_credentials(
 user_id text primary key,role text not null,active boolean not null,department text
);
create table public.staff_sessions(
 token_hash text primary key,user_id text not null references public.staff_credentials(user_id),revoked_at timestamptz
);
grant select,update on public.staff_credentials,public.staff_sessions to service_role;
create schema zukait_mechanical;
grant usage on schema zukait_mechanical to service_role;
create table zukait_mechanical.settings(
 singleton boolean primary key,enabled boolean not null,repeat_enabled boolean not null,
 capabilities jsonb not null,department text,duplicate_jc_mode text,minimum_digits integer
);
create table zukait_mechanical.checklists(
 id uuid primary key,number text not null,job_card text not null,manual_jc_date date not null,
 created_by text not null references public.staff_credentials(user_id)
);
grant select on zukait_mechanical.settings,zukait_mechanical.checklists to service_role;
insert into zukait_mechanical.settings values(true,true,false,
 '{"SUP003":["MC_CREATE"],"MAN001":["MC_CREATE"]}'::jsonb,'Mechanical','deny',3);
insert into public.staff_credentials values
 ('SUP003','Mechanical Supervisor',true,'Mechanical'),
 ('MAN001','Manager',true,'Management'),
 ('EMP001','Employee',true,'Mechanical');
insert into public.staff_sessions values(repeat('a',64),'SUP003',null),
 (repeat('b',64),'MAN001',null),(repeat('c',64),'EMP001',null);
insert into zukait_mechanical.checklists values
 ('11111111-1111-4111-8111-111111111111','MC0001','MJC001',current_date,'SUP003');
`;
run(setup+auth);
const migration=fs.readFileSync('supabase/migrations/20261031120000_mechanical_inspection_secure.sql','utf8');
run(migration);
const serviceRead=run(`set role service_role;
 select public.zukait_mechanical_inspection_read('SUP003',repeat('a',64),
  '11111111-1111-4111-8111-111111111111')->>'ok';
 reset role;`).trim();
assert.ok(serviceRead.includes('true'),'service_role must be able to call authenticated inspection RPC');
const checkGrants=run(`
select has_function_privilege('anon','public.zukait_mechanical_inspection_read(text,text,uuid)','execute');
select has_function_privilege('authenticated','public.zukait_mechanical_inspection_save(text,text,uuid,uuid,bigint,jsonb)','execute');
select has_function_privilege('service_role','public.zukait_mechanical_inspection_save(text,text,uuid,uuid,bigint,jsonb)','execute');
select count(*) from pg_class c join pg_namespace n on n.oid=c.relnamespace
 where n.nspname='zukait_mechanical' and c.relname in
 ('inspection_details','inspection_receipts','inspection_audit') and c.relrowsecurity;
`).trim().split('\n');
assert.deepEqual(checkGrants,['f','f','t','3'],'server-only functions and RLS');
const checks=['lights','wipers','powerWindows','centralLocking','mirrors','horn','dashboardWarning','airConditioning'];
const inspection={jobType:'CASH',vehicle:{registration:'1234 AB',make:'Toyota',model:'Camry',year:'2022',
 customer:'Test Customer',contact:'90000000'},damageMarks:[{part:'Front Bumper',mark:'X'}],
 functions:Object.fromEntries(checks.map(k=>[k,{status:'NOT_CHECKED'}])),
 workDescription:'Inspect body and repair'};
const escaped=JSON.stringify(inspection).replaceAll("'","''");
const probe=`
DO $test$ DECLARE
 p jsonb:='${escaped}'::jsonb;
 r jsonb; r2 jsonb; blocked boolean;
BEGIN
 r:=public.zukait_mechanical_inspection_read('SUP003',repeat('a',64),
  '11111111-1111-4111-8111-111111111111');
 IF r->>'ok'<>'true' OR r->'inspection'<>'null'::jsonb
 THEN RAISE EXCEPTION 'empty read failed: %',r;END IF;
 blocked:=false;
 BEGIN
  PERFORM public.zukait_mechanical_inspection_save('EMP001',repeat('c',64),
   '11111111-1111-4111-8111-111111111111',
   '22222222-2222-4222-8222-222222222222',0,p);
 EXCEPTION WHEN OTHERS THEN
  IF SQLSTATE NOT IN ('42501','P0001') THEN RAISE;END IF;
  blocked:=true;
 END;
 IF NOT blocked THEN RAISE EXCEPTION 'employee save authorized';END IF;
 BEGIN
  PERFORM public.zukait_mechanical_inspection_save('SUP003',repeat('a',64),
   '33333333-3333-4333-8333-333333333333',
   '44444444-4444-4444-8444-444444444444',0,p);
  RAISE EXCEPTION 'other checklist authorized';
 EXCEPTION WHEN SQLSTATE 'P0002' THEN NULL;
 END;
 r:=public.zukait_mechanical_inspection_save('SUP003',repeat('a',64),
  '11111111-1111-4111-8111-111111111111',
  '22222222-2222-4222-8222-222222222222',0,p);
 IF r->>'revision'<>'1' OR r->>'replayed'<>'false' THEN
  RAISE EXCEPTION 'initial write failed %',r;END IF;
 r2:=public.zukait_mechanical_inspection_save('SUP003',repeat('a',64),
  '11111111-1111-4111-8111-111111111111',
  '22222222-2222-4222-8222-222222222222',0,p);
 IF r2->>'revision'<>'1' OR r2->>'replayed'<>'true' THEN
  RAISE EXCEPTION 'retry failed %',r2;END IF;
 BEGIN
  PERFORM public.zukait_mechanical_inspection_save('SUP003',repeat('a',64),
   '11111111-1111-4111-8111-111111111111',
   '55555555-5555-4555-8555-555555555555',0,p);
  RAISE EXCEPTION 'stale revision accepted';
 EXCEPTION WHEN SQLSTATE '40001' THEN NULL;
 END;
 BEGIN
  PERFORM public.zukait_mechanical_inspection_save('SUP003',repeat('a',64),
   '11111111-1111-4111-8111-111111111111',
   '22222222-2222-4222-8222-222222222222',0,
   jsonb_set(p,'{workDescription}','"Different"'));
  RAISE EXCEPTION 'duplicate ID with changed content accepted';
 EXCEPTION WHEN unique_violation THEN NULL;
 END;
 IF (select count(*) from zukait_mechanical.inspection_receipts)<>1 or
    (select count(*) from zukait_mechanical.inspection_audit)<>1 THEN
  RAISE EXCEPTION 'failed writes created history';END IF;
 UPDATE public.staff_sessions SET revoked_at=clock_timestamp() WHERE user_id='SUP003';
 blocked:=false;
 BEGIN
  PERFORM public.zukait_mechanical_inspection_read('SUP003',repeat('a',64),
   '11111111-1111-4111-8111-111111111111');
 EXCEPTION WHEN SQLSTATE 'P0001' THEN blocked:=true;
 END;
 IF NOT blocked THEN RAISE EXCEPTION 'revoked read accepted';END IF;
 UPDATE public.staff_sessions SET revoked_at=null WHERE user_id='SUP003';
 UPDATE public.staff_credentials SET role='Employee' WHERE user_id='SUP003';
 blocked:=false;
 BEGIN
  PERFORM public.zukait_mechanical_inspection_save('SUP003',repeat('a',64),
   '11111111-1111-4111-8111-111111111111',
   '66666666-6666-4666-8666-666666666666',1,p);
 EXCEPTION WHEN SQLSTATE 'P0001' THEN blocked:=true;
 END;
 IF NOT blocked THEN RAISE EXCEPTION 'role downgrade accepted';END IF;
 UPDATE public.staff_credentials SET role='Mechanical Supervisor' WHERE user_id='SUP003';
 r:=public.zukait_mechanical_inspection_save('MAN001',repeat('b',64),
  '11111111-1111-4111-8111-111111111111',
  '77777777-7777-4777-8777-777777777777',1,p);
 IF r->>'revision'<>'2' THEN RAISE EXCEPTION 'manager save failed';END IF;
 IF (select count(*) from zukait_mechanical.inspection_receipts)<>2 or
    (select count(*) from zukait_mechanical.inspection_audit)<>2 THEN
  RAISE EXCEPTION 'audit count incorrect';END IF;
END $test$;`;
run(probe);
console.log('PASS deployable V377 migration isolated authorization, read, atomic save, CAS, idempotency, audit');
