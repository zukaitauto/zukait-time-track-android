-- Isolated PostgreSQL 17 smoke. CI must run only on 127.0.0.1.
-- All data/DDL performed inside a transaction and rolled back.
BEGIN;
DO $roles$ DECLARE r text; BEGIN
 FOR r IN SELECT unnest(ARRAY['service_role','authenticated','anon']) LOOP
  IF NOT EXISTS(SELECT 1 FROM pg_roles WHERE rolname=r) THEN EXECUTE format('CREATE ROLE %I NOLOGIN',r); END IF;
 END LOOP;
END $roles$;
CREATE SCHEMA zukait_mechanical;
CREATE TABLE public.staff_credentials(user_id text primary key,role text not null,department text);
INSERT INTO public.staff_credentials VALUES ('MECH-EMP','Employee','Mechanical'),('BODY-EMP','Employee','Body');
\i supabase/migrations/20261031210000_mechanical_cash_credit_creation_guard.sql
DO $check$
DECLARE typ text;blocked boolean;fixture jsonb;
BEGIN
 FOREACH typ IN ARRAY ARRAY['Cash','CASH','Credit','CREDIT',' credit '] LOOP
   fixture:=jsonb_build_object('jobs',jsonb_build_array(jsonb_build_object('no','QA-JC','jobType',typ)),'assign','[]'::jsonb);
   PERFORM zukait_mechanical.assert_separate_job(fixture,'qa-jc','Mechanical');
 END LOOP;
 FOREACH typ IN ARRAY ARRAY['INSURANCE','Insurance','OTHER',''] LOOP
  blocked:=false;
  BEGIN
   fixture:=jsonb_build_object('jobs',jsonb_build_array(jsonb_build_object('no','QA-JC','jobType',typ)),'assign','[]'::jsonb);
   PERFORM zukait_mechanical.assert_separate_job(fixture,'QA-JC','Mechanical');
  EXCEPTION WHEN OTHERS THEN
   IF SQLSTATE='22023' AND SQLERRM='mechanical_job_type_not_allowed' THEN blocked:=true; ELSE RAISE; END IF;
  END;
  IF NOT blocked THEN RAISE EXCEPTION 'invalid jobType accepted: %',typ; END IF;
 END LOOP;
 blocked:=false;
 BEGIN
  PERFORM zukait_mechanical.assert_separate_job('{"jobs":[{"no":"QA-JC"}],"assign":[]}'::jsonb,'QA-JC','Mechanical');
 EXCEPTION WHEN OTHERS THEN
  IF SQLERRM='mechanical_job_type_not_allowed' THEN blocked:=true; ELSE RAISE; END IF;
 END;
 IF NOT blocked THEN RAISE EXCEPTION 'missing jobType accepted'; END IF;
 blocked:=false;
 BEGIN
  PERFORM zukait_mechanical.assert_separate_job('{"jobs":[{"no":"QA-JC","jobType":"CASH"},{"no":"QA-JC","jobType":"CASH"}],"assign":[]}'::jsonb,'QA-JC','Mechanical');
 EXCEPTION WHEN OTHERS THEN
  IF SQLERRM='mechanical_job_identity_conflict' THEN blocked:=true; ELSE RAISE; END IF;
 END;
 IF NOT blocked THEN RAISE EXCEPTION 'duplicate JC accepted'; END IF;
 blocked:=false;
 BEGIN
  PERFORM zukait_mechanical.assert_separate_job('{"jobs":[{"no":"QA-JC","jobType":"CASH"}],"assign":[{"job":"QA-JC","emp":"BODY-EMP","cancelled":false}]}'::jsonb,'QA-JC','Mechanical');
 EXCEPTION WHEN OTHERS THEN
  IF SQLERRM='mechanical_mixed_job_not_allowed' THEN blocked:=true; ELSE RAISE; END IF;
 END;
 IF NOT blocked THEN RAISE EXCEPTION 'non Mechanical employee accepted'; END IF;
 PERFORM zukait_mechanical.assert_separate_job('{"jobs":[{"no":"QA-JC","jobType":"CREDIT"}],"assign":[{"job":"QA-JC","emp":"MECH-EMP","cancelled":false}]}'::jsonb,'QA-JC','Mechanical');
END
$check$;
ROLLBACK;
SELECT 'PASS_MECHANICAL_MC_CREATE_CASH_CREDIT_SERVER_GUARD' AS outcome;
