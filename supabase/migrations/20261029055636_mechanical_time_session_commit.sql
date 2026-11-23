-- Session-bound commit for the dedicated Mechanical time screen. No activation,
-- staff grants, job classification changes or business-data rewrite.
begin;
create function public.zukait_mechanical_time_commit(
 p_actor text,p_session_hash text,p_expected_revision bigint,p_assignment text,p_data jsonb,p_live jsonb
) returns jsonb language plpgsql security invoker set search_path=pg_catalog as $$
declare cfg zukait_mechanical.settings; staff_role text; ws jsonb; rev bigint;
 jc text; employee text; task uuid; item jsonb; candidate jsonb; audit jsonb; field text;
begin
 -- Hold the credential/session locks until the workshop commit completes.
 perform zukait_mechanical.authorize_session(p_actor,p_session_hash,'TASK_ASSIGN');
 select role into staff_role from public.staff_credentials where user_id=p_actor and active;
 if staff_role is distinct from 'Manager' and not (p_actor='SUP003' and staff_role in ('Supervisor','Mechanical Supervisor')) then raise exception 'mechanical_forbidden';end if;
 select * into cfg from zukait_mechanical.settings where singleton;
 perform 1 from zukait_mechanical.control where singleton for share;
 select l.employee_id,l.task_id,c.job_card into employee,task,jc
 from zukait_mechanical.links l join zukait_mechanical.tasks t on t.id=l.task_id
 join zukait_mechanical.checklists c on c.id=t.checklist_id where l.assignment_id::text=p_assignment;
 if jc is null then raise exception 'mechanical_time_job_required';end if;
 select data,revision into ws,rev from public.workshop_state where id='main' for update;
 if rev is distinct from p_expected_revision then return jsonb_build_object('ok',false,'code','conflict');end if;
 perform zukait_mechanical.assert_separate_job(ws,jc,cfg.department);
 if jsonb_typeof(p_data) is distinct from 'object' or jsonb_typeof(p_live) is distinct from 'array' then raise exception 'invalid_mechanical_time_change';end if;
 if exists(select 1 from jsonb_array_elements(coalesce(ws->'jobs','[]')) j where j->>'no'=jc and (coalesce((j->>'delivered')::boolean,false) or coalesce((j->>'archived')::boolean,false) or coalesce((j->>'deleted')::boolean,false) or coalesce((j->>'cancelled')::boolean,false))) then raise exception 'time_job_inactive';end if;
 if (p_data-array['jobs','assign','sessions','additionalActions','corrections','suggestedEdits','cancelledAssignments','reopenLogs','lastActions']) is distinct from (ws-array['jobs','assign','sessions','additionalActions','corrections','suggestedEdits','cancelledAssignments','reopenLogs','lastActions']) then raise exception 'mechanical_time_scope_conflict';end if;
 if jsonb_array_length(p_data->'jobs')<>jsonb_array_length(ws->'jobs') or jsonb_array_length(p_data->'assign')<>jsonb_array_length(ws->'assign') then raise exception 'mechanical_time_scope_conflict';end if;
 for item in select value from jsonb_array_elements(ws->'jobs') loop
  select value into candidate from jsonb_array_elements(p_data->'jobs') where value->>'no'=item->>'no';
  if candidate is null or (item->>'no'<>jc and candidate<>item) or (item->>'no'=jc and (candidate-array['status','completedAt'])<>(item-array['status','completedAt'])) then raise exception 'mechanical_time_scope_conflict';end if;
 end loop;
 for item in select value from jsonb_array_elements(ws->'assign') loop
  select value into candidate from jsonb_array_elements(p_data->'assign') where value->>'id'=item->>'id';
  if candidate is null or candidate->'id' is distinct from item->'id' or candidate->'job' is distinct from item->'job' or candidate->'emp' is distinct from item->'emp' then raise exception 'mechanical_time_scope_conflict';end if;
  if candidate<>item and (item->>'job'<>jc or not exists(select 1 from zukait_mechanical.links l where l.assignment_id::text=item->>'id' and l.task_id=task)) then raise exception 'mechanical_time_scope_conflict';end if;
 end loop;
 -- Keep every old interval, including cancellation evidence. New/changed
 -- intervals must belong to the selected Mechanical task's linked technicians.
 for item in select value from jsonb_array_elements(coalesce(ws->'sessions','[]')) loop
  if not exists(select 1 from jsonb_array_elements(coalesce(p_data->'sessions','[]')) s where s->>'id'=item->>'id') then raise exception 'mechanical_time_history_protected';end if;
 end loop;
 for candidate in select value from jsonb_array_elements(coalesce(p_data->'sessions','[]')) loop
  select value into item from jsonb_array_elements(coalesce(ws->'sessions','[]')) where value->>'id'=candidate->>'id';
  if candidate is distinct from item then
   if candidate->>'job' is distinct from jc or (item is not null and (candidate->'job' is distinct from item->'job' or candidate->'emp' is distinct from item->'emp' or candidate->'assignmentId' is distinct from item->'assignmentId')) or not exists(select 1 from zukait_mechanical.links l where l.task_id=task and l.employee_id=candidate->>'emp' and (candidate->>'assignmentId' is null or l.assignment_id::text=candidate->>'assignmentId')) then raise exception 'mechanical_time_scope_conflict';end if;
  end if;
 end loop;
 foreach field in array array['additionalActions','corrections','suggestedEdits','cancelledAssignments','reopenLogs'] loop
  if exists(select 1 from jsonb_array_elements(coalesce(ws->field,'[]')) with ordinality old(value,n) where (p_data->field)->(old.n::int-1) is distinct from old.value) then raise exception 'mechanical_time_history_protected';end if;
 end loop;
 if jsonb_array_length(coalesce(p_data->'additionalActions','[]'))<>jsonb_array_length(coalesce(ws->'additionalActions','[]'))+1 then raise exception 'mechanical_time_audit_required';end if;
 audit:=p_data->'additionalActions'->-1;
 if audit->>'by' is distinct from p_actor or audit->>'actorRole' is distinct from staff_role or audit->>'job' is distinct from jc or audit->>'assignmentId' is distinct from p_assignment or audit->>'source' is distinct from 'Mechanical Time Management' or length(trim(coalesce(audit->>'reason',''))) not between 1 and 500 then raise exception 'mechanical_time_audit_required';end if;
 -- Other technicians' last-action labels remain exactly as recorded.
 if (coalesce(p_data->'lastActions','{}')-employee) is distinct from (coalesce(ws->'lastActions','{}')-employee) then raise exception 'mechanical_time_scope_conflict';end if;
 return public.zukait_commit_workshop_state_v2(rev,p_data,p_actor,p_live);
end $$;
revoke all on function public.zukait_mechanical_time_commit(text,text,bigint,text,jsonb,jsonb) from public,anon,authenticated;
grant execute on function public.zukait_mechanical_time_commit(text,text,bigint,text,jsonb,jsonb) to service_role;
commit;
