begin;
-- Isolated from workshop_state: reception never creates, cancels or delivers a JC.
create table public.workshop_insurance_companies (
  id bigint generated always as identity primary key,
  name text not null unique check(length(trim(name)) between 1 and 120),
  active boolean not null default true
);
insert into public.workshop_insurance_companies(name) values
('Almadina Insurance'),('Liva Insurance'),('Oman Qatar Insurance'),('Oman United Insurance'),
('New India Insurance'),('SAICO'),('Muscat Insurance'),('Orient Insurance');
create table public.workshop_reception_access (
  user_id text primary key references public.staff_credentials(user_id),
  active boolean not null default true,
  granted_by text not null references public.staff_credentials(user_id),
  granted_at timestamptz not null default now()
);
create sequence public.workshop_reception_no_seq start 1 no cycle;
create table public.workshop_receptions (
  rc_no text primary key,
  sequence_no bigint not null unique,
  insurance_id bigint not null references public.workshop_insurance_companies(id),
  details jsonb not null check(jsonb_typeof(details)='object'),
  location text not null default 'VIW' check(location in ('VIW','VWC')),
  outcome text check(outcome in ('CTL','CASH_LOSS','CANCELLED')),
  approval_status text not null default 'WAITING' check(approval_status in ('WAITING','APPROVED')),
  job_card text unique,
  revision bigint not null default 1,
  received_at timestamptz not null default now(),
  created_by text not null references public.staff_credentials(user_id),
  updated_at timestamptz not null default now(),
  updated_by text not null references public.staff_credentials(user_id),
  closed_at timestamptz,
  decision jsonb,
  check(job_card is null or (approval_status='APPROVED' and outcome is null)),
  check((outcome is null) = (closed_at is null))
);
create table public.workshop_reception_movements (
  id bigint generated always as identity primary key,
  rc_no text not null references public.workshop_receptions(rc_no),
  from_location text,
  to_location text not null check(to_location in ('VIW','VWC')),
  occurred_at timestamptz not null,
  recorded_at timestamptz not null default now(),
  actor_id text not null references public.staff_credentials(user_id),
  reason text not null,
  expected_return_date date
);
create table public.workshop_reception_audit (
  id bigint generated always as identity primary key,
  rc_no text references public.workshop_receptions(rc_no),
  operation text not null,
  actor_id text not null references public.staff_credentials(user_id),
  at timestamptz not null default now(),
  before_data jsonb,
  after_data jsonb,
  reason text
);
create table public.workshop_reception_commands (
  request_id uuid primary key,
  actor_id text not null references public.staff_credentials(user_id),
  command jsonb not null,
  result jsonb not null,
  at timestamptz not null default now()
);
create index workshop_receptions_location_idx on public.workshop_receptions(location,sequence_no desc);
create index workshop_reception_movements_rc_idx on public.workshop_reception_movements(rc_no,id);
create index workshop_reception_audit_rc_idx on public.workshop_reception_audit(rc_no,id);

-- App uses custom staff sessions, not auth.uid(). Only the authenticated edge API
-- can execute this INVOKER RPC; it supplies the identity verified from staff_sessions.
create function public.zukait_reception_command(p_actor_id text,p_command jsonb)
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
        -- Shared identity corrections for a linked JC are implemented atomically
        -- by Phase 2. Fail closed rather than create conflicting vehicle copies.
        if v_old.job_card is not null then
          if exists(select 1 from unnest(array['make','model','registration','year','vin','claim','customer','contact']) k where v_details->k is distinct from v_old.details->k) or v_ins<>v_old.insurance_id then raise exception 'reception_linked_identity_requires_phase2'; end if;
        end if;
        update public.workshop_receptions set details=v_details,insurance_id=v_ins where rc_no=v_rc;
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
      update public.workshop_receptions set location=v_location where rc_no=v_rc;
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

alter table public.workshop_insurance_companies enable row level security;
alter table public.workshop_reception_access enable row level security;
alter table public.workshop_receptions enable row level security;
alter table public.workshop_reception_movements enable row level security;
alter table public.workshop_reception_audit enable row level security;
alter table public.workshop_reception_commands enable row level security;
revoke all on public.workshop_insurance_companies,public.workshop_reception_access,public.workshop_receptions,public.workshop_reception_movements,public.workshop_reception_audit,public.workshop_reception_commands from public,anon,authenticated;
revoke all on public.workshop_insurance_companies,public.workshop_reception_access,public.workshop_receptions,public.workshop_reception_movements,public.workshop_reception_audit,public.workshop_reception_commands from service_role;
grant select on public.workshop_insurance_companies to service_role;
grant select,insert,update on public.workshop_reception_access,public.workshop_receptions to service_role;
grant select,insert on public.workshop_reception_movements,public.workshop_reception_audit,public.workshop_reception_commands to service_role;
revoke all on sequence public.workshop_reception_no_seq,public.workshop_reception_movements_id_seq,public.workshop_reception_audit_id_seq from public,anon,authenticated;
grant usage,select on sequence public.workshop_reception_no_seq,public.workshop_reception_movements_id_seq,public.workshop_reception_audit_id_seq to service_role;
revoke all on function public.zukait_reception_command(text,jsonb) from public,anon,authenticated;
grant execute on function public.zukait_reception_command(text,jsonb) to service_role;
commit;
