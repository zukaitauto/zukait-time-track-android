begin;
-- Pending Phase 2 only. Depends on all four earlier migrations.
create or replace function public.zukait_reception_phase1_command(p_actor_id text,p_command jsonb)
returns jsonb language plpgsql security invoker set search_path=public as $$
declare
  v_role text; v_op text:=p_command->>'operation'; v_rc text:=p_command->>'rc_no';
  v_request uuid; v_old public.workshop_receptions; v_new public.workshop_receptions;
  v_cached public.workshop_reception_commands; v_details jsonb; v_result jsonb;
  v_seq bigint; v_ins bigint; v_reason text:=trim(coalesce(p_command->>'reason',''));
  v_location text; v_occurred timestamptz; v_expected date; v_filter text; v_q text;
  v_before jsonb; v_target text; v_active boolean;
begin
  select role into v_role from public.staff_credentials where user_id=p_actor_id and active;
  if v_role is null then raise exception 'reception_forbidden'; end if;
  if v_op='CAPABILITIES' then
    return jsonb_build_object('ok',true,'allowed',v_role in ('Manager','Supervisor') or exists(select 1 from public.workshop_reception_access where user_id=p_actor_id and active),'manager',v_role='Manager');
  end if;
  if v_role not in ('Manager','Supervisor') and not exists(select 1 from public.workshop_reception_access where user_id=p_actor_id and active) then
    raise exception 'reception_forbidden';
  end if;
  if v_op='MASTER' then
    return jsonb_build_object('ok',true,'companies',(select coalesce(jsonb_agg(to_jsonb(c) order by name),'[]') from public.workshop_insurance_companies c where active));
  end if;
  if v_op='STAFF' then
    if v_role<>'Manager' then raise exception 'reception_manager_required'; end if;
    return jsonb_build_object('ok',true,'staff',(select coalesce(jsonb_agg(jsonb_build_object('id',s.user_id,'name',s.display_name,'role',s.role,'designated',coalesce(a.active,false)) order by s.display_name),'[]') from public.staff_credentials s left join public.workshop_reception_access a on a.user_id=s.user_id where s.active));
  end if;
  if v_op='LIST' then
    v_filter:=coalesce(p_command->>'filter','ALL'); v_q:=lower(trim(coalesce(p_command->>'search','')));
    if v_filter not in ('ALL','WAITING','APPROVED','VIW','VWC','CTL','CASH_LOSS','CANCELLED','JOB_CREATED') then raise exception 'reception_invalid_filter'; end if;
    return jsonb_build_object('ok',true,'rows',(select coalesce(jsonb_agg(to_jsonb(x) order by x.sequence_no desc),'[]') from (
      select r.*,c.name insurance_company from public.workshop_receptions r join public.workshop_insurance_companies c on c.id=r.insurance_id
      where (nullif(p_command->>'before_sequence','') is null or r.sequence_no<(p_command->>'before_sequence')::bigint)
      and (v_filter='ALL' or r.location=v_filter or r.outcome=v_filter or (v_filter in ('WAITING','APPROVED') and r.approval_status=v_filter and r.outcome is null and r.job_card is null) or (v_filter='JOB_CREATED' and r.job_card is not null))
      and (v_q='' or strpos(lower(concat_ws(' ',r.rc_no,r.details->>'registration',r.details->>'customer',r.details->>'vin',c.name)),v_q)>0)
      order by r.sequence_no desc limit 100) x));
  end if;
  if v_op='GET' then
    select * into v_new from public.workshop_receptions where rc_no=v_rc;
    if not found then raise exception 'reception_not_found'; end if;
    return jsonb_build_object('ok',true,'record',to_jsonb(v_new)||jsonb_build_object('insurance_company',(select name from public.workshop_insurance_companies where id=v_new.insurance_id),'can_edit',v_new.job_card is null or v_role='Manager'),
      'movements',(select coalesce(jsonb_agg(to_jsonb(m) order by id desc),'[]') from public.workshop_reception_movements m where rc_no=v_rc),
      'audit',(select coalesce(jsonb_agg(to_jsonb(a) order by id desc),'[]') from public.workshop_reception_audit a where rc_no=v_rc));
  end if;
  if v_op not in ('CREATE','EDIT','MOVE','CLOSE','ACCESS') then raise exception 'reception_invalid_operation'; end if;
  v_request:=(p_command->>'request_id')::uuid;
  if v_request is null then raise exception 'reception_request_required'; end if;
  -- Serialize retries of the same request before consuming a number or writing.
  perform pg_advisory_xact_lock(hashtextextended(v_request::text,0));
  select * into v_cached from public.workshop_reception_commands where request_id=v_request;
  if found then
    if v_cached.actor_id<>p_actor_id or v_cached.command<>p_command then raise exception 'reception_request_conflict'; end if;
    return v_cached.result||'{"duplicate":true}'::jsonb;
  end if;
  if v_op='ACCESS' then
    if v_role<>'Manager' then raise exception 'reception_manager_required'; end if;
    v_target:=p_command->>'user_id'; v_active:=(p_command->>'active')::boolean;
    if v_active is null or not exists(select 1 from public.staff_credentials where user_id=v_target and active) then raise exception 'reception_invalid_staff'; end if;
    select to_jsonb(a) into v_before from public.workshop_reception_access a where user_id=v_target for update;
    insert into public.workshop_reception_access(user_id,active,granted_by) values(v_target,v_active,p_actor_id)
    on conflict(user_id) do update set active=excluded.active,granted_by=excluded.granted_by,granted_at=now();
    insert into public.workshop_reception_audit(operation,actor_id,before_data,after_data) values(v_op,p_actor_id,v_before,jsonb_build_object('user_id',v_target,'active',v_active));
    v_result:='{"ok":true}'::jsonb;
  else
    if v_op<>'CREATE' then
      select * into v_old from public.workshop_receptions where rc_no=v_rc for update;
      if not found then raise exception 'reception_not_found'; end if;
      if (p_command->>'expected_revision')::bigint is distinct from v_old.revision then raise exception 'reception_stale_revision'; end if;
      if v_op='EDIT' and v_old.job_card is not null and v_role<>'Manager' then raise exception 'reception_manager_required'; end if;
      if v_old.outcome is not null and v_op<>'EDIT' then raise exception 'reception_case_closed'; end if;
    end if;
    if v_op in ('CREATE','EDIT') then
      v_details:=p_command->'details'; v_ins:=(p_command->>'insurance_id')::bigint;
      if jsonb_typeof(v_details) is distinct from 'object' or length(v_details::text)>18000 then raise exception 'reception_invalid_details'; end if;
      if exists(select 1 from jsonb_object_keys(v_details) k where k not in ('make','model','customer','contact','registration','year','vin','odometer','odometer_unit','claim','damage','tools','other_accessories','fuel','warnings','remarks')) then raise exception 'reception_invalid_fields'; end if;
      if exists(select 1 from jsonb_each(v_details) e where e.key<>'tools' and (jsonb_typeof(e.value)<>'string' or length(e.value#>>'{}')>2000)) then raise exception 'reception_invalid_fields'; end if;
      if nullif(trim(v_details->>'make'),'') is null or nullif(trim(v_details->>'model'),'') is null then raise exception 'reception_vehicle_required'; end if;
      if not exists(select 1 from public.workshop_insurance_companies where id=v_ins and (active or (v_op='EDIT' and id=v_old.insurance_id))) then raise exception 'reception_insurance_required'; end if;
      if coalesce(v_details->>'odometer_unit','KM') not in ('KM','Miles') then raise exception 'reception_invalid_unit'; end if;
      if coalesce(v_details->>'odometer','')<>'' and (v_details->>'odometer') !~ '^[0-9]{1,10}([.][0-9]{1,2})?$' then raise exception 'reception_invalid_odometer'; end if;
      if coalesce(v_details->>'year','')<>'' and (v_details->>'year') !~ '^[0-9]{4}$' then raise exception 'reception_invalid_year'; end if;
      if coalesce(v_details->>'fuel','') not in ('','Empty','Quarter','Half','Three quarters','Full') then raise exception 'reception_invalid_fuel'; end if;
      if v_details ? 'tools' then
        if jsonb_typeof(v_details->'tools')<>'array' then raise exception 'reception_invalid_tools'; end if;
        if exists(select 1 from jsonb_array_elements_text(v_details->'tools') t where t not in ('spare_tyre','jack','wheel_spanner','tool_kit','spare_key','warning_triangle','first_aid_kit','floor_mats','other')) then raise exception 'reception_invalid_tools'; end if;
        if jsonb_array_length(v_details->'tools')<>(select count(distinct t) from jsonb_array_elements_text(v_details->'tools') t) then raise exception 'reception_invalid_tools'; end if;
      end if;
      v_details:=v_details||jsonb_build_object('make',trim(v_details->>'make'),'model',trim(v_details->>'model'),'registration',upper(trim(coalesce(v_details->>'registration',''))),'vin',upper(trim(coalesce(v_details->>'vin',''))));
      if v_op='CREATE' then
        v_seq:=nextval('public.workshop_reception_no_seq');
        v_rc:='RC'||lpad(v_seq::text,greatest(4,length(v_seq::text)),'0');
        insert into public.workshop_receptions(rc_no,sequence_no,insurance_id,details,created_by,updated_by) values(v_rc,v_seq,v_ins,v_details,p_actor_id,p_actor_id);
        insert into public.workshop_reception_movements(rc_no,to_location,occurred_at,actor_id,reason) values(v_rc,'VIW',now(),p_actor_id,'Vehicle received at workshop');
      else
        if v_old.job_card is not null then
          if length(v_reason) not between 1 and 2000 then raise exception 'reception_reason_required'; end if;
          -- RC first, shared state second, projections last. Also serialize
          -- observation-only edits with snapshot writers.
          perform 1 from public.workshop_state where id='main' for update;
        end if;
        update public.workshop_receptions set details=v_details,insurance_id=v_ins,updated_by=p_actor_id where rc_no=v_rc;
      end if;
    elsif v_op='MOVE' then
      v_location:=p_command->>'location';
      if v_location not in ('VIW','VWC') or v_location is null or v_location=v_old.location then raise exception 'reception_invalid_movement'; end if;
      if length(v_reason) not between 1 and 2000 then raise exception 'reception_reason_required'; end if;
      v_occurred:=coalesce(nullif(p_command->>'occurred_at','')::timestamptz,now());
      v_expected:=nullif(p_command->>'expected_return_date','')::date;
      if v_occurred>now()+interval '5 minutes' or v_occurred<(select max(occurred_at) from public.workshop_reception_movements where rc_no=v_rc) then raise exception 'reception_invalid_movement_date'; end if;
      if v_expected is not null and (v_location<>'VWC' or v_expected<(v_occurred at time zone 'Asia/Muscat')::date) then raise exception 'reception_invalid_return_date'; end if;
      insert into public.workshop_reception_movements(rc_no,from_location,to_location,occurred_at,actor_id,reason,expected_return_date) values(v_rc,v_old.location,v_location,v_occurred,p_actor_id,v_reason,v_expected);
      update public.workshop_receptions set location=v_location,updated_by=p_actor_id where rc_no=v_rc;
    elsif v_op='CLOSE' then
      if v_old.job_card is not null then raise exception 'reception_job_cancellation_requires_phase2'; end if;
      if p_command->>'outcome' not in ('CTL','CASH_LOSS','CANCELLED') or p_command->>'outcome' is null then raise exception 'reception_invalid_outcome'; end if;
      if length(v_reason) not between 1 and 2000 then raise exception 'reception_reason_required'; end if;
      if p_command->>'outcome' in ('CTL','CASH_LOSS') and (v_old.location<>'VWC' or nullif(trim(p_command->>'handover_to'),'') is null) then raise exception 'reception_handover_required'; end if;
      if length(coalesce(p_command->>'handover_to',''))>200 then raise exception 'reception_invalid_handover'; end if;
      update public.workshop_receptions set outcome=p_command->>'outcome',closed_at=now(),decision=jsonb_build_object('reason',v_reason,'handover_to',p_command->>'handover_to','at',now(),'by',p_actor_id) where rc_no=v_rc;
    end if;
    if v_op<>'CREATE' then update public.workshop_receptions set revision=revision+1,updated_at=now(),updated_by=p_actor_id where rc_no=v_rc; end if;
    select * into v_new from public.workshop_receptions where rc_no=v_rc;
    insert into public.workshop_reception_audit(rc_no,operation,actor_id,before_data,after_data,reason) values(v_rc,v_op,p_actor_id,case when v_op='CREATE' then null else to_jsonb(v_old) end,to_jsonb(v_new),v_reason);
    v_result:=jsonb_build_object('ok',true,'record',to_jsonb(v_new));
  end if;
  insert into public.workshop_reception_commands(request_id,actor_id,command,result) values(v_request,p_actor_id,p_command,v_result);
  return v_result;
end; $$;


-- One RC identity, materialized into the established job master; no new vehicle.
create function public.zukait_reception_job_identity(r public.workshop_receptions)
returns jsonb language sql stable security invoker set search_path=public as $$
 select jsonb_build_object('receptionNo',r.rc_no,'receptionLocation',r.location,
 'make',r.details->>'make','model',r.details->>'model','brand',r.details->>'make',
 'vehicle',trim((r.details->>'make')||' '||(r.details->>'model')),
 'year',coalesce(r.details->>'year',''),'reg',coalesce(r.details->>'registration',''),
 'vin',coalesce(r.details->>'vin',''),'claimNo',coalesce(r.details->>'claim',''),
 'customerName',coalesce(r.details->>'customer',''),'customer',coalesce(r.details->>'customer',''),
 'mobile',coalesce(r.details->>'contact',''),'jobType','INSURANCE',
 'insuranceCompany',c.name,'insurance',c.name)
 from public.workshop_insurance_companies c where c.id=r.insurance_id;
$$;

create function public.zukait_reception_vehicle_state_guard()
returns trigger language plpgsql security invoker set search_path=public as $$
declare r public.workshop_receptions; master jsonb; quotes jsonb;
begin
 if new.id<>'main' then return new; end if;
 for r in select * from public.workshop_receptions where job_card is not null loop
  -- Do not let a stale full-state save unlink or remove a linked job.
  if (select count(*) from jsonb_array_elements(coalesce(new.data->'jobs','[]')) j where j->>'no'=r.job_card)<>1
   then raise exception 'reception_linked_job_required'; end if;
  master:=public.zukait_reception_job_identity(r);
  new.data:=jsonb_set(new.data,'{jobs}',(select jsonb_agg(case when j->>'no'=r.job_card then
   -- Remove legacy aliases so blank corrections cannot reveal stale fallback values.
   (j-array['vehicleMake','vehicleModel','modelYear','vehicleYear','model_year','vehicle_year','registration','registrationNo','registration_no','VIN','vinNumber','chassis','chassisNo','claimNumber','claim_no','claim','name','phone','customerMobile','insurance_company','job_type'])||master else j end order by n)
   from jsonb_array_elements(new.data->'jobs') with ordinality a(j,n)));
  if exists(select 1 from public.workshop_reception_estimates q where q.rc_no=r.rc_no and (select count(*) from jsonb_array_elements(coalesce(new.data->'estimates','[]')) e where e->>'id'=q.estimate_id)<>1)
    then raise exception 'reception_linked_estimate_required'; end if;
  if new.data ? 'estimates' and tg_op='UPDATE' and exists(select 1 from jsonb_array_elements(coalesce(old.data->'jobs','[]')) j where j->>'no'=r.job_card) then
   select coalesce(jsonb_agg(case when e->>'jobCard'=r.job_card or exists(
     select 1 from public.workshop_reception_estimates q where q.rc_no=r.rc_no and q.estimate_id=e->>'id') then
     e||coalesce((select jsonb_object_agg(k,v) from jsonb_each(jsonb_build_object('receptionNo',r.rc_no,'customerName',master->>'customerName','mobile',master->>'mobile',
      'makeModel',master->>'vehicle','year',master->>'year','registration',master->>'reg',
      'vin',master->>'vin','claimNo',master->>'claimNo','insuranceCompany',master->>'insuranceCompany')) kv(k,v)
      where e ? k or exists(select 1 from public.workshop_reception_estimates q where q.rc_no=r.rc_no and q.estimate_id=e->>'id' and q.identity_snapshot is distinct from public.zukait_reception_identity(r.details,r.insurance_id))),'{}'::jsonb)
     else e end order by n),'[]') into quotes from jsonb_array_elements(new.data->'estimates') with ordinality a(e,n);
   new.data:=jsonb_set(new.data,'{estimates}',quotes);
  end if;
 end loop;
 return new;
end; $$;
-- Alphabetically before the creation guard and live-status trigger.
create trigger aa_reception_vehicle_state before insert or update of data on public.workshop_state
 for each row execute function public.zukait_reception_vehicle_state_guard();

create function public.zukait_reception_vehicle_projection_guard()
returns trigger language plpgsql security invoker set search_path=public as $$
declare r public.workshop_receptions;
begin
 if tg_op='UPDATE' and new.job_card is distinct from old.job_card and exists(select 1 from public.workshop_receptions where job_card=old.job_card) then raise exception 'reception_linked_job_required'; end if;
 select * into r from public.workshop_receptions where job_card=new.job_card;
 if found then
  new.registration:=coalesce(r.details->>'registration','');
  new.vehicle_make:=r.details->>'make';new.vehicle_model:=r.details->>'model';
  new.vehicle_year:=nullif(r.details->>'year','')::integer;
 end if;
 return new;
end; $$;
create trigger aa_reception_vehicle_projection before insert or update on public.workshop_v2_jobcards
 for each row execute function public.zukait_reception_vehicle_projection_guard();

create function public.zukait_reception_vehicle_changed()
returns trigger language plpgsql security invoker set search_path=public as $$
declare s public.workshop_state;
begin
 if new.job_card is null then return new; end if;
 -- CREATE_JOB itself creates the state job; its first link update is skipped.
 if old.job_card is null then return new; end if;
 if public.zukait_reception_identity(new.details,new.insurance_id)=public.zukait_reception_identity(old.details,old.insurance_id) and new.location=old.location then return new; end if;
 select * into s from public.workshop_state where id='main' for update;
 if not found then raise exception 'reception_workshop_unavailable'; end if;
 insert into public.workshop_state_history(revision,data,updated_at,updated_by)
 values(s.revision,s.data,s.updated_at,s.updated_by) on conflict(revision) do nothing;
 -- BEFORE state trigger overlays only identity/location, retaining work/finances.
 update public.workshop_state set data=s.data,revision=s.revision+1,updated_at=now(),updated_by=new.updated_by where id='main';
 update public.workshop_v2_jobcards set registration=coalesce(new.details->>'registration',''),
  vehicle_make=new.details->>'make',vehicle_model=new.details->>'model',vehicle_year=nullif(new.details->>'year','')::integer,
  updated_at=now() where job_card=new.job_card;
 return new;
end; $$;
create trigger reception_vehicle_changed after update on public.workshop_receptions
 for each row execute function public.zukait_reception_vehicle_changed();

revoke all on function public.zukait_reception_job_identity(public.workshop_receptions),
 public.zukait_reception_vehicle_state_guard(),public.zukait_reception_vehicle_projection_guard(),
 public.zukait_reception_vehicle_changed() from public,anon,authenticated;
grant execute on function public.zukait_reception_job_identity(public.workshop_receptions),
 public.zukait_reception_vehicle_state_guard(),public.zukait_reception_vehicle_projection_guard(),
 public.zukait_reception_vehicle_changed() to service_role;
commit;
