-- Run all pending migrations and this test inside BEGIN/ROLLBACK.
do $$
declare
 original jsonb; rev bigint; mgr text; emp text; ins bigint; rc text:='RC-QA-CREATE-'||gen_random_uuid();
 no text:='JCQA'||upper(replace(gen_random_uuid()::text,'-','')); eno text:='Zi-QA-CREATE-'||gen_random_uuid();
 eid text:=gen_random_uuid()::text; qid uuid:=gen_random_uuid(); quote jsonb;
 identity jsonb; j jsonb; payload jsonb; events bigint; parts bigint; rc_seq bigint; est_seq bigint; pl_seq bigint;
 command jsonb; result jsonb; item jsonb; item2 jsonb; live_before jsonb; live_after jsonb; allocated text;
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

 select user_id into emp from staff_credentials where active and role='Employee' limit 1;
 select coalesce(jsonb_agg(to_jsonb(l)-'state_revision'-'updated_at'-'updated_by' order by employee_id),'[]') into live_before from workshop_live_status l;
 item:=jsonb_build_object('id',gen_random_uuid(),'name','Front bumper','part_no','B1','qty',2);
 item2:=item||jsonb_build_object('id',gen_random_uuid(),'qty',1);
 insert into workshop_reception_preliminary_parts(rc_no,items,updated_by) values(rc,jsonb_build_array(item),mgr);
 -- Reserve an empty fixture allocation explicitly: allocator reuse exercises its
 -- real implementation without nextval on a live business sequence.
 allocated:='PL-QA-'||gen_random_uuid();
 insert into workshop_v2_spare_part_list_numbers(list_no,sequence_no,job_card,client_key,created_by) values(allocated,-92001,no,gen_random_uuid(),mgr);
 command:=jsonb_build_object('operation','CREATE_JOB','request_id',gen_random_uuid(),'rc_no',rc,'expected_revision',1,'job_card',no,'reason','Approved insurance repair');
 execute 'set local role service_role';
 begin perform zukait_reception_command(emp,command);raise exception 'employee created job';exception when others then if sqlerrm<>'reception_job_forbidden' then raise;end if;end;
 begin perform zukait_reception_command(mgr,command);raise exception 'waiting job created';exception when others then if sqlerrm<>'reception_not_approved' then raise;end if;end;
 update workshop_receptions set approval_status='APPROVED' where rc_no=rc;
 -- Initial labour-only approval has a changed draft and must fail atomically.
 begin perform zukait_reception_command(mgr,command);raise exception 'stale draft accepted';exception when others then if sqlerrm<>'reception_approval_changed' then raise;end if;end;
 if (select job_card from workshop_receptions where rc_no=rc) is not null then raise exception 'failed creation retained link';end if;
 execute 'reset role';
 -- Deliberately corrupted approval: duplicate operational keys force projection
 -- failure after state creation, proving all writes roll back together.
 insert into workshop_reception_approvals(rc_no,quotation_id,reference,approval_date,approved_amount,approved_parts,estimate_snapshot,parts_snapshot,identity_snapshot,actor_id,reason)
 values(rc,qid,'QA bad',current_date,1,jsonb_build_array(item,item2),quote,jsonb_build_array(item),identity,mgr,'Rollback fixture');
 execute 'set local role service_role';
 begin perform zukait_reception_command(mgr,command);raise exception 'duplicate parts accepted';exception when others then if sqlerrm<>'duplicate_active_spare_part' then raise;end if;end;
 if (select job_card from workshop_receptions where rc_no=rc) is not null or (select revision from workshop_state where id='main')<>rev
 or (select count(*) from workshop_v2_events)<>events or exists(select 1 from workshop_v2_jobcards where job_card=no)
 or exists(select 1 from workshop_reception_part_transfers where rc_no=rc) then raise exception 'projection failure was partial';end if;
 execute 'reset role';
 insert into workshop_reception_approvals(rc_no,quotation_id,reference,approval_date,approved_amount,approved_parts,estimate_snapshot,parts_snapshot,identity_snapshot,actor_id,reason)
 values(rc,qid,'QA good',current_date,1,jsonb_build_array(item||'{"qty":1}'),quote,jsonb_build_array(item),identity,mgr,'Approved partial quantity');
 execute 'set local role service_role';
 begin perform zukait_reception_command(mgr,command||jsonb_build_object('expected_revision',0));raise exception 'stale revision accepted';exception when others then if sqlerrm<>'reception_stale_revision' then raise;end if;end;
 result:=zukait_reception_command(mgr,command);
 if result->'record'->>'job_card'<>no or result->'record'->>'location'<>'VWC' or result->'record'->>'revision'<>'2' then raise exception 'wrong link/location/revision';end if;
 if (result->>'server_revision')::bigint<>rev+1 then raise exception 'state revision not advanced';end if;
 if (select count(*) from workshop_reception_part_transfers where rc_no=rc)<>1 or (select ordered_qty from workshop_v2_spare_part_state where job_card=no)<>1 then raise exception 'approved parts transfer incorrect';end if;
 if (select count(*) from workshop_v2_events)<>events+3 then raise exception 'expected job/list/item events absent';end if;
 if (zukait_reception_command(mgr,command)->>'duplicate')::boolean is distinct from true then raise exception 'retry not cached';end if;
 begin perform zukait_reception_command(mgr,command||jsonb_build_object('reason','changed'));raise exception 'request conflict accepted';exception when others then if sqlerrm<>'reception_request_conflict' then raise;end if;end;
 begin perform zukait_reception_command(mgr,command||jsonb_build_object('request_id',gen_random_uuid(),'expected_revision',2));raise exception 'second job created';exception when others then if sqlerrm<>'reception_job_already_created' then raise;end if;end;
 if (zukait_reception_command(mgr,jsonb_build_object('operation','GET','rc_no',rc))->'job_creation'->>'can_create')::boolean is distinct from false then raise exception 'linked create button enabled';end if;
 execute 'reset role';
 select coalesce(jsonb_agg(to_jsonb(l)-'state_revision'-'updated_at'-'updated_by' order by employee_id),'[]') into live_after from workshop_live_status l;
 if live_after is distinct from live_before then raise exception 'live employees changed';end if;
 if (select data-'jobs' from workshop_state where id='main') is distinct from (jsonb_set(original,'{estimates}',coalesce(original->'estimates','[]')||jsonb_build_array(quote))-'jobs') then raise exception 'other workshop data changed';end if;
 if (select last_value from workshop_reception_no_seq)<>rc_seq or (select last_value from workshop_v2_estimate_no_seq)<>est_seq or (select last_value from workshop_v2_spare_part_list_no_seq)<>pl_seq then raise exception 'business sequence consumed';end if;
 if has_table_privilege('anon','workshop_reception_part_transfers','select') or has_table_privilege('service_role','workshop_reception_part_transfers','update') then raise exception 'invalid transfer grants';end if;
