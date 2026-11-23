-- Apply all pending Phase 2 migrations in one transaction, run, then ROLLBACK.
do $$
declare
 original jsonb; rev bigint; mgr text; ins bigint; rc text:='RC-QA-GUARD-'||gen_random_uuid();
 no text:='JC-QA-GUARD-'||gen_random_uuid(); eno text:='Zi-QA-GUARD-'||gen_random_uuid();
 eid text:=gen_random_uuid()::text; qid uuid:=gen_random_uuid(); quote jsonb;
 identity jsonb; j jsonb; payload jsonb; events bigint; parts bigint; rc_seq bigint; est_seq bigint; pl_seq bigint;
begin
 select data,revision into original,rev from workshop_state where id='main' for update;
 select user_id into mgr from staff_credentials where active and role='Manager' limit 1;
 select id into ins from workshop_insurance_companies where active limit 1;
 select count(*) into events from workshop_v2_events;
 select count(*) into parts from workshop_v2_spare_part_state;
 select last_value into rc_seq from workshop_reception_no_seq;
 select last_value into est_seq from workshop_v2_estimate_no_seq;
 select last_value into pl_seq from workshop_v2_spare_part_list_no_seq;
 if has_function_privilege('anon','zukait_reception_job_approval_valid(text,text,jsonb)','execute')
 or has_function_privilege('authenticated','zukait_reception_guard_job_creation()','execute') then raise exception 'guard grants exposed'; end if;
 quote:=jsonb_build_object('id',eid,'estimateNo',eno,'makeModel','Toyota Camry','registration','','jobCard','');
 identity:=zukait_reception_identity('{"make":"Toyota","model":"Camry"}',ins);
 insert into workshop_receptions(rc_no,sequence_no,insurance_id,details,location,created_by,updated_by)
 values(rc,-91001,ins,'{"make":"Toyota","model":"Camry"}','VWC',mgr,mgr);
 insert into workshop_reception_estimates(id,rc_no,estimate_id,estimate_no,snapshot,identity_snapshot,linked_by)
 values(qid,rc,eid,eno,quote,identity,mgr);
 insert into workshop_reception_approvals(rc_no,quotation_id,reference,approval_date,approved_amount,approved_parts,estimate_snapshot,parts_snapshot,identity_snapshot,actor_id,reason)
 values(rc,qid,'QA',current_date,1.000,'[]',quote,'[]',identity,mgr,'QA guard fixture');
 update workshop_state set data=jsonb_set(original,'{estimates}',coalesce(original->'estimates','[]')||jsonb_build_array(quote)) where id='main';
 j:=jsonb_build_object('no',no,'jobType','INSURANCE','receptionNo',rc,'vehicle','Toyota Camry','status','Open');
 payload:=jsonb_build_object('jobCard',no,'jobType','INSURANCE','receptionNo',rc,'vehicleMake','Toyota','vehicleModel','Camry');
 execute 'set local role service_role';
 -- An approval record alone is insufficient: linkage and approved status are required.
 begin update workshop_state set data=jsonb_set(data,'{jobs}',coalesce(data->'jobs','[]')||jsonb_build_array(j)) where id='main'; raise exception 'unlinked insurance snapshot accepted'; exception when others then if sqlerrm<>'insurance_job_requires_approved_reception' then raise; end if; end;
 begin perform zukait_v2_commit_event(gen_random_uuid()::text,no,mgr,'QA','JOB_CREATED',null,0,payload); raise exception 'unlinked insurance event accepted'; exception when others then if sqlerrm<>'insurance_job_requires_approved_reception' then raise; end if; end;
 -- The existing schema also forbids linking while waiting.
 if zukait_reception_job_approval_valid(no,rc) then raise exception 'waiting approval accepted'; end if;
 update workshop_receptions set approval_status='APPROVED',job_card=no where rc_no=rc;
 if not zukait_reception_job_approval_valid(no,rc) then raise exception 'approved link rejected'; end if;
 if zukait_reception_job_approval_valid(no,null) or zukait_reception_job_approval_valid(no||'-wrong',rc) then raise exception 'wrong link accepted'; end if;
 update workshop_receptions set outcome='CANCELLED',closed_at=now(),job_card=null where rc_no=rc;
 if zukait_reception_job_approval_valid(no,rc) then raise exception 'cancelled case accepted'; end if;
 update workshop_receptions set outcome=null,closed_at=null,job_card=no,details=details||'{"vin":"CHANGED"}' where rc_no=rc;
 if zukait_reception_job_approval_valid(no,rc) then raise exception 'changed identity accepted'; end if;
 -- The fixture has not created its operational job yet: unlink before editing.
 update workshop_receptions set job_card=null where rc_no=rc;
 update workshop_receptions set details=details-'vin' where rc_no=rc;
 update workshop_receptions set job_card=no where rc_no=rc;
 insert into workshop_reception_preliminary_parts(rc_no,items,updated_by) values(rc,'[{"id":"qa","name":"changed","qty":1}]',mgr);
 if zukait_reception_job_approval_valid(no,rc) then raise exception 'changed parts accepted'; end if;
 update workshop_reception_preliminary_parts set items='[]' where rc_no=rc;
 update workshop_receptions set job_card=null where rc_no=rc;
 update workshop_state set data=jsonb_set(data,'{estimates}',coalesce(original->'estimates','[]')||jsonb_build_array(quote||'{"updatedAt":2}')) where id='main';
 update workshop_receptions set job_card=no where rc_no=rc;
 if zukait_reception_job_approval_valid(no,rc) then raise exception 'changed quotation accepted'; end if;
 update workshop_receptions set job_card=null where rc_no=rc;
 update workshop_state set data=jsonb_set(data,'{estimates}',coalesce(original->'estimates','[]')||jsonb_build_array(quote)||jsonb_build_array(quote)) where id='main';
 update workshop_receptions set job_card=no where rc_no=rc;
 if zukait_reception_job_approval_valid(no,rc) then raise exception 'duplicate quotation accepted'; end if;
 update workshop_receptions set job_card=null where rc_no=rc;
 update workshop_state set data=jsonb_set(data,'{estimates}',coalesce(original->'estimates','[]')||jsonb_build_array(quote)) where id='main';
 update workshop_receptions set job_card=no where rc_no=rc;
 -- A combined stale quote + new job save cannot use the previous server quote.
 begin update workshop_state set data=jsonb_set(jsonb_set(data,'{estimates}',coalesce(original->'estimates','[]')||jsonb_build_array(quote||'{"updatedAt":99}')),'{jobs}',coalesce(data->'jobs','[]')||jsonb_build_array(j)) where id='main'; raise exception 'combined stale quote creation accepted'; exception when others then if sqlerrm<>'insurance_job_requires_approved_reception' then raise; end if; end;
 -- The future atomic command can pass only after it links the approved RC.
 update workshop_state set data=jsonb_set(data,'{jobs}',coalesce(data->'jobs','[]')||jsonb_build_array(j)),revision=revision+1 where id='main';
 perform zukait_v2_commit_event(gen_random_uuid()::text,no,mgr,'QA','JOB_CREATED',null,0,payload);
 -- Subsequent operational saves preserve existing insurance jobs even if an
 -- estimate changes; creation guards must not stop repairs or time tracking.
 update workshop_state set data=jsonb_set(data,'{estimates}',coalesce(original->'estimates','[]')||jsonb_build_array(quote||'{"updatedAt":3}')) where id='main';
 -- New cash jobs remain usable; relabelling one as insurance is guarded.
 update workshop_state set data=jsonb_set(data,'{jobs}',data->'jobs'||jsonb_build_array(jsonb_build_object('no',no||'-cash','jobType','CASH','status','Open'))) where id='main';
 begin update workshop_state set data=jsonb_set(data,'{jobs}',data->'jobs'||jsonb_build_array(jsonb_build_object('no',no||'-unapproved','jobType','INSURANCE'))) where id='main'; raise exception 'missing RC accepted'; exception when others then if sqlerrm<>'insurance_job_requires_approved_reception' then raise; end if; end;
 begin update workshop_state set data=jsonb_set(data,'{jobs}',(select jsonb_agg(case when v->>'no'=no||'-cash' then v||'{"jobType":"INSURANCE"}' else v end) from jsonb_array_elements(data->'jobs') v)) where id='main'; raise exception 'cash relabel accepted'; exception when others then if sqlerrm<>'insurance_job_requires_approved_reception' then raise; end if; end;
 execute 'reset role';
 -- Explicit QA fixture teardown only; production removal remains guarded.
 update workshop_receptions set job_card=null where rc_no=rc;
 -- Restoring data is itself compatible with grandfathered real jobs.
 update workshop_state set data=original,revision=rev where id='main';
 if (select data from workshop_state where id='main') is distinct from original then raise exception 'state changed'; end if;
 if (select count(*) from workshop_v2_events)<>events+1 or (select count(*) from workshop_v2_spare_part_state)<>parts then raise exception 'unexpected operational changes'; end if;
 if (select last_value from workshop_reception_no_seq)<>rc_seq or (select last_value from workshop_v2_estimate_no_seq)<>est_seq or (select last_value from workshop_v2_spare_part_list_no_seq)<>pl_seq then raise exception 'business numbers consumed'; end if;
end;
$$;
