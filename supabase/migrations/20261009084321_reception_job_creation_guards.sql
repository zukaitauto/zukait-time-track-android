begin;

-- This guard is preparation for the atomic RC creation command. Until that
-- command exists, new insurance jobs fail closed through the legacy paths.
create function public.zukait_reception_job_approval_valid(p_job text, p_rc text, p_data jsonb default null)
returns boolean language sql stable security invoker set search_path=public as $$
 select exists (
  select 1 from public.workshop_receptions r
  join lateral (select * from public.workshop_reception_approvals a
                where a.rc_no=r.rc_no order by a.id desc limit 1) a on true
  join public.workshop_reception_estimates q on q.id=a.quotation_id and q.rc_no=r.rc_no
  join public.workshop_state s on s.id='main'
  where r.rc_no=p_rc and r.job_card=p_job and r.approval_status='APPROVED' and r.outcome is null
    and a.identity_snapshot=public.zukait_reception_identity(r.details,r.insurance_id)
    and q.identity_snapshot=a.identity_snapshot and q.snapshot=a.estimate_snapshot
    and a.parts_snapshot=coalesce((select items from public.workshop_reception_preliminary_parts where rc_no=r.rc_no),'[]'::jsonb)
    and (select count(*) from jsonb_array_elements(coalesce(coalesce(p_data,s.data)->'estimates','[]'::jsonb)) e where e->>'id'=q.estimate_id)=1
    and exists(select 1 from jsonb_array_elements(coalesce(coalesce(p_data,s.data)->'estimates','[]'::jsonb)) e where e->>'id'=q.estimate_id and e=a.estimate_snapshot)
 );
$$;

create function public.zukait_reception_guard_job_creation()
returns trigger language plpgsql security invoker set search_path=public as $$
declare j jsonb; previous jsonb; prior_data jsonb:='{}'; job_no text;
begin
 if tg_table_name='workshop_v2_events' then
  if new.event_type<>'JOB_CREATED' or upper(coalesce(new.payload->>'jobType',''))<>'INSURANCE' then return new; end if;
  job_no:=coalesce(nullif(new.payload->>'jobCard',''),new.entity_id);
  if not public.zukait_reception_job_approval_valid(job_no,new.payload->>'receptionNo') then
   raise exception 'insurance_job_requires_approved_reception';
  end if;
  return new;
 end if;
 if new.id<>'main' then return new; end if;
 if tg_op='UPDATE' then prior_data:=old.data; end if;
 for j in select value from jsonb_array_elements(coalesce(new.data->'jobs','[]'::jsonb)) loop
  if upper(coalesce(j->>'jobType',''))<>'INSURANCE' then continue; end if;
  job_no:=j->>'no';
  select value into previous from jsonb_array_elements(coalesce(prior_data->'jobs','[]'::jsonb))
   where value->>'no'=job_no limit 1;
  -- Existing insurance jobs retain their historical workflow. Cash/credit jobs
  -- cannot be relabelled as insurance to bypass the reception requirement.
  if upper(coalesce(previous->>'jobType',''))='INSURANCE' then continue; end if;
  if not public.zukait_reception_job_approval_valid(job_no,j->>'receptionNo',new.data) then
   raise exception 'insurance_job_requires_approved_reception';
  end if;
 end loop;
 return new;
end;
$$;

revoke all on function public.zukait_reception_job_approval_valid(text,text,jsonb) from public,anon,authenticated;
revoke all on function public.zukait_reception_guard_job_creation() from public,anon,authenticated;
grant execute on function public.zukait_reception_job_approval_valid(text,text,jsonb) to service_role;
grant execute on function public.zukait_reception_guard_job_creation() to service_role;
create trigger workshop_reception_guard_state before insert or update of data on public.workshop_state
 for each row execute function public.zukait_reception_guard_job_creation();
create trigger workshop_reception_guard_event before insert on public.workshop_v2_events
 for each row execute function public.zukait_reception_guard_job_creation();

commit;
