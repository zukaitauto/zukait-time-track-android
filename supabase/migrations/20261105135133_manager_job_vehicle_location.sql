-- Full Edit vehicle location uses the same canonical Reception location as intake.
-- Ship with the matching workshop-api job_edit_rules.js; no records change on install.
begin;
alter function public.zukait_manager_full_job_edit(bigint,jsonb,text,text,text,jsonb)
 rename to zukait_manager_full_job_edit_before_location_v1;
create function public.zukait_manager_full_job_edit(p_expected_revision bigint,p_data jsonb,p_actor_id text,p_job_card text,p_reason text,p_live jsonb)
returns jsonb language plpgsql security invoker set search_path=public,pg_temp as $$
declare rc public.workshop_receptions; snapshot public.workshop_state; old_job jsonb; next_job jsonb;
 desired text; prior_location text; moved boolean:=false; result jsonb; next_live jsonb;
begin
 if not exists(select 1 from public.staff_credentials where user_id=p_actor_id and active and role='Manager') then raise exception 'reception_manager_required'; end if;
 if length(trim(coalesce(p_reason,''))) not between 1 and 2000 then raise exception 'reception_reason_required'; end if;
 -- Preserve the established Reception -> direct identity -> workshop state lock order.
 select * into rc from public.workshop_receptions where job_card=p_job_card for update;
 perform 1 from public.workshop_direct_job_identity where job_card=p_job_card for update;
 select * into snapshot from public.workshop_state where id='main' for update;
 if snapshot.revision is distinct from p_expected_revision then return jsonb_build_object('ok',false,'code','conflict'); end if;
 select x into old_job from jsonb_array_elements(snapshot.data->'jobs') x where x->>'no'=p_job_card;
 select x into next_job from jsonb_array_elements(p_data->'jobs') x where x->>'no'=p_job_card;
 if old_job is null or next_job is null then raise exception 'reception_job_not_found'; end if;
 prior_location:=coalesce(rc.location,old_job->>'receptionLocation','VIW');
 desired:=coalesce(next_job->>'receptionLocation',prior_location);
 if desired not in ('VIW','VWC') then raise exception 'reception_vehicle_location_invalid'; end if;
 if desired<>prior_location then
  if coalesce((old_job->>'delivered')::boolean,false) or coalesce((old_job->>'cancelled')::boolean,false)
    or coalesce((old_job->>'archived')::boolean,false) or upper(coalesce(old_job->>'status','')) in ('DELIVERED','CANCELLED','ARCHIVED','DELETED')
    or rc.closed_at is not null or rc.released_date is not null or rc.outcome is not null then raise exception 'reception_vehicle_location_closed'; end if;
  if rc.rc_no is not null then
   if rc.repair_status='CTL' and desired='VWC' then raise exception 'reception_ctl_release_required'; end if;
   insert into public.workshop_reception_movements(rc_no,from_location,to_location,occurred_at,actor_id,reason)
    values(rc.rc_no,rc.location,desired,now(),p_actor_id,trim(p_reason));
   update public.workshop_receptions set location=desired,updated_by=p_actor_id where rc_no=rc.rc_no;
   insert into public.workshop_reception_audit(rc_no,operation,actor_id,before_data,after_data,reason)
    select rc.rc_no,'MOVE',p_actor_id,to_jsonb(rc),to_jsonb(r),trim(p_reason) from public.workshop_receptions r where r.rc_no=rc.rc_no;
   moved:=true;
  end if;
 end if;
 -- Reception's existing projection trigger may have advanced the state revision.
 select * into snapshot from public.workshop_state where id='main';
 select coalesce(jsonb_agg(x||jsonb_build_object('state_revision',snapshot.revision+1)),'[]') into next_live from jsonb_array_elements(coalesce(p_live,'[]')) x;
 result:=public.zukait_manager_full_job_edit_before_location_v1(snapshot.revision,p_data,p_actor_id,p_job_card,p_reason,next_live);
 -- A failed edit must roll back its location movement and audit as well.
 if moved and not coalesce((result->>'ok')::boolean,false) then raise exception 'reception_full_edit_commit_failed'; end if;
 return result;
end $$;
revoke all on function public.zukait_manager_full_job_edit(bigint,jsonb,text,text,text,jsonb),public.zukait_manager_full_job_edit_before_location_v1(bigint,jsonb,text,text,text,jsonb) from public,anon,authenticated;
grant execute on function public.zukait_manager_full_job_edit(bigint,jsonb,text,text,text,jsonb),public.zukait_manager_full_job_edit_before_location_v1(bigint,jsonb,text,text,text,jsonb) to service_role;
commit;
