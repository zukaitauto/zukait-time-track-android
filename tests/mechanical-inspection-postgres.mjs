// PostgreSQL 17 isolated schema execution; never connects to production.
import {execFileSync} from 'node:child_process';
import fs from 'node:fs';
import assert from 'node:assert/strict';
assert.equal(process.env.ZUKAIT_MECHANICAL_NATIVE,'1','isolated PostgreSQL opt-in required');
const setup=`
DO $roles$ DECLARE role_name text; BEGIN
 FOR role_name IN SELECT unnest(ARRAY['service_role','anon','authenticated']) LOOP
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname=role_name) THEN
   EXECUTE format('CREATE ROLE %I NOLOGIN',role_name);
  END IF;
 END LOOP;
END $roles$;
CREATE TABLE IF NOT EXISTS public.staff_credentials(user_id text primary key);
CREATE SCHEMA zukait_mechanical;
CREATE TABLE zukait_mechanical.checklists(id uuid primary key);
CREATE FUNCTION zukait_mechanical.append_only() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN RAISE EXCEPTION 'mechanical_append_only'; END $$;
`;
const sql=fs.readFileSync('experiments/v377-mechanical-inspection-details.sql','utf8');
const probe=`
SELECT count(*) FROM information_schema.tables WHERE table_schema='zukait_mechanical' AND table_name IN ('inspection_details','inspection_receipts','inspection_audit');
SELECT count(*) FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace WHERE n.nspname='zukait_mechanical' AND c.relname IN ('inspection_details','inspection_receipts','inspection_audit') AND c.relrowsecurity;
`;
const output=execFileSync('psql',['-X','-v','ON_ERROR_STOP=1','-U','postgres','-d','postgres','-At'],{input:setup+sql+probe,encoding:'utf8'});
const counts=output.split('\n').filter(x=>x.trim()==='3');
assert.ok(counts.length>=2,'all three tables must exist with RLS');
const restrictions=execFileSync('psql',['-X','-v','ON_ERROR_STOP=1','-U','postgres','-d','postgres','-At'],{input:`SELECT count(*) FROM information_schema.role_table_grants WHERE table_schema='zukait_mechanical' AND table_name IN ('inspection_details','inspection_receipts','inspection_audit') AND grantee IN ('anon','authenticated');\nSELECT count(*) FROM pg_trigger t JOIN pg_class c ON c.oid=t.tgrelid JOIN pg_namespace n ON n.oid=c.relnamespace WHERE n.nspname='zukait_mechanical' AND c.relname IN ('inspection_receipts','inspection_audit') AND NOT t.tgisinternal AND t.tgenabled='O';\n`,encoding:'utf8'}).trim().split('\n');
assert.deepEqual(restrictions,['0','2'],'client grants must be absent and audit triggers enabled');
console.log('PASS isolated PostgreSQL Mechanical inspection draft and RLS');
