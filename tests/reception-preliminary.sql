-- Run migration and these assertions inside BEGIN / ROLLBACK.
-- Fixture uses a negative sequence value, never nextval(RC sequence).
do $$
declare
  mgr text; sup text; emp text; ins bigint; rc text:='RC-QA-PARTS-'||gen_random_uuid();
  state_before jsonb; rev_before bigint; parts_before bigint; events_before bigint;
  cmd jsonb; item jsonb; result jsonb; initial_seq bigint; initial_called boolean;
begin
  select user_id into mgr from staff_credentials where role='Manager' and active limit 1;
  select user_id into sup from staff_credentials where role='Supervisor' and active limit 1;
  select user_id into emp from staff_credentials where role='Employee' and active and not exists(select 1 from workshop_reception_access a where a.user_id=staff_credentials.user_id and a.active) limit 1;
  select id into ins from workshop_insurance_companies where active limit 1;
  if mgr is null or sup is null or emp is null then raise exception 'test actors unavailable'; end if;
  select data,revision into state_before,rev_before from workshop_state where id='main';
  select count(*) into parts_before from workshop_v2_spare_part_state;
  select count(*) into events_before from workshop_v2_events;
  select last_value,is_called into initial_seq,initial_called from workshop_reception_no_seq;
  if has_table_privilege('anon','workshop_reception_preliminary_parts','select') or has_table_privilege('authenticated','workshop_reception_preliminary_parts','update') or has_table_privilege('service_role','workshop_reception_preliminary_parts','delete') then raise exception 'invalid parts grants'; end if;
  if has_function_privilege('anon','zukait_reception_command(text,jsonb)','execute') or has_function_privilege('authenticated','zukait_reception_phase1_command(text,jsonb)','execute') then raise exception 'exposed RPC'; end if;
  insert into workshop_receptions(rc_no,sequence_no,insurance_id,details,created_by,updated_by) values(rc,-9223372036854775807,ins,'{"make":"Toyota","model":"Camry"}',mgr,mgr);
  item:=jsonb_build_object('id',gen_random_uuid(),'name',' Front   bumper ','part_no',' X100 ','qty',2);
  cmd:=jsonb_build_object('operation','SAVE_PARTS','request_id',gen_random_uuid(),'rc_no',rc,'expected_revision',1,'items',jsonb_build_array(item),'reason','Prepare surveyor quotation');
  begin perform zukait_reception_command(emp,cmd);raise exception 'employee write accepted'; exception when others then if sqlerrm<>'reception_preliminary_forbidden' then raise; end if; end;
  insert into workshop_reception_access(user_id,granted_by) values(emp,mgr) on conflict(user_id) do update set active=true;
  result:=zukait_reception_command(emp,jsonb_build_object('operation','GET','rc_no',rc));
  if (result->'preliminary_parts'->>'can_edit')::boolean then raise exception 'reception staff can edit parts'; end if;
  begin perform zukait_reception_command(emp,cmd);raise exception 'designated write accepted'; exception when others then if sqlerrm<>'reception_preliminary_forbidden' then raise; end if; end;
  result:=zukait_reception_command(sup,cmd);
  if result->'record'->>'revision'<>'2' or result->'record'->>'approval_status'<>'WAITING' or result->'record'->>'location'<>'VIW' or result->'record'->>'job_card' is not null then raise exception 'unexpected status'; end if;
  if result->'preliminary_parts'->'items'->0->>'name'<>'Front bumper' then raise exception 'normalization failed'; end if;
  if (zukait_reception_command(sup,cmd)->>'duplicate')::boolean is distinct from true then raise exception 'retry did not dedupe'; end if;
  begin perform zukait_reception_command(mgr,cmd);raise exception 'cross actor retry accepted'; exception when others then if sqlerrm<>'reception_request_conflict' then raise; end if; end;
  begin perform zukait_reception_command(sup,cmd||jsonb_build_object('reason','different'));raise exception 'conflicting retry accepted'; exception when others then if sqlerrm<>'reception_request_conflict' then raise; end if; end;
  cmd:=cmd||jsonb_build_object('request_id',gen_random_uuid());
  begin perform zukait_reception_command(mgr,cmd);raise exception 'stale write accepted'; exception when others then if sqlerrm<>'reception_stale_revision' then raise; end if; end;
  cmd:=cmd||'{"expected_revision":2}';
  begin perform zukait_reception_command(mgr,cmd||jsonb_build_object('items',jsonb_build_array(item,item)));raise exception 'duplicate IDs accepted'; exception when others then if sqlerrm<>'reception_duplicate_parts' then raise; end if; end;
  begin perform zukait_reception_command(mgr,cmd||jsonb_build_object('items',jsonb_build_array(item,item||jsonb_build_object('id',gen_random_uuid(),'name','front bumper','part_no','x100'))));raise exception 'duplicate names accepted'; exception when others then if sqlerrm<>'reception_duplicate_parts' then raise; end if; end;
  begin perform zukait_reception_command(mgr,cmd||jsonb_build_object('items',jsonb_build_array(item||'{"qty":0}')));raise exception 'zero qty accepted'; exception when others then if sqlerrm<>'reception_invalid_parts' then raise; end if; end;
  begin perform zukait_reception_command(mgr,cmd||jsonb_build_object('items',jsonb_build_array(item||'{"qty":1.5}')));raise exception 'fractional qty accepted'; exception when others then if sqlerrm<>'reception_invalid_parts' then raise; end if; end;
  begin perform zukait_reception_command(mgr,cmd||jsonb_build_object('items',jsonb_build_array(item||'{"purchaseAmount":10}')));raise exception 'purchase amount accepted'; exception when others then if sqlerrm<>'reception_invalid_parts' then raise; end if; end;
  begin perform zukait_reception_command(mgr,cmd||'{"reason":""}');raise exception 'blank reason accepted'; exception when others then if sqlerrm<>'reception_reason_required' then raise; end if; end;
  begin perform zukait_reception_command(mgr,cmd||'{"operation":null}');raise exception 'missing operation accepted'; exception when others then if sqlerrm<>'reception_invalid_operation' then raise; end if; end;
  result:=zukait_reception_command(mgr,cmd||'{"items":[]}');
  if result->'record'->>'revision'<>'3' then raise exception 'manager clear failed'; end if;
  if (select count(*) from workshop_reception_audit where rc_no=rc and operation='SAVE_PARTS')<>2 then raise exception 'audit mismatch'; end if;
  -- Approved cases remain physically VWC and accept preparatory items until JC linkage.
  update workshop_receptions set approval_status='APPROVED',location='VWC' where rc_no=rc;
  cmd:=cmd||jsonb_build_object('request_id',gen_random_uuid(),'expected_revision',3);
  result:=zukait_reception_command(mgr,cmd);
  if result->'record'->>'location'<>'VWC' then raise exception 'parts moved vehicle'; end if;
  update workshop_receptions set job_card='QA-NOT-OPERATIONAL' where rc_no=rc;
  cmd:=cmd||jsonb_build_object('request_id',gen_random_uuid(),'expected_revision',4);
  begin perform zukait_reception_command(mgr,cmd);raise exception 'linked list edit accepted'; exception when others then if sqlerrm<>'reception_preliminary_already_linked' then raise; end if; end;
  update workshop_receptions set job_card=null where rc_no=rc;
  perform zukait_reception_command(mgr,jsonb_build_object('operation','CLOSE','request_id',gen_random_uuid(),'rc_no',rc,'expected_revision',4,'outcome','CANCELLED','reason','Cancel test case'));
  cmd:=cmd||jsonb_build_object('expected_revision',5);
  begin perform zukait_reception_command(mgr,cmd);raise exception 'closed list edit accepted'; exception when others then if sqlerrm<>'reception_case_closed' then raise; end if; end;
  if (select data from workshop_state where id='main')<>state_before or (select revision from workshop_state where id='main')<>rev_before or (select count(*) from workshop_v2_spare_part_state)<>parts_before or (select count(*) from workshop_v2_events)<>events_before then raise exception 'operational data changed'; end if;
  if (select last_value from workshop_reception_no_seq)<>initial_seq or (select is_called from workshop_reception_no_seq)<>initial_called then raise exception 'RC sequence consumed'; end if;
  -- Actual service-role grants, not just a postgres execution of the function.
  execute 'set local role service_role';
  insert into workshop_receptions(rc_no,sequence_no,insurance_id,details,created_by,updated_by)
    values(rc||'-service',-9223372036854775806,ins,'{"make":"Toyota","model":"Camry"}',mgr,mgr);
  result:=zukait_reception_command(mgr,jsonb_build_object('operation','SAVE_PARTS','request_id',gen_random_uuid(),'rc_no',rc||'-service','expected_revision',1,'items',jsonb_build_array(item),'reason','Verify service role'));
  if result->'record'->>'revision'<>'2' then raise exception 'service role write failed'; end if;
  result:=zukait_reception_command(mgr,jsonb_build_object('operation','GET','rc_no',rc||'-service'));
  if (result->'preliminary_parts'->>'can_edit')::boolean is distinct from true then raise exception 'service role GET failed'; end if;
  execute 'reset role';
end $$;
