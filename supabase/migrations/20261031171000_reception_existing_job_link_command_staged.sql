-- V377 staged authorized reconciliation. Not deployed to production.
-- The original checklist and direct JC audit row are deliberately preserved.
begin;
create or replace function public.zukait_reception_link_existing_job(p_actor_id text,p_command jsonb)
returns jsonb language plpgsql security invoker set search_path=public,pg_temp as $$
declare
 v_role text; v_rc public.workshop_receptions%rowtype; v_direct public.workshop_receptions%rowtype;
 v_snapshot public.workshop_state%rowtype; v_job jsonb; v_no text:=upper(btrim(coalesce(p_command->>'job_card','')));
 v_reason text:=btrim(coalesce(p_command->>'reason','')); v_request uuid; v_previous public.workshop_reception_existing_job_links%rowtype;
 v_result jsonb; v_reg text; v_job_reg text; v_vin text; v_job_vin text;
begin
 select role into v_role from public.staff_credentials where user_id=p_actor_id and active;
 if v_role not in ('Manager','Supervisor') and not exists(select 1 from public.workshop_reception_access where user_id=p_actor_id and active) then raise exception 'reception_forbidden'; end if;
 if p_command->>'operation'<>'LINK_EXISTING_JOB' or
    exists(select 1 from jsonb_object_keys(p_command) k where k not in ('operation','rc_no','job_card','expected_revision','request_id','reason','confirmed'))
 then raise exception 'reception_invalid_fields'; end if;
 if p_command->>'confirmed'<>'true' then raise exception 'reception_link_confirmation_required'; end if;
 if coalesce(p_command->>'request_id','') !~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' then raise exception 'reception_request_required'; end if;
 v_request:=(p_command->>'request_id')::uuid;
 if v_no !~ '^[A-Z0-9][A-Z0-9/-]{0,39}$' or length(v_reason) not between 1 and 2000 then raise exception 'reception_link_invalid_input'; end if;
 perform pg_advisory_xact_lock(hashtextextended('reception-link:'||v_no,0));
 perform pg_advisory_xact_lock(hashtextextended('reception-link-request:'||v_request::text,0));
 select * into v_previous from public.workshop_reception_existing_job_links where request_id=v_request;
 if found then
   if v_previous.rc_no<>p_command->>'rc_no' or v_previous.job_card<>v_no or v_previous.linked_by<>p_actor_id then raise exception 'reception_request_conflict'; end if;
   return jsonb_build_object('ok',true,'rc_no',v_previous.rc_no,'job_card',v_no,'duplicate',true);
 end if;
 select * into v_rc from public.workshop_receptions where rc_no=p_command->>'rc_no' for update;
 if not found then raise exception 'reception_not_found'; end if;
 if coalesce(v_rc.details->>'direct_job_only','false')='true' then raise exception 'reception_link_requires_checklist'; end if;
 if coalesce(p_command->>'expected_revision','') !~ '^[0-9]+$' or v_rc.revision<>(p_command->>'expected_revision')::bigint then raise exception 'reception_stale_revision'; end if;
 if v_rc.job_card is not null or v_rc.outcome is not null then raise exception 'reception_link_conflict'; end if;
 if exists(select 1 from public.workshop_reception_existing_job_links where rc_no=v_rc.rc_no or job_card=v_no) then raise exception 'reception_link_conflict'; end if;
 select * into v_snapshot from public.workshop_state where id='main' for update;
 if not found then raise exception 'reception_workshop_unavailable'; end if;
 select x into v_job from jsonb_array_elements(coalesce(v_snapshot.data->'jobs','[]'::jsonb)) x where upper(x->>'no')=v_no limit 1;
 if v_job is null then raise exception 'reception_job_not_found'; end if;
 if coalesce(v_job->>'deleted','false')='true' or coalesce(v_job->>'cancelled','false')='true' then raise exception 'reception_job_inactive'; end if;
 -- Reconcile only a genuinely direct JC, not a JC already attached to another real checklist.
 if nullif(btrim(coalesce(v_job->>'receptionNo','')),'') is not null then
   select * into v_direct from public.workshop_receptions where rc_no=v_job->>'receptionNo' for update;
   if not found or coalesce(v_direct.details->>'direct_job_only','false')<>'true' or upper(coalesce(v_direct.job_card,''))<>v_no
      then raise exception 'reception_job_already_linked'; end if;
 else
   select * into v_direct from public.workshop_receptions where upper(job_card)=v_no for update;
   if not found or coalesce(v_direct.details->>'direct_job_only','false')<>'true' then raise exception 'reception_job_already_linked'; end if;
 end if;
 if exists(select 1 from public.workshop_receptions where upper(job_card)=v_no and rc_no<>v_direct.rc_no) then raise exception 'reception_job_already_linked'; end if;
 v_reg:=upper(regexp_replace(coalesce(v_rc.details->>'registration',''),'[^A-Za-z0-9]','','g'));
 v_job_reg:=upper(regexp_replace(coalesce(v_job->>'reg',''),'[^A-Za-z0-9]','','g'));
 v_vin:=upper(regexp_replace(coalesce(v_rc.details->>'vin',''),'[^A-Za-z0-9]','','g'));
 v_job_vin:=upper(regexp_replace(coalesce(v_job->>'vin',''),'[^A-Za-z0-9]','','g'));
 if v_reg='' or v_job_reg='' or v_reg<>v_job_reg then raise exception 'reception_vehicle_mismatch'; end if;
 if v_vin<>'' and v_job_vin<>'' and v_vin<>v_job_vin then raise exception 'reception_vin_mismatch'; end if;
 if upper(btrim(coalesce(v_rc.details->>'make','')) )<>upper(btrim(coalesce(v_job->>'make',''))) or
    upper(btrim(coalesce(v_rc.details->>'model','')))<>upper(btrim(coalesce(v_job->>'model',''))) then raise exception 'reception_vehicle_mismatch'; end if;
 if upper(coalesce(v_job->>'jobType',''))='INSURANCE' and v_rc.approval_status<>'APPROVED' then raise exception 'reception_not_approved'; end if;
 -- Store the mapping independently: NEVER update JC sessions, amounts, or source audit row.
 insert into public.workshop_reception_existing_job_links
 (rc_no,job_card,direct_rc_no,request_id,linked_by,reason,audit_before,audit_after)
 values(v_rc.rc_no,v_no,v_direct.rc_no,v_request,p_actor_id,v_reason,
        jsonb_build_object('checklist',to_jsonb(v_rc),'direct_record',to_jsonb(v_direct),'job',v_job),
        jsonb_build_object('linked_rc',v_rc.rc_no,'job_card',v_no,'direct_rc',v_direct.rc_no));
 return jsonb_build_object('ok',true,'rc_no',v_rc.rc_no,'job_card',v_no);
end $$;
revoke all on function public.zukait_reception_link_existing_job(text,jsonb) from public,anon,authenticated,service_role;
grant execute on function public.zukait_reception_link_existing_job(text,jsonb) to service_role;
commit;
