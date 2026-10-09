-- Pending migrations + reception-create-job.sql, inside BEGIN/ROLLBACK only.
create function pg_temp.fail_cancel_projection() returns trigger language plpgsql as $$begin if new.job_card like 'JCQA%' and new.status='CANCELLED' and coalesce(current_setting('zukait.qa_cancel_failure',true),'on')='on' then raise exception 'qa_cancel_failure';end if;return new;end;$$;
create trigger zz_qa_cancel_failure before update on workshop_v2_jobcards for each row execute function pg_temp.fail_cancel_projection();
do $$
declare rc workshop_receptions;mgr text;sup text;cmd jsonb;result jsonb;review jsonb;original jsonb;before_state jsonb;live_before jsonb;parts_before jsonb;events bigint;rcseq bigint;estseq bigint;plseq bigint;rev bigint;old_event workshop_v2_events;
begin
 select * into rc from workshop_receptions where rc_no like 'RC-QA-CREATE-%' limit 1;
 select user_id into mgr from staff_credentials where active and role='Manager' limit 1;
 select user_id into sup from staff_credentials where active and role='Supervisor' limit 1;
 select data into original from workshop_state where id='main';
 select last_value into rcseq from workshop_reception_no_seq;select last_value into estseq from workshop_v2_estimate_no_seq;select last_value into plseq from workshop_v2_spare_part_list_no_seq;
 execute 'set local role service_role';
 result:=zukait_reception_command(mgr,jsonb_build_object('operation','GET','rc_no',rc.rc_no));review:=result->'cancellation'->'review';
 if result->'cancellation'->>'can_review'<>'true' or review->>'outstanding_parts'<>'1' then raise exception 'review missing';end if;
 if (zukait_reception_command(sup,jsonb_build_object('operation','GET','rc_no',rc.rc_no))->'cancellation'->>'can_review')::boolean is distinct from false then raise exception 'supervisor cancellation exposed';end if;
 cmd:=jsonb_build_object('operation','CANCEL_JOB','rc_no',rc.rc_no,'expected_revision',rc.revision,'request_id',gen_random_uuid(),'job_card',rc.job_card,'cancellation_date',(now() at time zone 'Asia/Muscat')::date,'reason','Customer withdrew repair after review','review_fingerprint',review->>'fingerprint','review_acknowledged',true);
 begin perform zukait_reception_command(sup,cmd);raise exception 'supervisor accepted';exception when others then if sqlerrm<>'reception_manager_required' then raise;end if;end;
 begin perform zukait_reception_command(mgr,cmd||'{"job_card":"WRONG"}');raise exception 'identity accepted';exception when others then if sqlerrm<>'reception_cancellation_identity_required' then raise;end if;end;
 begin perform zukait_reception_command(mgr,cmd||'{"reason":""}');raise exception 'empty reason accepted';exception when others then if sqlerrm<>'reception_reason_required' then raise;end if;end;
 begin perform zukait_reception_command(mgr,cmd||jsonb_build_object('cancellation_date',(now() at time zone 'Asia/Muscat')::date+1));raise exception 'future date accepted';exception when others then if sqlerrm<>'reception_invalid_cancellation_date' then raise;end if;end;
 begin perform zukait_reception_command(mgr,cmd||'{"review_acknowledged":false}');raise exception 'unreviewed accepted';exception when others then if sqlerrm<>'reception_cancellation_review_changed' then raise;end if;end;
 execute 'reset role';
 -- Running/paused sessions and unfinished allocations must be resolved separately.
 update workshop_state set data=jsonb_set(data,'{assign}',coalesce(data->'assign','[]')||jsonb_build_array(jsonb_build_object('id','QA-CANCEL-A','job',rc.job_card,'emp','QA-CANCEL-EMP','completed',false))) where id='main';
 execute 'set local role service_role';
 begin perform zukait_reception_command(mgr,cmd);raise exception 'active work accepted';exception when others then if sqlerrm<>'reception_cancellation_active_work' then raise;end if;end;
 execute 'reset role';update workshop_state set data=original where id='main';
 insert into workshop_v2_work_sessions(session_id,assignment_id,job_card,employee_id,kind,started_at,status) values('QA-CANCEL-S','QA-CANCEL-A',rc.job_card,'QA-CANCEL-EMP','WORK',now(),'PAUSED');
 execute 'set local role service_role';
 begin perform zukait_reception_command(mgr,cmd);raise exception 'projected paused work accepted';exception when others then if sqlerrm<>'reception_cancellation_active_work' then raise;end if;end;
 execute 'reset role';update workshop_v2_work_sessions set status='FINISHED',ended_at=now() where session_id='QA-CANCEL-S';
 -- Changes in ordered/received quantities or commercial events invalidate review.
 update workshop_v2_spare_part_state set received_qty=1,status='SUPERVISOR_VERIFIED' where job_card=rc.job_card;
 execute 'set local role service_role';
 begin perform zukait_reception_command(mgr,cmd);raise exception 'stale parts review accepted';exception when others then if sqlerrm<>'reception_cancellation_review_changed' then raise;end if;end;
 result:=zukait_reception_command(mgr,jsonb_build_object('operation','GET','rc_no',rc.rc_no));cmd:=cmd||jsonb_build_object('review_fingerprint',result->'cancellation'->'review'->>'fingerprint');
 execute 'reset role';
 select data,revision into before_state,rev from workshop_state where id='main';
 select jsonb_agg(to_jsonb(p) order by part_id) into parts_before from workshop_v2_spare_part_state p where job_card=rc.job_card;
 select coalesce(jsonb_agg(to_jsonb(l)-'state_revision'-'updated_at'-'updated_by' order by employee_id),'[]') into live_before from workshop_live_status l;
 select count(*) into events from workshop_v2_events;
 execute 'set local role service_role';
 begin perform zukait_reception_command(mgr,cmd);raise exception 'injected failure accepted';exception when others then if sqlerrm<>'qa_cancel_failure' then raise;end if;end;
 if exists(select 1 from workshop_reception_job_cancellations where rc_no=rc.rc_no) or (select outcome from workshop_receptions where rc_no=rc.rc_no) is not null or (select revision from workshop_state where id='main')<>rev or (select data from workshop_state where id='main') is distinct from before_state or exists(select 1 from workshop_reception_commands where request_id=(cmd->>'request_id')::uuid) then raise exception 'cancellation partially committed';end if;
 execute 'reset role';set local zukait.qa_cancel_failure='off';
 execute 'set local role service_role';result:=zukait_reception_command(mgr,cmd);
 if result->'record'->>'outcome'<>'CANCELLED' or result->'record'->>'location'<>'VWC' then raise exception 'wrong cancellation/location';end if;
 if (zukait_reception_command(mgr,jsonb_build_object('operation','LIST','filter','CANCELLED','search',rc.rc_no))->'rows'->0->>'rc_no') is distinct from rc.rc_no then raise exception 'cancelled reception list missing';end if;
 if (zukait_reception_command(mgr,cmd)->>'duplicate')::boolean is distinct from true then raise exception 'lost response retry duplicated';end if;
 begin perform zukait_reception_command(mgr,cmd||'{"reason":"different"}');raise exception 'request conflict accepted';exception when others then if sqlerrm<>'reception_request_conflict' then raise;end if;end;
 if (select data-'jobs' from workshop_state where id='main') is distinct from (before_state-'jobs') then raise exception 'time/assignments/financial data changed';end if;
 if (select jsonb_agg(to_jsonb(p) order by part_id) from workshop_v2_spare_part_state p where job_card=rc.job_card) is distinct from parts_before or (select count(*) from workshop_v2_events)<>events then raise exception 'parts/events changed';end if;
 if (select coalesce(jsonb_agg(to_jsonb(l)-'state_revision'-'updated_at'-'updated_by' order by employee_id),'[]') from workshop_live_status l) is distinct from live_before then raise exception 'employee live statuses changed';end if;
 -- A stale snapshot may save unrelated state, but cannot reopen the Job Card.
 update workshop_state set data=before_state where id='main';
 if not exists(select 1 from workshop_state s,jsonb_array_elements(s.data->'jobs') j where s.id='main' and j->>'no'=rc.job_card and j->>'status'='Cancelled' and j->>'cancelled'='true') then raise exception 'stale save reopened job';end if;
 update workshop_v2_jobcards set status='OPEN',workflow_stage='CREATED' where job_card=rc.job_card;
 if (select status from workshop_v2_jobcards where job_card=rc.job_card)<>'CANCELLED' then raise exception 'projection reopened';end if;
 begin update workshop_state set data=jsonb_set(data,'{jobs}',(select jsonb_agg(case when j->>'no'=rc.job_card then j||'{"delivered":true}' else j end) from jsonb_array_elements(data->'jobs') j)) where id='main';raise exception 'cancelled delivered';exception when others then if sqlerrm<>'reception_cancelled_job_delivery_forbidden' then raise;end if;end;
 begin update workshop_state set data=jsonb_set(data,'{assign}',coalesce(data->'assign','[]')||jsonb_build_array(jsonb_build_object('id','QA-NEW','job',rc.job_card,'emp','QA','completed',false))) where id='main';raise exception 'new work accepted';exception when others then if sqlerrm<>'reception_cancelled_work_history_protected' then raise;end if;end;
 begin perform zukait_v2_commit_event('QA-REOPEN-'||gen_random_uuid(),rc.job_card,mgr,'qa','JOB_REOPENED',null,99,jsonb_build_object('jobCard',rc.job_card));raise exception 'event reopen accepted';exception when others then if sqlerrm<>'reception_cancelled_job_work_forbidden' then raise;end if;end;
 begin insert into workshop_v2_work_sessions(session_id,assignment_id,job_card,employee_id,kind,started_at,status) values('QA-NEW-S','QA-NEW-A',rc.job_card,'QA-CANCEL-EMP','WORK',now(),'ACTIVE');raise exception 'direct session accepted';exception when others then if sqlerrm<>'reception_cancelled_work_history_protected' then raise;end if;end;
 -- A committed event may be retried after cancellation without new work.
 select * into old_event from workshop_v2_events where payload->>'jobCard'=rc.job_card and event_type='JOB_CREATED' limit 1;
 perform zukait_v2_commit_event(old_event.event_id,old_event.entity_id,old_event.actor_id,old_event.device_id,old_event.event_type,old_event.client_time,old_event.revision,old_event.payload);
 -- Existing parts settlement path remains usable after cancellation.
 perform zukait_v2_commit_event('QA-POST-CANCEL-'||gen_random_uuid(),'QA-AUDIT',mgr,'qa','SPARE_PART_FINAL_PRICE_RECORDED',null,1,jsonb_build_object('jobCard',rc.job_card,'partId',(select part_id from workshop_v2_spare_part_state where job_card=rc.job_card limit 1),'finalPrice',2));
 if has_table_privilege('service_role','workshop_reception_job_cancellations','update') or has_table_privilege('anon','workshop_reception_job_cancellations','select') or has_function_privilege('authenticated','zukait_reception_cancellation_review(text,jsonb)','execute') then raise exception 'grants exposed';end if;
 if (select last_value from workshop_reception_no_seq)<>rcseq or (select last_value from workshop_v2_estimate_no_seq)<>estseq or (select last_value from workshop_v2_spare_part_list_no_seq)<>plseq then raise exception 'business sequence consumed';end if;
 execute 'reset role';
end;$$;