end;$$;

do $$
declare
 original jsonb; rev bigint; mgr text; emp text; ins bigint; rc text:='RC-QA-LABOUR-'||gen_random_uuid();
 no text:='JLQA'||upper(replace(gen_random_uuid()::text,'-','')); eno text:='Zi-QA-CREATE-'||gen_random_uuid();
 eid text:=gen_random_uuid()::text; qid uuid:=gen_random_uuid(); quote jsonb;
 identity jsonb; j jsonb; payload jsonb; events bigint; parts bigint; rc_seq bigint; est_seq bigint; pl_seq bigint;
 command jsonb; result jsonb; item jsonb; item2 jsonb; live_before jsonb; live_after jsonb; allocated text;
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
 values(rc,-93001,ins,'{"make":"Toyota","model":"Camry"}','VWC',mgr,mgr);
 insert into workshop_reception_estimates(id,rc_no,estimate_id,estimate_no,snapshot,identity_snapshot,linked_by)
 values(qid,rc,eid,eno,quote,identity,mgr);
 insert into workshop_reception_approvals(rc_no,quotation_id,reference,approval_date,approved_amount,approved_parts,estimate_snapshot,parts_snapshot,identity_snapshot,actor_id,reason)
 values(rc,qid,'QA',current_date,1.000,'[]',quote,'[]',identity,mgr,'QA guard fixture');
 update workshop_state set data=jsonb_set(original,'{estimates}',coalesce(original->'estimates','[]')||jsonb_build_array(quote)) where id='main';
 j:=jsonb_build_object('no',no,'jobType','INSURANCE','receptionNo',rc,'vehicle','Toyota Camry','status','Open');
 payload:=jsonb_build_object('jobCard',no,'jobType','INSURANCE','receptionNo',rc,'vehicleMake','Toyota','vehicleModel','Camry');


 update workshop_receptions set approval_status='APPROVED',location='VIW' where rc_no=rc;
 select user_id into mgr from staff_credentials where active and role='Supervisor' limit 1;
 command:=jsonb_build_object('operation','CREATE_JOB','request_id',gen_random_uuid(),'rc_no',rc,'expected_revision',1,'job_card',no,'reason','Labour-only repair');
 -- Existing projection collision must fail before writing any reception link.
 insert into workshop_v2_jobcards(job_card) values(no);
 execute 'set local role service_role';
 begin perform zukait_reception_command(mgr,command);raise exception 'existing projection overwritten';exception when others then if sqlerrm<>'reception_job_number_exists' then raise;end if;end;
 execute 'reset role';
 update workshop_v2_jobcards set job_card=no||'X' where job_card=no;
 execute 'set local role service_role';
 result:=zukait_reception_command(mgr,command);
 if result->'record'->>'location'<>'VIW' or result->'parts'<>'[]'::jsonb or exists(select 1 from workshop_v2_spare_part_list_numbers where job_card=no) then raise exception 'labour-only creation allocated parts or moved vehicle';end if;
 if (select count(*) from workshop_v2_events)<>events+1 or (select count(*) from workshop_v2_spare_part_state)<>parts then raise exception 'labour-only event/parts count incorrect';end if;
 if (select last_value from workshop_reception_no_seq)<>rc_seq or (select last_value from workshop_v2_estimate_no_seq)<>est_seq or (select last_value from workshop_v2_spare_part_list_no_seq)<>pl_seq then raise exception 'labour-only consumed business numbers';end if;
 execute 'reset role';
end;$$;
