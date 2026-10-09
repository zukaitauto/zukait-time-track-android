-- Run only inside the disposable PostgreSQL database's rollback transaction.
do $$
declare cmd_rc text; cmd jsonb; result jsonb; retry jsonb; rc text; rev bigint; snapshot jsonb; n bigint;
begin
 cmd:=jsonb_build_object('operation','CREATE_DIRECT_JOB','request_id',gen_random_uuid(),'job_type','CASH','job_card','QA-DIRECT-CASH','reason','QA direct cash intake','received_confirmed',true,
  'details',jsonb_build_object('make','Toyota','model','Corolla','customer','QA Cash Customer','contact','QA contact','registration','QA-CASH','remarks','Checklist observation only'));
 result:=zukait_reception_command('QA-RC',cmd); rc:=result->'record'->>'rc_no';
 assert result->'record'->>'job_card'='QA-DIRECT-CASH';
 assert result->'record'->>'approval_status'='WAITING';
 assert result->'record'->>'insurance_id' is null;
 retry:=zukait_reception_command('QA-RC',cmd); assert (retry->>'duplicate')::boolean;
 select count(*) into n from workshop_v2_events where entity_id='QA-DIRECT-CASH' and event_type='JOB_CREATED'; assert n=1;
 select data into snapshot from workshop_state where id='main';
 assert (select count(*) from jsonb_array_elements(snapshot->'jobs') j where j->>'no'='QA-DIRECT-CASH')=1;
 assert (select j->>'jobType' from jsonb_array_elements(snapshot->'jobs') j where j->>'no'='QA-DIRECT-CASH')='CASH';
 assert (select j->>'remarks' from jsonb_array_elements(snapshot->'jobs') j where j->>'no'='QA-DIRECT-CASH') is null;
 assert (zukait_reception_command('QA-RC',jsonb_build_object('operation','LIST'))->'rows') @> jsonb_build_array(jsonb_build_object('rc_no',rc));
 begin perform zukait_reception_command('QA-RC',cmd||jsonb_build_object('reason','Changed retry')); raise exception 'QA request conflict not enforced'; exception when others then assert sqlerrm='reception_request_conflict'; end;
 cmd:=cmd||jsonb_build_object('request_id',gen_random_uuid(),'job_type','CREDIT','job_card','QA-DIRECT-CREDIT');
 begin perform zukait_reception_command('QA-RC',cmd); raise exception 'QA missing account accepted'; exception when others then assert sqlerrm='reception_credit_account_required'; end;
 cmd:=cmd||jsonb_build_object('credit_account','QA-FLEET-ACCOUNT');
 result:=zukait_reception_command('QA-RC',cmd);
 select data into snapshot from workshop_state where id='main';
 assert (select j->>'creditAccount' from jsonb_array_elements(snapshot->'jobs') j where j->>'no'='QA-DIRECT-CREDIT')='QA-FLEET-ACCOUNT';
 assert (select j->>'jobType' from jsonb_array_elements(snapshot->'jobs') j where j->>'no'='QA-DIRECT-CREDIT')='CREDIT';
 begin perform zukait_reception_command('QA-RC',cmd||jsonb_build_object('request_id',gen_random_uuid(),'job_type','INSURANCE','job_card','QA-BYPASS')); raise exception 'QA insurance bypass accepted'; exception when others then assert sqlerrm='reception_invalid_job_type'; end;
 begin perform zukait_reception_command('QA-RC',cmd||jsonb_build_object('request_id',gen_random_uuid(),'received_confirmed',false)); raise exception 'QA physical receipt bypass accepted'; exception when others then assert sqlerrm='reception_received_confirmation_required'; end;
 begin perform zukait_reception_command('QA-RC',cmd||jsonb_build_object('request_id',gen_random_uuid(),'amount',100)); raise exception 'QA financial field accepted'; exception when others then assert sqlerrm='reception_invalid_fields'; end;
 begin perform zukait_reception_command('QA-EMP',cmd); raise exception 'QA employee direct access accepted'; exception when others then assert sqlerrm='reception_job_forbidden'; end;
 -- Existing issued insurance approval without making an artificial estimate.
 result:=zukait_reception_command('QA-RC',jsonb_build_object('operation','CREATE','request_id',gen_random_uuid(),'insurance_id',1,'details',jsonb_build_object('make','Toyota','model','Camry','registration','QA-EXTERNAL')));
 rc:=result->'record'->>'rc_no';cmd_rc:=rc;rev:=(result->'record'->>'revision')::bigint;
 cmd:=jsonb_build_object('operation','RECORD_EXTERNAL_APPROVAL','request_id',gen_random_uuid(),'rc_no',rc,'expected_revision',rev,'reference','QA-ISSUED-APPROVAL','approval_date',current_date,'evidence','QA approval letter reference','reason','Verified issued document');
 begin perform zukait_reception_command('QA-RC',cmd); raise exception 'QA receptionist self approval accepted'; exception when others then assert sqlerrm='reception_approval_forbidden'; end;
 result:=zukait_reception_command('QA-MGR',cmd);
 assert (zukait_reception_command('QA-RC',jsonb_build_object('operation','GET','rc_no',rc))->'external_approval'->>'valid')::boolean;
 cmd:=jsonb_build_object('operation','CREATE_EXTERNAL_JOB','request_id',gen_random_uuid(),'rc_no',rc,'expected_revision',(result->'record'->>'revision')::bigint,'job_card','QA-DIRECT-INSURANCE','reason','Create issued approved repair');
 result:=zukait_reception_command('QA-RC',cmd);
 assert result->'record'->>'job_card'='QA-DIRECT-INSURANCE';
 assert (zukait_reception_command('QA-RC',cmd)->>'duplicate')::boolean;
 select data into snapshot from workshop_state where id='main';
 assert zukait_reception_job_approval_valid('QA-DIRECT-INSURANCE',rc,snapshot);
 assert (select count(*) from workshop_reception_estimates where rc_no=cmd_rc)=0;
 assert (select count(*) from workshop_reception_part_transfers where rc_no=cmd_rc)=0;
 assert (select count(*) from workshop_reception_external_approvals where rc_no=cmd_rc)=1;
end $$;
