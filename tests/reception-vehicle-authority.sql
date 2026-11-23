-- Run after reception-create-job.sql in the same BEGIN/ROLLBACK transaction.
-- Reuses its explicit fixtures; no business nextval calls.
create function pg_temp.fail_reception_vehicle_projection() returns trigger language plpgsql as $$begin raise exception 'QA_projection_failure';end;$$;
create trigger qa_vehicle_failure after update on public.workshop_v2_jobcards for each row when (new.registration='QA-FAIL') execute function pg_temp.fail_reception_vehicle_projection();
do $$
declare r workshop_receptions; mgr text; supervisor text; before_state jsonb;
 approval_before jsonb; parts_before jsonb; live_before jsonb; cmd jsonb; result jsonb; job jsonb; rev bigint;
begin
 select * into r from workshop_receptions where rc_no like 'RC-QA-CREATE-%' and job_card is not null order by rc_no limit 1;
 if not found then raise exception 'creation fixture required'; end if;
 select user_id into mgr from staff_credentials where active and role='Manager' limit 1;
 select user_id into supervisor from staff_credentials where active and role='Supervisor' limit 1;
 if not (zukait_reception_command(mgr,jsonb_build_object('operation','GET','rc_no',r.rc_no))->'insurance'->>'approval_valid')::boolean then raise exception 'initial approval invalid';end if;
 perform zukait_reception_command(mgr,jsonb_build_object('operation','MOVE','rc_no',r.rc_no,'expected_revision',r.revision,'request_id',gen_random_uuid(),'location',case r.location when 'VIW' then 'VWC' else 'VIW' end,'reason','Physical movement before correction'));
 if not (zukait_reception_command(mgr,jsonb_build_object('operation','GET','rc_no',r.rc_no))->'insurance'->>'approval_valid')::boolean then raise exception 'movement invalidated approval';end if;
 select * into r from workshop_receptions where rc_no=r.rc_no;
 select data into before_state from workshop_state where id='main';
 select jsonb_agg(to_jsonb(a) order by id) into approval_before from workshop_reception_approvals a;
 select jsonb_agg(to_jsonb(p) order by part_id) into parts_before from workshop_v2_spare_part_state p;
 select jsonb_agg(to_jsonb(l)-'updated_at'-'updated_by'-'state_revision' order by employee_id) into live_before from workshop_live_status l;
 cmd:=jsonb_build_object('operation','EDIT','rc_no',r.rc_no,'expected_revision',r.revision,'request_id',gen_random_uuid(),
  'insurance_id',r.insurance_id,'details',r.details||'{"make":"Nissan","model":"Altima","registration":"QA-NEW","vin":"","claim":"Corrected","customer":"QA customer","contact":"12345","year":"2018","damage":"Checklist only"}', 'reason','Manager identity correction');
 execute 'set local role service_role';
 begin perform zukait_reception_command(supervisor,cmd);raise exception 'Supervisor corrected linked identity';exception when others then if sqlerrm<>'reception_manager_required' then raise; end if;end;
 begin perform zukait_reception_command(mgr,cmd-'reason');raise exception 'missing reason accepted';exception when others then if sqlerrm<>'reception_reason_required' then raise;end if;end;
 begin perform zukait_reception_command(mgr,cmd||jsonb_build_object('request_id',gen_random_uuid(),'details',cmd->'details'||'{"registration":"QA-FAIL"}'));raise exception 'projection failure ignored';exception when others then if sqlerrm<>'QA_projection_failure' then raise;end if;end;
 if (select data from workshop_state where id='main') is distinct from before_state or (select revision from workshop_receptions where rc_no=r.rc_no)<>r.revision then raise exception 'correction failure left partial writes';end if;
 result:=zukait_reception_command(mgr,cmd);
 if (zukait_reception_command(mgr,cmd)->>'duplicate')::boolean is distinct from true then raise exception 'correction retry not cached';end if;
 begin perform zukait_reception_command(mgr,cmd||jsonb_build_object('request_id',gen_random_uuid()));raise exception 'stale correction accepted';exception when others then if sqlerrm<>'reception_stale_revision' then raise;end if;end;
 select value into job from workshop_state s,jsonb_array_elements(s.data->'jobs') where s.id='main' and value->>'no'=r.job_card;
 if job->>'vehicle'<>'Nissan Altima' or job->>'reg'<>'QA-NEW' or job->>'vin'<>'' or job ? 'damage' or job->>'receptionLocation'<>r.location then raise exception 'incorrect job master overlay';end if;
 if exists(select 1 from workshop_state s,jsonb_array_elements(s.data->'estimates') e join workshop_reception_estimates q on q.estimate_id=e->>'id' where q.rc_no=r.rc_no and (e->>'makeModel'<>'Nissan Altima' or e->>'registration'<>'QA-NEW')) then raise exception 'estimate identity not corrected';end if;
 if (select data-'jobs'-'estimates' from workshop_state where id='main') is distinct from before_state-'jobs'-'estimates' then raise exception 'unrelated state changed';end if;
 -- Simulate an old phone losing all linked metadata and restoring old identity.
 update workshop_state set data=before_state where id='main';
 if not exists(select 1 from workshop_state s,jsonb_array_elements(s.data->'jobs') j where j->>'no'=r.job_card and j->>'reg'='QA-NEW' and j->>'receptionNo'=r.rc_no) then raise exception 'stale full save reverted correction';end if;
 begin update workshop_state set data=jsonb_set(data,'{jobs}','[]') where id='main';raise exception 'linked job removed';exception when others then if sqlerrm<>'reception_linked_job_required' then raise;end if;end;
 begin update workshop_state set data=jsonb_set(data,'{estimates}','[]') where id='main';raise exception 'linked quote removed';exception when others then if sqlerrm<>'reception_linked_estimate_required' then raise;end if;end;
 update workshop_v2_jobcards set vehicle_make='Stale',vehicle_model='Old',registration='Old',vehicle_year=1999 where job_card=r.job_card;
 if not exists(select 1 from workshop_v2_jobcards where job_card=r.job_card and registration='QA-NEW' and vehicle_make='Nissan' and vehicle_year=2018) then raise exception 'direct projection reverted correction';end if;
 begin update workshop_v2_jobcards set job_card=job_card||'X' where job_card=r.job_card;raise exception 'projection relink accepted';exception when others then if sqlerrm<>'reception_linked_job_required' then raise;end if;end;
 select revision into rev from workshop_receptions where rc_no=r.rc_no;
 result:=zukait_reception_command(mgr,jsonb_build_object('operation','MOVE','rc_no',r.rc_no,'expected_revision',rev,'request_id',gen_random_uuid(),'location',case r.location when 'VWC' then 'VIW' else 'VWC' end,'reason','Confirmed physical movement'));
 if not exists(select 1 from workshop_state s,jsonb_array_elements(s.data->'jobs') j where j->>'no'=r.job_card and j->>'receptionLocation'=result->'record'->>'location' and j->>'status'=job->>'status' and j->'delivered' is not distinct from job->'delivered') then raise exception 'movement changed work/delivery status';end if;
 execute 'reset role';
 if (select jsonb_agg(to_jsonb(a) order by id) from workshop_reception_approvals a) is distinct from approval_before then raise exception 'approval evidence overwritten';end if;
 if (select jsonb_agg(to_jsonb(p) order by part_id) from workshop_v2_spare_part_state p) is distinct from parts_before then raise exception 'parts operations changed';end if;
 if (select jsonb_agg(to_jsonb(l)-'updated_at'-'updated_by'-'state_revision' order by employee_id) from workshop_live_status l) is distinct from live_before then raise exception 'technician live work changed';end if;
 if not exists(select 1 from workshop_reception_audit where rc_no=r.rc_no and operation='EDIT' and reason='Manager identity correction' and before_data->'details'->>'make'='Toyota' and after_data->'details'->>'make'='Nissan') then raise exception 'correction audit missing';end if;
end; $$;
drop trigger qa_vehicle_failure on public.workshop_v2_jobcards;
