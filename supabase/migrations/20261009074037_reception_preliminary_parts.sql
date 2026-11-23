begin;
-- Preparation only: no Job Card, operational PL number, purchase or expense.
create table public.workshop_reception_preliminary_parts (
  rc_no text primary key references public.workshop_receptions(rc_no),
  items jsonb not null default '[]' check(jsonb_typeof(items)='array'),
  updated_at timestamptz not null default now(),
  updated_by text not null references public.staff_credentials(user_id)
);
alter table public.workshop_reception_preliminary_parts enable row level security;
revoke all on public.workshop_reception_preliminary_parts from public,anon,authenticated,service_role;
grant select,insert,update on public.workshop_reception_preliminary_parts to service_role;

-- Keep the verified Phase 1 transitions intact behind a small INVOKER dispatcher.
alter function public.zukait_reception_command(text,jsonb) rename to zukait_reception_phase1_command;
create function public.zukait_reception_command(p_actor_id text,p_command jsonb)
returns jsonb language plpgsql security invoker set search_path=public,pg_temp as $$
declare
  v_op text:=p_command->>'operation'; v_role text;
  v_rc public.workshop_receptions%rowtype;
  v_cached public.workshop_reception_commands%rowtype;
  v_request uuid; v_items jsonb; v_normalized jsonb:='[]'; v_item jsonb;
  v_before jsonb; v_result jsonb; v_reason text:=trim(coalesce(p_command->>'reason',''));
begin
  if v_op is null then raise exception 'reception_invalid_operation'; end if;
  if v_op is distinct from 'SAVE_PARTS' then
    v_result:=public.zukait_reception_phase1_command(p_actor_id,p_command);
    if v_op='GET' then
      select role into v_role from public.staff_credentials where user_id=p_actor_id and active;
      return v_result||jsonb_build_object('preliminary_parts',jsonb_build_object(
        'items',coalesce((select items from public.workshop_reception_preliminary_parts where rc_no=p_command->>'rc_no'),'[]'),
        'can_edit',v_role in ('Manager','Supervisor') and v_result->'record'->>'outcome' is null and v_result->'record'->>'job_card' is null));
    end if;
    return v_result;
  end if;
  select role into v_role from public.staff_credentials where user_id=p_actor_id and active;
  if v_role is null or v_role not in ('Manager','Supervisor') then raise exception 'reception_preliminary_forbidden'; end if;
  if exists(select 1 from jsonb_object_keys(p_command) k where k not in ('operation','rc_no','expected_revision','request_id','items','reason')) then raise exception 'reception_invalid_fields'; end if;
  if coalesce(p_command->>'request_id','') !~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' then raise exception 'reception_request_required'; end if;
  v_request:=(p_command->>'request_id')::uuid;
  perform pg_advisory_xact_lock(hashtextextended(v_request::text,0));
  select * into v_cached from public.workshop_reception_commands where request_id=v_request;
  if found then
    if v_cached.actor_id<>p_actor_id or v_cached.command<>p_command then raise exception 'reception_request_conflict'; end if;
    return v_cached.result||'{"duplicate":true}'::jsonb;
  end if;
  select * into v_rc from public.workshop_receptions where rc_no=p_command->>'rc_no' for update;
  if not found then raise exception 'reception_not_found'; end if;
  if coalesce(p_command->>'expected_revision','') !~ '^[0-9]+$' then raise exception 'reception_stale_revision'; end if;
  if (p_command->>'expected_revision')::numeric<>v_rc.revision then raise exception 'reception_stale_revision'; end if;
  if v_rc.outcome is not null then raise exception 'reception_case_closed'; end if;
  if v_rc.job_card is not null then raise exception 'reception_preliminary_already_linked'; end if;
  if length(v_reason) not between 1 and 2000 then raise exception 'reception_reason_required'; end if;
  v_items:=p_command->'items';
  if jsonb_typeof(v_items) is distinct from 'array' then raise exception 'reception_invalid_parts'; end if;
  if jsonb_array_length(v_items)>200 or length(v_items::text)>18000 then raise exception 'reception_invalid_parts'; end if;
  for v_item in select value from jsonb_array_elements(v_items) loop
    if jsonb_typeof(v_item)<>'object' then raise exception 'reception_invalid_parts'; end if;
    if exists(select 1 from jsonb_object_keys(v_item) k where k not in ('id','name','part_no','qty')) then raise exception 'reception_invalid_parts'; end if;
    if jsonb_typeof(v_item->'id') is distinct from 'string' or coalesce(v_item->>'id','') !~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
       or jsonb_typeof(v_item->'name') is distinct from 'string' or length(trim(regexp_replace(coalesce(v_item->>'name',''),'\s+',' ','g'))) not between 1 and 200
       or (v_item ? 'part_no' and (jsonb_typeof(v_item->'part_no')<>'string' or length(v_item->>'part_no')>100))
       or jsonb_typeof(v_item->'qty') is distinct from 'number' or coalesce(v_item->>'qty','') !~ '^[0-9]+$' then raise exception 'reception_invalid_parts'; end if;
    if (v_item->>'qty')::numeric not between 1 and 100000 then raise exception 'reception_invalid_parts'; end if;
    v_normalized:=v_normalized||jsonb_build_array(jsonb_build_object('id',lower(v_item->>'id'),'name',trim(regexp_replace(v_item->>'name','\s+',' ','g')),'part_no',trim(regexp_replace(coalesce(v_item->>'part_no',''),'\s+',' ','g')),'qty',(v_item->>'qty')::integer));
  end loop;
  if exists(select 1 from jsonb_array_elements(v_normalized) i group by i->>'id' having count(*)>1)
    or exists(select 1 from jsonb_array_elements(v_normalized) i group by lower(regexp_replace(i->>'name','\s+',' ','g')),lower(regexp_replace(i->>'part_no','\s+',' ','g')) having count(*)>1) then raise exception 'reception_duplicate_parts'; end if;
  select items into v_before from public.workshop_reception_preliminary_parts where rc_no=v_rc.rc_no;
  insert into public.workshop_reception_preliminary_parts(rc_no,items,updated_by) values(v_rc.rc_no,v_normalized,p_actor_id)
    on conflict(rc_no) do update set items=excluded.items,updated_by=excluded.updated_by,updated_at=now();
  update public.workshop_receptions set revision=revision+1,updated_by=p_actor_id,updated_at=now() where rc_no=v_rc.rc_no returning * into v_rc;
  insert into public.workshop_reception_audit(rc_no,operation,actor_id,before_data,after_data,reason)
    values(v_rc.rc_no,'SAVE_PARTS',p_actor_id,jsonb_build_object('items',coalesce(v_before,'[]'),'revision',v_rc.revision-1),jsonb_build_object('items',v_normalized,'revision',v_rc.revision),v_reason);
  v_result:=jsonb_build_object('ok',true,'record',to_jsonb(v_rc),'preliminary_parts',jsonb_build_object('items',v_normalized));
  insert into public.workshop_reception_commands(request_id,actor_id,command,result) values(v_request,p_actor_id,p_command,v_result);
  return v_result;
end; $$;
revoke all on function public.zukait_reception_command(text,jsonb) from public,anon,authenticated;
grant execute on function public.zukait_reception_command(text,jsonb) to service_role;
commit;
