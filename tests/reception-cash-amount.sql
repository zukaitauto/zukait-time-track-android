-- Disposable PostgreSQL fixture only; caller rolls back every row.
set local role service_role;
do $$
declare cmd jsonb; r jsonb; before_data jsonb; after_data jsonb; snapshot public.workshop_state; candidate jsonb; edited_job jsonb; amount_value text;
begin
 cmd:=jsonb_build_object('operation','CREATE_DIRECT_JOB','request_id',gen_random_uuid(),'job_type','CASH','job_card','QA-AMOUNT-CASH','details',jsonb_build_object('make','Toyota','model','Camry','year','2023'),'received_confirmed',true,'reason','Optional amount fixture','cash_amount','12.345');
 r:=zukait_reception_command('QA-RC',cmd);
 select data into before_data from workshop_state where id='main';
 assert (select j->>'amount' from jsonb_array_elements(before_data->'jobs') j where j->>'no'='QA-AMOUNT-CASH')='12.345';
 assert (zukait_reception_command('QA-RC',cmd)->>'duplicate')::boolean;
 select data into after_data from workshop_state where id='main';assert before_data=after_data;
 begin perform zukait_reception_command('QA-RC',cmd||'{"cash_amount":"13"}');raise exception 'changed retry accepted';exception when others then assert sqlerrm='reception_request_conflict';end;
 foreach amount_value in array array['','0','1000000','0.001'] loop
  perform zukait_reception_command('QA-RC',cmd||jsonb_build_object('request_id',gen_random_uuid(),'job_card','QA-AMT-'||md5(amount_value),'cash_amount',amount_value));
 end loop;
 foreach amount_value in array array['-1','1e3','0.0001','1000001','bad'] loop
  begin perform zukait_reception_command('QA-RC',cmd||jsonb_build_object('request_id',gen_random_uuid(),'job_card','QA-BAD-'||md5(amount_value),'cash_amount',amount_value));raise exception 'invalid amount accepted';exception when others then assert sqlerrm='reception_invalid_amount';end;
 end loop;
 assert not exists(select 1 from workshop_receptions where job_card like 'QA-BAD-%');
 perform zukait_reception_command('QA-RC',cmd||jsonb_build_object('request_id',gen_random_uuid(),'job_card','QA-AMOUNT-CREDIT','job_type','CREDIT','credit_account','QA Fleet','cash_amount','88.125'));
 perform zukait_reception_command('QA-MGR',cmd||jsonb_build_object('request_id',gen_random_uuid(),'job_card','QA-AMOUNT-INSURANCE','job_type','INSURANCE','insurance_id',1,'approval_confirmed',true,'reference','QA claim','evidence','QA issued approval','approval_date',current_date::text,'cash_amount','99.999'));
 select * into snapshot from workshop_state where id='main';
 assert (select j->>'amount' from jsonb_array_elements(snapshot.data->'jobs') j where j->>'no'='QA-AMOUNT-CREDIT')='88.125';
 assert (select j->>'amount' from jsonb_array_elements(snapshot.data->'jobs') j where j->>'no'='QA-AMOUNT-INSURANCE')='99.999';
 candidate:=snapshot.data;
 select x into edited_job from jsonb_array_elements(candidate->'jobs') x where x->>'no'='QA-AMOUNT-CASH';
 edited_job:=edited_job||'{"model":"Corolla","vehicle":"Toyota Corolla","amount":50.125,"editRevision":1}'::jsonb;
 candidate:=jsonb_set(candidate,'{jobs}',(select jsonb_agg(case when x->>'no'='QA-AMOUNT-CASH' then edited_job else x end) from jsonb_array_elements(candidate->'jobs') x));
 begin perform zukait_manager_full_job_edit(snapshot.revision,candidate,'QA-SUP','QA-AMOUNT-CASH','Manager correction','[]');raise exception 'Supervisor full edit accepted';exception when others then assert sqlerrm='reception_manager_required';end;
 r:=zukait_manager_full_job_edit(snapshot.revision,candidate,'QA-MGR','QA-AMOUNT-CASH','Correct model and agreed amount','[]');assert (r->>'ok')::boolean;
 assert r->'job'->>'model'='Corolla';assert r->'job'->>'amount'='50.125';
 assert (select details->>'model' from workshop_receptions where job_card='QA-AMOUNT-CASH')='Corolla';
 assert exists(select 1 from workshop_reception_audit where rc_no=r->'job'->>'receptionNo' and operation='EDIT' and reason='Correct model and agreed amount');
 assert zukait_manager_full_job_edit(snapshot.revision,candidate,'QA-MGR','QA-AMOUNT-CASH','Stale edit','[]')->>'code'='conflict';
 select * into snapshot from workshop_state where id='main';candidate:=snapshot.data;
 select x into edited_job from jsonb_array_elements(candidate->'jobs') x where x->>'no'='QA-AMOUNT-CASH';
 edited_job:=edited_job||'{"jobType":"Insurance","insuranceCompany":"Unknown insurer"}'::jsonb;
 candidate:=jsonb_set(candidate,'{jobs}',(select jsonb_agg(case when x->>'no'='QA-AMOUNT-CASH' then edited_job else x end) from jsonb_array_elements(candidate->'jobs') x));
 begin perform zukait_manager_full_job_edit(snapshot.revision,candidate,'QA-MGR','QA-AMOUNT-CASH','Invalid insurer','[]');raise exception 'Unknown insurer accepted';exception when others then assert sqlerrm='reception_insurance_required';end;
 assert (select data=snapshot.data from workshop_state where id='main'),'Failed full edit was not atomic';
end $$;
