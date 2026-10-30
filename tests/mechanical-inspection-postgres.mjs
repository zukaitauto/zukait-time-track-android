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

const saveDraft=fs.readFileSync('experiments/v377-mechanical-inspection-save-draft.sql','utf8');
const saveProbe=`
INSERT INTO public.staff_credentials(user_id) VALUES ('SUP003');
INSERT INTO zukait_mechanical.checklists(id) VALUES ('11111111-1111-4111-8111-111111111111');
DO $test$
DECLARE
  payload jsonb := '{"jobType":"CASH","vehicle":{"registration":"1234 AB"},"damageMarks":[],"functions":{},"workDescription":"Inspection"}'::jsonb;
  first_result jsonb;
  retry_result jsonb;
  next_result jsonb;
BEGIN
 first_result := zukait_mechanical.save_inspection_draft('11111111-1111-4111-8111-111111111111','22222222-2222-4222-8222-222222222222','SUP003',0,payload);
 IF first_result->>'revision' <> '1' OR first_result->>'replayed' <> 'false' THEN
  RAISE EXCEPTION 'initial save failed: %',first_result;
 END IF;
 retry_result := zukait_mechanical.save_inspection_draft('11111111-1111-4111-8111-111111111111','22222222-2222-4222-8222-222222222222','SUP003',0,payload);
 IF retry_result->>'revision' <> '1' OR retry_result->>'replayed' <> 'true' THEN
  RAISE EXCEPTION 'idempotent retry failed: %',retry_result;
 END IF;
 BEGIN
  PERFORM zukait_mechanical.save_inspection_draft('11111111-1111-4111-8111-111111111111','33333333-3333-4333-8333-333333333333','SUP003',0,payload);
  RAISE EXCEPTION 'stale revision incorrectly accepted';
 EXCEPTION WHEN SQLSTATE '40001' THEN NULL;
 END;
 BEGIN
  PERFORM zukait_mechanical.save_inspection_draft('11111111-1111-4111-8111-111111111111','22222222-2222-4222-8222-222222222222','SUP003',0,jsonb_set(payload,'{workDescription}','"Changed"'));
  RAISE EXCEPTION 'conflicting request incorrectly accepted';
 EXCEPTION WHEN unique_violation THEN NULL;
 END;
 -- Failed writes must not create receipts or audit records.
 IF (SELECT count(*) FROM zukait_mechanical.inspection_receipts) <> 1
    OR (SELECT count(*) FROM zukait_mechanical.inspection_audit) <> 1
 THEN RAISE EXCEPTION 'failed writes left audit or receipt rows'; END IF;
 BEGIN
  UPDATE zukait_mechanical.inspection_receipts SET fingerprint=repeat('a',64)
  WHERE request_id='22222222-2222-4222-8222-222222222222';
  RAISE EXCEPTION 'immutable receipt was modified';
 EXCEPTION WHEN SQLSTATE '55000' THEN NULL;
 END;
 BEGIN
  DELETE FROM zukait_mechanical.inspection_audit
  WHERE request_id='22222222-2222-4222-8222-222222222222';
  RAISE EXCEPTION 'immutable audit was deleted';
 EXCEPTION WHEN SQLSTATE '55000' THEN NULL;
 END;
 next_result := zukait_mechanical.save_inspection_draft('11111111-1111-4111-8111-111111111111','44444444-4444-4444-8444-444444444444','SUP003',1,payload);
 IF next_result->>'revision' <> '2' THEN RAISE EXCEPTION 'revision advance failed'; END IF;
 IF (SELECT count(*) FROM zukait_mechanical.inspection_receipts) <> 2
    OR (SELECT count(*) FROM zukait_mechanical.inspection_audit) <> 2
    OR (SELECT revision FROM zukait_mechanical.inspection_details WHERE checklist_id='11111111-1111-4111-8111-111111111111') <> 2
 THEN RAISE EXCEPTION 'receipt/audit/revision mismatch'; END IF;
END;
$test$;
`;
execFileSync('psql',['-X','-v','ON_ERROR_STOP=1','-U','postgres','-d','postgres','-At'],{input:saveDraft+saveProbe,encoding:'utf8'});
console.log('PASS isolated Mechanical inspection atomic save, replay, conflict and audit');

