-- Run pending migrations, reception-create-job.sql and this file inside BEGIN/ROLLBACK.
do $$
declare
 rc workshop_receptions;mgr text;emp text;round_id uuid:=gen_random_uuid();eid text:=gen_random_uuid()::text;
 eno text:='Zi-QA-ADD-'||gen_random_uuid();q jsonb;cmd jsonb;r jsonb;item jsonb;second jsonb;
 before_state jsonb;before_parts jsonb;before_initial jsonb;events bigint;rev bigint;pl bigint;est bigint;rcseq bigint;quote_id uuid;
begin
 select * into rc from workshop_receptions where rc_no like 'RC-QA-CREATE-%' limit 1;
 if rc.rc_no is null then raise exception 'creation fixture required';end if;
 select user_id into mgr from staff_credentials where active and role='Manager' limit 1;
 select user_id into emp from staff_credentials where active and role='Employee' limit 1;
 select last_value into pl from workshop_v2_spare_part_list_no_seq;
 select last_value into est from workshop_v2_estimate_no_seq;
 select last_value into rcseq from workshop_reception_no_seq;
 select jsonb_agg(to_jsonb(a) order by id) into before_initial from workshop_reception_approvals a where rc_no=rc.rc_no;
 select jsonb_agg(to_jsonb(p) order by part_id) into before_parts from workshop_v2_spare_part_state p where job_card=rc.job_card;
 item:=jsonb_build_object('id',gen_random_uuid(),'name','Additional QA Lamp','part_no','QA-L','qty',3);
 second:=jsonb_build_object('id',gen_random_uuid(),'name','Front bumper','part_no','B1','qty',1);
 cmd:=jsonb_build_object('operation','SAVE_ADDITIONAL_REQUEST','request_id',gen_random_uuid(),'round_id',round_id,'rc_no',rc.rc_no,'expected_revision',rc.revision,'items',jsonb_build_array(item,second),'reason','Additional assessment');
 execute 'set local role service_role';
 begin perform zukait_reception_command(emp,cmd);raise exception 'employee accepted';exception when others then if sqlerrm<>'reception_additional_forbidden' then raise;end if;end;
 begin perform zukait_reception_command(mgr,cmd||'{"expected_revision":0}');raise exception 'stale accepted';exception when others then if sqlerrm<>'reception_stale_revision' then raise;end if;end;
 r:=zukait_reception_command(mgr,cmd);rc.revision:=(r->'record'->>'revision')::bigint;
 if (zukait_reception_command(mgr,cmd)->>'duplicate')::boolean is distinct from true then raise exception 'draft retry duplicated';end if;
 begin perform zukait_reception_command(mgr,cmd||'{"reason":"changed"}');raise exception 'request conflict accepted';exception when others then if sqlerrm<>'reception_request_conflict' then raise;end if;end;
 begin perform zukait_reception_command(mgr,cmd||jsonb_build_object('request_id',gen_random_uuid(),'round_id',gen_random_uuid(),'expected_revision',rc.revision));raise exception 'second draft accepted';exception when others then if sqlerrm<>'reception_additional_draft_exists' then raise;end if;end;
 execute 'reset role';
 q:=jsonb_build_object('id',eid,'estimateNo',eno,'makeModel','Toyota Camry','registration','','jobCard',rc.job_card,'receptionNo',rc.rc_no,'receptionAdditionalRequestId',round_id,'total',15.555);
 insert into workshop_v2_estimate_numbers(estimate_no,sequence_no,client_key,created_by) values(eno,-94001,eid,mgr);
 update workshop_state set data=jsonb_set(data,'{estimates}',data->'estimates'||jsonb_build_array(q)) where id='main';
 cmd:=jsonb_build_object('operation','LINK_ADDITIONAL_ESTIMATE','request_id',gen_random_uuid(),'round_id',round_id,'rc_no',rc.rc_no,'expected_revision',rc.revision,'estimate_no',eno,'reason','Review snapshot');
 execute 'set local role service_role';
 r:=zukait_reception_command(mgr,cmd);rc.revision:=(r->'record'->>'revision')::bigint;quote_id:=(r->'quotation'->>'id')::uuid;
 if (zukait_reception_command(mgr,cmd)->>'duplicate')::boolean is distinct from true then raise exception 'link retry duplicated';end if;
 execute 'reset role';
 -- An edited draft must require an explicit quotation review/link again.
 cmd:=jsonb_build_object('operation','SAVE_ADDITIONAL_REQUEST','request_id',gen_random_uuid(),'round_id',round_id,'rc_no',rc.rc_no,'expected_revision',rc.revision,'items',jsonb_build_array(item||'{"qty":4}',second),'reason','Revised request');
 execute 'set local role service_role';r:=zukait_reception_command(mgr,cmd);execute 'reset role';rc.revision:=(r->'record'->>'revision')::bigint;
 if (select quotation_id from workshop_reception_additional_requests where id=round_id) is not null then raise exception 'changed draft retained review';end if;
 cmd:=jsonb_build_object('operation','LINK_ADDITIONAL_ESTIMATE','request_id',gen_random_uuid(),'round_id',round_id,'rc_no',rc.rc_no,'expected_revision',rc.revision,'estimate_no',eno,'reason','Review revised request');
 execute 'set local role service_role';r:=zukait_reception_command(mgr,cmd);execute 'reset role';rc.revision:=(r->'record'->>'revision')::bigint;
 select data,revision into before_state,rev from workshop_state where id='main';select count(*) into events from workshop_v2_events;
 cmd:=jsonb_build_object('operation','APPROVE_ADDITIONAL','request_id',gen_random_uuid(),'round_id',round_id,'rc_no',rc.rc_no,'expected_revision',rc.revision,'quotation_id',quote_id,'reference','ADD-QA','approval_date',current_date,'approved_amount','15.555','approved_parts',jsonb_build_array(jsonb_build_object('id',item->>'id','qty',1),jsonb_build_object('id',second->>'id','qty',1)),'reason','Surveyor approval');
 execute 'set local role service_role';
 begin perform zukait_reception_command(mgr,cmd);raise exception 'duplicate accepted';exception when others then if sqlerrm<>'reception_additional_duplicate_active_part' then raise;end if;end;
 if exists(select 1 from workshop_reception_additional_approvals where rc_no=rc.rc_no)
 or exists(select 1 from workshop_reception_additional_transfers)
 or (select status from workshop_reception_additional_requests where id=round_id)<>'DRAFT'
 or (select count(*) from workshop_v2_events)<>events or (select revision from workshop_state where id='main')<>rev
 or exists(select 1 from workshop_reception_commands where request_id=(cmd->>'request_id')::uuid) then raise exception 'failure partially committed';end if;
 begin perform zukait_reception_command(mgr,cmd||'{"approved_amount":"15.5555"}');raise exception 'precision accepted';exception when others then if sqlerrm<>'reception_invalid_approval' then raise;end if;end;
 begin perform zukait_reception_command(mgr,cmd||jsonb_build_object('approved_parts',jsonb_build_array(jsonb_build_object('id',item->>'id','qty',5))));raise exception 'excess quantity accepted';exception when others then if sqlerrm<>'reception_invalid_approved_parts' then raise;end if;end;
 execute 'reset role';
 update workshop_state set data=jsonb_set(data,'{estimates}',(select jsonb_agg(case when e->>'id'=eid then e||'{"total":999}' else e end) from jsonb_array_elements(data->'estimates') e)) where id='main';
 execute 'set local role service_role';
 begin perform zukait_reception_command(mgr,cmd);raise exception 'changed snapshot accepted';exception when others then if sqlerrm<>'reception_estimate_changed' then raise;end if;end;
 execute 'reset role';update workshop_state set data=before_state where id='main';
 execute 'set local role service_role';
 cmd:=cmd||jsonb_build_object('approved_parts',jsonb_build_array(jsonb_build_object('id',item->>'id','qty',1)));
 r:=zukait_reception_command(mgr,cmd);
 if jsonb_array_length(r->'parts')<>1 or r->'parts'->0->>'qty'<>'1' then raise exception 'transfer selection wrong';end if;
 if (select ordered_qty from workshop_v2_spare_part_state where part_id=r->'parts'->0->>'part_id')<>1 then raise exception 'normal projection missing';end if;
 if (select count(*) from workshop_v2_events)<>events+1 or (select count(*) from workshop_v2_spare_part_list_numbers where job_card=rc.job_card)<>1 then raise exception 'duplicate PL/event';end if;
 if (zukait_reception_command(mgr,cmd)->>'duplicate')::boolean is distinct from true then raise exception 'approval retry duplicated';end if;
 begin perform zukait_reception_command(mgr,cmd||jsonb_build_object('request_id',gen_random_uuid(),'expected_revision',(r->'record'->>'revision')::bigint));raise exception 'second approval accepted';exception when others then if sqlerrm<>'reception_additional_already_approved' then raise;end if;end;
 r:=zukait_reception_command(mgr,jsonb_build_object('operation','GET','rc_no',rc.rc_no));
 if r->'additional'->>'initial_amount'<>'1.000' or r->'additional'->>'additional_amount'<>'15.555' or r->'record'->>'location'<>'VWC' then raise exception 'totals/location wrong: %',r->'additional';end if;
 if (select data from workshop_state where id='main') is distinct from before_state then raise exception 'workshop workflows changed';end if;
 if (select jsonb_agg(to_jsonb(a) order by id) from workshop_reception_approvals a where rc_no=rc.rc_no) is distinct from before_initial then raise exception 'original evidence changed';end if;
 if (select jsonb_agg(to_jsonb(p) order by part_id) from workshop_v2_spare_part_state p where job_card=rc.job_card and part_id<>r->'additional'->'transfers'->0->>'part_id') is distinct from before_parts then raise exception 'original parts changed';end if;
 if has_table_privilege('service_role','workshop_reception_additional_approvals','update') or has_table_privilege('authenticated','workshop_reception_additional_transfers','select') or has_function_privilege('anon','zukait_reception_open_job(jsonb)','execute') then raise exception 'grants exposed';end if;
 if (select last_value from workshop_v2_spare_part_list_no_seq)<>pl or (select last_value from workshop_v2_estimate_no_seq)<>est or (select last_value from workshop_reception_no_seq)<>rcseq then raise exception 'business sequence consumed';end if;
 execute 'reset role';
