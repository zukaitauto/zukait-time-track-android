-- Run only inside the disposable PostgreSQL database's rollback transaction.
set local role service_role;
do $$
declare credit_rc text; cmd_rc text; cmd jsonb; result jsonb; retry jsonb; rc text; rev bigint; snapshot jsonb; n bigint;
begin
 cmd:=jsonb_build_object('operation','CREATE_DIRECT_JOB','request_id',gen_random_uuid(),'job_type','CASH','job_card','QA-DIRECT-CASH','reason','QA direct cash intake','received_confirmed',true,
  'details',jsonb_build_object('make','Toyota','model','Corolla','year','2023','registration','QA-CASH','odometer','53845','odometer_unit','Miles','remarks','Checklist observation only'));
 select count(*) into n from workshop_receptions;
 result:=zukait_reception_command('QA-RC',cmd); rc:=null;
 assert (select count(*) from workshop_receptions)=n, 'Direct job inserted a Checklist';
 assert result->>'job_card'='QA-DIRECT-CASH';
 assert result->'job'->>'jobType'='CASH';
 assert result->'record' is null;
 retry:=zukait_reception_command('QA-RC',cmd); assert (retry->>'duplicate')::boolean;
 select count(*) into n from workshop_v2_events where entity_id='QA-DIRECT-CASH' and event_type='JOB_CREATED'; assert n=1;
 select data into snapshot from workshop_state where id='main';
 assert (select count(*) from jsonb_array_elements(snapshot->'jobs') j where j->>'no'='QA-DIRECT-CASH')=1;
 assert (select j->>'jobType' from jsonb_array_elements(snapshot->'jobs') j where j->>'no'='QA-DIRECT-CASH')='CASH', format('Cash Job Card type mismatch; actual=%s', (select j->>'jobType' from jsonb_array_elements(snapshot->'jobs') j where j->>'no'='QA-DIRECT-CASH'));
 assert (select j->>'intakeOdometer' from jsonb_array_elements(snapshot->'jobs') j where j->>'no'='QA-DIRECT-CASH')='53845';
 assert (select j->>'intakeOdometerUnit' from jsonb_array_elements(snapshot->'jobs') j where j->>'no'='QA-DIRECT-CASH')='Miles';
 assert (select j->>'remarks' from jsonb_array_elements(snapshot->'jobs') j where j->>'no'='QA-DIRECT-CASH') is null;
 -- Direct Job Cards retain an audit-only reception record, never a visible checklist row.
 assert not ((zukait_reception_command('QA-RC',jsonb_build_object('operation','LIST'))->'rows') @> jsonb_build_array(jsonb_build_object('rc_no',rc))), 'Direct Job Card was incorrectly shown as a checklist';
 assert exists(select 1 from workshop_direct_job_approvals where job_card='QA-DIRECT-CASH'), 'Direct Job Card audit missing';
 assert coalesce((result->'record'->'details'->>'customer'),'')='', 'Customer must be optional in direct Job Card';
 begin perform zukait_reception_command('QA-RC',cmd||jsonb_build_object('request_id',gen_random_uuid(),'job_card','QA-NO-YEAR','details',jsonb_build_object('make','Toyota','model','Corolla')));raise exception 'QA missing model year accepted';exception when others then assert sqlerrm='reception_vehicle_required';end;
 begin perform zukait_reception_command('QA-RC',cmd||jsonb_build_object('reason','Changed retry')); raise exception 'QA request conflict not enforced'; exception when others then assert sqlerrm='reception_request_conflict'; end;
 cmd:=cmd||jsonb_build_object('request_id',gen_random_uuid(),'job_type','CREDIT','job_card','QA-DIRECT-CREDIT');
 begin perform zukait_reception_command('QA-RC',cmd); raise exception 'QA missing account accepted'; exception when others then assert sqlerrm='reception_credit_account_required'; end;
 cmd:=cmd||jsonb_build_object('credit_account','QA-FLEET-ACCOUNT');
 result:=zukait_reception_command('QA-RC',cmd);credit_rc:=result->'record'->>'rc_no';
 select data into snapshot from workshop_state where id='main';
 assert (select j->>'creditAccount' from jsonb_array_elements(snapshot->'jobs') j where j->>'no'='QA-DIRECT-CREDIT')='QA-FLEET-ACCOUNT';
 assert (select j->>'jobType' from jsonb_array_elements(snapshot->'jobs') j where j->>'no'='QA-DIRECT-CREDIT')='CREDIT';
 -- Direct Insurance must require evidence and approved-vehicle confirmation, then create atomically.
 cmd:=jsonb_build_object('operation','CREATE_DIRECT_JOB','request_id',gen_random_uuid(),
  'job_type','INSURANCE','job_card','QA-DIRECT-APPROVED-INSURANCE','reason','Already approved insurance repair',
  'received_confirmed',true,'insurance_id',1,'reference','QA-LPO-20261011',
  'approval_date',(current_date)::text,'evidence','Insurance approval verified at reception',
  'approval_confirmed',true,
  'details',jsonb_build_object('make','Nissan','model','Altima','year','2014',
    'registration','7561.BH','customer','QA Insured Customer','contact','QA contact'));
 result:=zukait_reception_command('QA-RC',cmd);rc:=result->'record'->>'rc_no';
 assert result->>'job_card'='QA-DIRECT-APPROVED-INSURANCE';
 assert result->'job'->>'jobType'='INSURANCE';
 assert result->'record' is null;
 assert (zukait_reception_command('QA-RC',cmd)->>'duplicate')::boolean;
 select data into snapshot from workshop_state where id='main';
 assert (select count(*) from jsonb_array_elements(snapshot->'jobs') j where j->>'no'='QA-DIRECT-APPROVED-INSURANCE')=1;
 assert (select j->>'jobType' from jsonb_array_elements(snapshot->'jobs') j where j->>'no'='QA-DIRECT-APPROVED-INSURANCE')='INSURANCE';
 assert (select j->>'reg' from jsonb_array_elements(snapshot->'jobs') j where j->>'no'='QA-DIRECT-APPROVED-INSURANCE')='7561.BH';
 assert zukait_reception_job_approval_valid('QA-DIRECT-APPROVED-INSURANCE',rc,snapshot);
 assert (select count(*) from workshop_direct_job_approvals where job_card='QA-DIRECT-APPROVED-INSURANCE' and job_type='INSURANCE')=1;
 assert (select count(*) from workshop_reception_estimates where rc_no=rc)=0;
 begin perform zukait_reception_command('QA-RC',cmd||jsonb_build_object('request_id',gen_random_uuid(),'job_card','QA-INS-NO-APPROVAL','approval_confirmed',false));raise exception 'QA unapproved job accepted';exception when others then assert sqlerrm='reception_approval_confirmation_required';end;
 begin perform zukait_reception_command('QA-RC',cmd||jsonb_build_object('request_id',gen_random_uuid(),'job_card','QA-INS-NO-EVIDENCE','evidence',''));raise exception 'QA missing evidence accepted';exception when others then assert sqlerrm='reception_external_evidence_required';end;
 begin perform zukait_reception_command('QA-RC',cmd||jsonb_build_object('request_id',gen_random_uuid(),'job_card','QA-DIRECT-APPROVED-INSURANCE'));raise exception 'QA duplicate Job Card accepted';exception when others then raise notice 'QA duplicate rejection actual: %',sqlerrm; assert sqlerrm='reception_job_number_exists';end;
 begin perform zukait_reception_command('QA-RC',cmd||jsonb_build_object('request_id',gen_random_uuid(),'received_confirmed',false));raise exception 'QA physical receipt bypass accepted';exception when others then assert sqlerrm='reception_received_confirmation_required';end;
 -- Continue Cash/Credit backwards-compatibility test.
 cmd:=jsonb_build_object('operation','CREATE_DIRECT_JOB','request_id',gen_random_uuid(),'job_type','CREDIT','job_card','QA-EXTRA-CREDIT','reason','QA credit','received_confirmed',true,
  'details',jsonb_build_object('make','Toyota','model','Camry','year','2022'),'credit_account','QA-FLEET-ACCOUNT');
 begin perform zukait_reception_command('QA-RC',cmd||jsonb_build_object('request_id',gen_random_uuid(),'received_confirmed',false)); raise exception 'QA physical receipt bypass accepted'; exception when others then assert sqlerrm='reception_received_confirmation_required'; end;
 begin perform zukait_reception_command('QA-RC',cmd||jsonb_build_object('request_id',gen_random_uuid(),'amount',100)); raise exception 'QA financial field accepted'; exception when others then assert sqlerrm='reception_invalid_fields'; end;
 begin perform zukait_reception_command('QA-EMP',cmd); raise exception 'QA employee direct access accepted'; exception when others then assert sqlerrm='reception_job_forbidden'; end;
 -- Stale state cannot erase the authoritative credit reference or relabel its job.
 snapshot:=jsonb_set(snapshot,'{jobs}',(select jsonb_agg(case when j->>'no'='QA-DIRECT-CREDIT' then j||'{"creditAccount":"QA-STALE","jobType":"CASH"}'::jsonb else j end) from jsonb_array_elements(snapshot->'jobs') j));
 update workshop_state set data=snapshot where id='main';
 select data into snapshot from workshop_state where id='main';
 assert (select j->>'creditAccount' from jsonb_array_elements(snapshot->'jobs') j where j->>'no'='QA-DIRECT-CREDIT')='QA-FLEET-ACCOUNT';
 assert (select j->>'jobType' from jsonb_array_elements(snapshot->'jobs') j where j->>'no'='QA-DIRECT-CREDIT')='CREDIT';
 assert not has_table_privilege('anon','public.workshop_reception_external_approvals','SELECT');
 assert not has_table_privilege('authenticated','public.workshop_reception_external_approvals','INSERT');
 assert not has_function_privilege('anon','public.zukait_reception_command(text,jsonb)','EXECUTE');
 assert not has_function_privilege('authenticated','public.zukait_reception_external_approval_valid(public.workshop_receptions)','EXECUTE');
 -- Existing issued insurance approval without making an artificial estimate.
 result:=zukait_reception_command('QA-RC',jsonb_build_object('operation','CREATE','request_id',gen_random_uuid(),'insurance_id',1,'details',jsonb_build_object('make','Toyota','model','Camry','registration','QA-EXTERNAL','year','2023','claim','QA-CLAIM-2026','odometer','53699','odometer_unit','KM')));
 rc:=result->'record'->>'rc_no';cmd_rc:=rc;rev:=(result->'record'->>'revision')::bigint;
 cmd:=jsonb_build_object('operation','RECORD_EXTERNAL_APPROVAL','request_id',gen_random_uuid(),'rc_no',rc,'expected_revision',rev,'reference','QA-ISSUED-APPROVAL','approval_date',current_date,'evidence','QA approval letter reference','reason','Verified issued document');
 begin perform zukait_reception_command('QA-RC',cmd); raise exception 'QA receptionist self approval accepted'; exception when others then assert sqlerrm='reception_approval_forbidden'; end;
 result:=zukait_reception_command('QA-MGR',cmd);
 assert (zukait_reception_command('QA-RC',jsonb_build_object('operation','GET','rc_no',rc))->'external_approval'->>'valid')::boolean;
 cmd:=jsonb_build_object('operation','CREATE_EXTERNAL_JOB','request_id',gen_random_uuid(),'rc_no',rc,'expected_revision',(result->'record'->>'revision')::bigint,'job_card','QA-DIRECT-INSURANCE','reason','Create issued approved repair','job_intake_odometer','53845','job_intake_unit','KM',
  'identity_updates',jsonb_build_object('model','Corolla','registration','QA-EXTERNAL-UPDATED'),
  'approval_confirmed',true,'reference','QA-UPDATED-CLAIM-APPROVAL',
  'approval_date',current_date,'evidence','Reconfirmed insurer approval after identity correction');
 begin perform zukait_reception_command('QA-RC',cmd||jsonb_build_object('request_id',gen_random_uuid())); raise exception 'QA Receptionist identity correction accepted';
  exception when others then assert sqlerrm='reception_manager_required'; end;
 -- A changed insured vehicle identity cannot be created without renewed evidence.
 begin
  perform zukait_reception_command('QA-MGR',cmd||jsonb_build_object('request_id',gen_random_uuid(),'approval_confirmed',false));
  raise exception 'QA identity correction without approval accepted';
 exception when others then assert sqlerrm='reception_approval_confirmation_required'; end;
 assert (select details->>'model' from workshop_receptions where rc_no=rc)='Camry',
  'Failed correction must not update original vehicle identity';
 assert (select details->>'odometer' from workshop_receptions where rc_no=rc)='53699',
  'Failed correction must not update original odometer';
 assert (select count(*) from workshop_reception_external_approvals where rc_no=rc)=1,
  'Failed correction must not append approval history';
 result:=zukait_reception_command('QA-MGR',cmd);
 assert result->'record'->>'job_card'='QA-DIRECT-INSURANCE';
 assert result->'record'->'details'->>'model'='Corolla';
 assert result->'record'->'details'->>'registration'='QA-EXTERNAL-UPDATED';
 assert (zukait_reception_command('QA-MGR',cmd)->>'duplicate')::boolean;
 -- Two devices attempting the same checklist must not create a second Job Card.
 begin
  perform zukait_reception_command('QA-MGR',cmd||jsonb_build_object('request_id',gen_random_uuid(),'job_card','QA-SECOND-LINKED'));
  raise exception 'QA duplicate linked Job Card accepted';
 exception when others then
  assert sqlerrm='reception_stale_revision',format('Unexpected linked duplicate guard: %s',sqlerrm);
 end;
 select count(*) into n from workshop_v2_events where entity_id='QA-SECOND-LINKED' and event_type='JOB_CREATED';
 assert n=0,'Second linked Job Card must not publish an event';
 assert (select count(*) from workshop_reception_audit where rc_no=rc and operation='CREATE_EXTERNAL_JOB')=1,
  'Rejected competing Job Card must not append another creation audit';
 assert (select count(*) from workshop_reception_commands where command->>'job_card'='QA-SECOND-LINKED')=0,
  'Rejected competing Job Card must not cache a successful command';
 assert (select job_card from workshop_receptions where rc_no=rc)='QA-DIRECT-INSURANCE',
  'Original Job Card link must remain unchanged after rejected competing request';
 select data into snapshot from workshop_state where id='main';
 assert (select count(*) from jsonb_array_elements(snapshot->'jobs') j where j->>'no'='QA-SECOND-LINKED')=0,
  'Rejected competing request must not alter workshop job state';
 assert zukait_reception_job_approval_valid('QA-DIRECT-INSURANCE',rc,snapshot);
 assert (select details->>'odometer' from workshop_receptions where rc_no=rc)='53699', 'Original checklist reading must be immutable';
 assert (select j->>'jobIntakeOdometer' from jsonb_array_elements(snapshot->'jobs') j where j->>'no'='QA-DIRECT-INSURANCE')='53845', 'Independent Job Card reading was not stored';
 assert (select j->>'jobIntakeUnit' from jsonb_array_elements(snapshot->'jobs') j where j->>'no'='QA-DIRECT-INSURANCE')='KM', 'Independent Job Card unit was not stored';
 assert (select count(*) from workshop_reception_estimates where rc_no=cmd_rc)=0;
 assert (select count(*) from workshop_reception_part_transfers where rc_no=cmd_rc)=0;
 assert (select count(*) from workshop_reception_external_approvals where rc_no=cmd_rc)=2, 'Approval revision history must be retained';
end $$;
