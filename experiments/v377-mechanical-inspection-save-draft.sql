-- V377 EXPERIMENT ONLY. Apply after v377-mechanical-inspection-details.sql
-- in a disposable PostgreSQL database. NOT a production migration.
-- Caller MUST be a trusted server that has revalidated session, Mechanical
-- permissions, checklist ownership and the full JS inspection contract.
-- Do not expose this function directly to client roles.
begin;
create or replace function zukait_mechanical.save_inspection_draft(
 p_checklist uuid, p_request uuid, p_actor text,
 p_expected bigint, p_inspection jsonb
) returns jsonb
language plpgsql security definer set search_path = pg_catalog
as $fn$
declare
 v_old zukait_mechanical.inspection_details%rowtype;
 v_receipt zukait_mechanical.inspection_receipts%rowtype;
 v_revision bigint;
 v_fingerprint text;
 v_before jsonb;
begin
 if p_checklist is null or p_request is null or p_actor is null
    or p_expected is null or p_expected < 0
    or p_inspection is null or jsonb_typeof(p_inspection) <> 'object'
    or p_inspection->>'jobType' not in ('CASH','CREDIT')
    or jsonb_typeof(p_inspection->'vehicle') is distinct from 'object'
    or jsonb_typeof(p_inspection->'damageMarks') is distinct from 'array'
    or jsonb_typeof(p_inspection->'functions') is distinct from 'object'
    or length(trim(coalesce(p_inspection->>'workDescription',''))) not between 1 and 2000
 then
  raise exception 'inspection_invalid' using errcode='22023';
 end if;
 -- Serialize all writers and retries for the same checklist.
 perform 1 from zukait_mechanical.checklists where id=p_checklist for update;
 if not found then
  raise exception 'inspection_checklist_not_found' using errcode='P0002';
 end if;
 v_fingerprint := encode(sha256(convert_to(
  jsonb_build_object('checklist',p_checklist,'actor',p_actor,
   'expected',p_expected,'inspection',p_inspection)::text,'UTF8')),'hex');
 select * into v_receipt from zukait_mechanical.inspection_receipts
 where request_id=p_request;
 if found then
  if v_receipt.checklist_id=p_checklist and v_receipt.actor_id=p_actor
     and v_receipt.expected_revision=p_expected
     and v_receipt.fingerprint=v_fingerprint then
   return jsonb_build_object('revision',v_receipt.result_revision,'replayed',true);
  end if;
  raise exception 'inspection_request_conflict' using errcode='23505';
 end if;
 select * into v_old from zukait_mechanical.inspection_details
 where checklist_id=p_checklist for update;
 v_revision := case when found then v_old.revision else 0 end;
 if v_revision <> p_expected then
  raise exception 'inspection_revision_conflict' using errcode='40001';
 end if;
 if v_revision > 0 then
  v_before := jsonb_build_object('revision',v_old.revision,
   'jobType',v_old.job_type,'vehicle',v_old.vehicle,
   'damageMarks',v_old.damage_marks,'functions',v_old.function_checks,
   'workDescription',v_old.work_description);
 end if;
 insert into zukait_mechanical.inspection_details
  (checklist_id,revision,job_type,vehicle,damage_marks,function_checks,
   work_description,created_by,updated_by)
 values (p_checklist,v_revision+1,p_inspection->>'jobType',
  p_inspection->'vehicle',p_inspection->'damageMarks',
  p_inspection->'functions',p_inspection->>'workDescription',p_actor,p_actor)
 on conflict (checklist_id) do update
 set revision=excluded.revision,job_type=excluded.job_type,
  vehicle=excluded.vehicle,damage_marks=excluded.damage_marks,
  function_checks=excluded.function_checks,
  work_description=excluded.work_description,
  updated_by=excluded.updated_by,updated_at=clock_timestamp();
 insert into zukait_mechanical.inspection_receipts
  (request_id,checklist_id,actor_id,fingerprint,expected_revision,result_revision)
 values (p_request,p_checklist,p_actor,v_fingerprint,p_expected,v_revision+1);
 insert into zukait_mechanical.inspection_audit
  (request_id,checklist_id,actor_id,before_value,after_value)
 values (p_request,p_checklist,p_actor,v_before,
  jsonb_build_object('revision',v_revision+1,'inspection',p_inspection));
 return jsonb_build_object('revision',v_revision+1,'replayed',false);
end;
$fn$;
revoke all on function zukait_mechanical.save_inspection_draft(uuid,uuid,text,bigint,jsonb)
 from public,anon,authenticated,service_role;
commit;
