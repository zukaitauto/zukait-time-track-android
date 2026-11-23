-- V377 isolated PostgreSQL 17 regression. Runs against v377_inspection_test ONLY.
-- All workshop edits are synthetic and rolled back.
BEGIN;
DO $linked$
DECLARE denied boolean; before_receipts bigint; before_audit bigint; payload jsonb; checks jsonb;
BEGIN
 SELECT count(*) INTO before_receipts FROM zukait_mechanical.inspection_receipts;
 SELECT count(*) INTO before_audit FROM zukait_mechanical.inspection_audit;
 SELECT jsonb_object_agg(key,jsonb_build_object('status','NOT_CHECKED')) INTO checks
 FROM unnest(ARRAY['lights','wipers','powerWindows','centralLocking','mirrors','horn','dashboardWarning','airConditioning']) key;
 payload:=jsonb_build_object('jobType','CASH',
 'vehicle',jsonb_build_object('registration','TEST-A','make','Toyota','model','Camry',
 'year','2022','customer','Test','contact','90000000'),
 'damageMarks','[]'::jsonb,'functions',checks,'workDescription','QA-only test');
 -- Explicitly allowed initial Cash job.
 PERFORM public.zukait_mechanical_inspection_read('SUP003',repeat('a',64),
  '11111111-1111-4111-8111-111111111111');
 -- A post-registration change to Insurance must invalidate read AND write.
 UPDATE public.workshop_state SET data=jsonb_set(data,'{jobs,0,jobType}','"INSURANCE"'::jsonb)
 WHERE id='main';
 denied:=false;
 BEGIN
  PERFORM public.zukait_mechanical_inspection_read('SUP003',repeat('a',64),
   '11111111-1111-4111-8111-111111111111');
 EXCEPTION WHEN OTHERS THEN
  IF SQLSTATE='22023' AND SQLERRM='mechanical_job_type_not_allowed' THEN denied:=true; ELSE RAISE; END IF;
 END;
 IF NOT denied THEN RAISE EXCEPTION 'Insurance-linked inspection READ allowed'; END IF;
 denied:=false;
 BEGIN
  PERFORM public.zukait_mechanical_inspection_save('SUP003',repeat('a',64),
   '11111111-1111-4111-8111-111111111111','aaaaaaaa-cccc-4aaa-8aaa-aaaaaaaaaaaa',0,payload);
 EXCEPTION WHEN OTHERS THEN
  IF SQLSTATE='22023' AND SQLERRM='mechanical_job_type_not_allowed' THEN denied:=true; ELSE RAISE; END IF;
 END;
 IF NOT denied THEN RAISE EXCEPTION 'Insurance-linked inspection SAVE allowed'; END IF;
 -- Missing job type must fail closed.
 UPDATE public.workshop_state SET data=jsonb_set(data,'{jobs,0}','{"no":"MJC001"}'::jsonb)
 WHERE id='main';
 denied:=false;
 BEGIN
  PERFORM public.zukait_mechanical_inspection_read('SUP003',repeat('a',64),
   '11111111-1111-4111-8111-111111111111');
 EXCEPTION WHEN OTHERS THEN
  IF SQLSTATE='22023' AND SQLERRM='mechanical_job_type_not_allowed' THEN denied:=true; ELSE RAISE; END IF;
 END;
 IF NOT denied THEN RAISE EXCEPTION 'missing linked Job Card type allowed'; END IF;
 -- Duplicate identities must not permit one Cash/Credit row to mask another.
 UPDATE public.workshop_state SET data=jsonb_set(data,'{jobs,0}','{"no":"MJC001","jobType":"CASH"}'::jsonb)
 WHERE id='main';
 UPDATE public.workshop_state SET data=jsonb_set(data,'{jobs}',data->'jobs'||'{"no":"MJC001","jobType":"CASH"}'::jsonb)
 WHERE id='main';
 denied:=false;
 BEGIN
  PERFORM public.zukait_mechanical_inspection_read('SUP003',repeat('a',64),
   '11111111-1111-4111-8111-111111111111');
 EXCEPTION WHEN OTHERS THEN
  IF SQLSTATE='22023' AND SQLERRM='mechanical_job_type_not_allowed' THEN denied:=true; ELSE RAISE; END IF;
 END;
 IF NOT denied THEN RAISE EXCEPTION 'duplicate linked Job Card identities accepted'; END IF;
 IF (SELECT count(*) FROM zukait_mechanical.inspection_receipts)<>before_receipts OR
    (SELECT count(*) FROM zukait_mechanical.inspection_audit)<>before_audit THEN
    RAISE EXCEPTION 'rejected inspection mutated receipt/audit'; END IF;
END
$linked$;
ROLLBACK;
SELECT 'PASS_V377_LINKED_INSPECTION_TYPE_GUARD' AS status;