end;$$;

do $$
declare rc workshop_receptions;mgr text;round_id uuid;eid text;eno text;q jsonb;cmd jsonb;r jsonb;item jsonb;step integer;
 pl bigint;events bigint;state_before jsonb;list text:='PL-QA-ADDITIONAL-'||gen_random_uuid();
begin
 select * into rc from workshop_receptions where rc_no like 'RC-QA-LABOUR-%' limit 1;
 select user_id into mgr from staff_credentials where active and role='Supervisor' limit 1;
 select last_value into pl from workshop_v2_spare_part_list_no_seq;
 for step in 1..2 loop
  round_id:=gen_random_uuid();eid:=gen_random_uuid()::text;eno:='Zi-QA-ADD-'||gen_random_uuid();
  item:=jsonb_build_object('id',gen_random_uuid(),'name','First additional QA part','part_no','QA-FIRST','qty',2);
  cmd:=jsonb_build_object('operation','SAVE_ADDITIONAL_REQUEST','request_id',gen_random_uuid(),'round_id',round_id,'rc_no',rc.rc_no,'expected_revision',rc.revision,'items',case when step=1 then '[]'::jsonb else jsonb_build_array(item) end,'reason','Later assessment');
  execute 'set local role service_role';r:=zukait_reception_command(mgr,cmd);execute 'reset role';rc.revision:=(r->'record'->>'revision')::bigint;
  q:=jsonb_build_object('id',eid,'estimateNo',eno,'makeModel','Toyota Camry','registration','','jobCard',rc.job_card,'receptionNo',rc.rc_no,'receptionAdditionalRequestId',round_id);
  insert into workshop_v2_estimate_numbers(estimate_no,sequence_no,client_key,created_by) values(eno,-95000-step,eid,mgr);
  update workshop_state set data=jsonb_set(data,'{estimates}',data->'estimates'||jsonb_build_array(q)) where id='main';
  cmd:=jsonb_build_object('operation','LINK_ADDITIONAL_ESTIMATE','request_id',gen_random_uuid(),'round_id',round_id,'rc_no',rc.rc_no,'expected_revision',rc.revision,'estimate_no',eno,'reason','Review quotation');
  execute 'set local role service_role';r:=zukait_reception_command(mgr,cmd);execute 'reset role';rc.revision:=(r->'record'->>'revision')::bigint;
  if step=2 then insert into workshop_v2_spare_part_list_numbers(list_no,sequence_no,job_card,client_key,created_by) values(list,-96001,rc.job_card,gen_random_uuid(),mgr);end if;
  select count(*) into events from workshop_v2_events;select data into state_before from workshop_state where id='main';
  cmd:=jsonb_build_object('operation','APPROVE_ADDITIONAL','request_id',gen_random_uuid(),'round_id',round_id,'rc_no',rc.rc_no,'expected_revision',rc.revision,'quotation_id',r->'quotation'->>'id','reference','ADDITIONAL QA','approval_date',current_date,'approved_amount','10.001','approved_parts',case when step=1 then '[]'::jsonb else jsonb_build_array(jsonb_build_object('id',item->>'id','qty',1)) end,'reason','Approved additional work');
  execute 'set local role service_role';r:=zukait_reception_command(mgr,cmd);execute 'reset role';rc.revision:=(r->'record'->>'revision')::bigint;
  if step=1 and (exists(select 1 from workshop_v2_spare_part_list_numbers where job_card=rc.job_card) or (select count(*) from workshop_v2_events)<>events) then raise exception 'labour-only allocated PL';end if;
  if step=2 and ((select count(*) from workshop_v2_events)<>events+2 or r->'parts'->0->>'list_no'<>list) then raise exception 'first additional PL event missing';end if;
  if (select data from workshop_state where id='main') is distinct from state_before or (select location from workshop_receptions where rc_no=rc.rc_no)<>'VIW' then raise exception 'labour workflow/movement changed';end if;
 end loop;
 execute 'set local role service_role';
 r:=zukait_reception_command(mgr,jsonb_build_object('operation','GET','rc_no',rc.rc_no));
 if jsonb_array_length(r->'additional'->'approvals')<>2 or r->'additional'->>'additional_amount'<>'20.002' then raise exception 'round totals wrong';end if;
 execute 'reset role';
 update workshop_state set data=jsonb_set(data,'{jobs}',(select jsonb_agg(case when j->>'no'=rc.job_card then j||'{"delivered":true}' else j end) from jsonb_array_elements(data->'jobs') j)) where id='main';
 cmd:=jsonb_build_object('operation','SAVE_ADDITIONAL_REQUEST','request_id',gen_random_uuid(),'round_id',gen_random_uuid(),'rc_no',rc.rc_no,'expected_revision',rc.revision,'items','[]'::jsonb,'reason','Must reject delivered');
 execute 'set local role service_role';
 begin perform zukait_reception_command(mgr,cmd);raise exception 'delivered accepted';exception when others then if sqlerrm<>'reception_additional_job_closed' then raise;end if;end;
 if (zukait_reception_command(mgr,jsonb_build_object('operation','GET','rc_no',rc.rc_no))->'additional'->>'can_prepare')::boolean is distinct from false then raise exception 'closed permission enabled';end if;
 if (select last_value from workshop_v2_spare_part_list_no_seq)<>pl then raise exception 'PL sequence consumed';end if;
 execute 'reset role';
end;$$;
