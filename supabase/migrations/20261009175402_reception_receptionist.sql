-- Pending activation only. Filename generated with Supabase CLI 2.120.0 in
-- architecture-v2 workflow run 37969491834. Apply after all eight Phase 2 migrations.
begin;
alter table public.staff_credentials drop constraint if exists staff_credentials_role_check;
alter table public.staff_credentials add constraint staff_credentials_role_check
 check(role in ('Employee','Supervisor','Manager','Purchaser','Receptionist'));

-- Retain the tested creation/vehicle-authority bodies, locks, retry journal,
-- sequence handling and immutable approval checks. Refuse unexpected definition
-- drift instead of silently changing a different permission expression.
do $$
declare fn text; source text; target text:='(''Manager'',''Supervisor'')';
begin
 foreach fn in array array['zukait_reception_phase1_command','zukait_reception_vehicle_command'] loop
  source:=pg_get_functiondef(to_regprocedure('public.'||fn||'(text,jsonb)'));
  if source is null or (length(source)-length(replace(source,target,'')))/length(target)<>2 then
   raise exception 'reception_receptionist_dependency_mismatch: %',fn;
  end if;
  source:=replace(source,target,'(''Manager'',''Supervisor'',''Receptionist'')');
  if fn='zukait_reception_phase1_command' then
   source:=replace(source,
    'if v_role is null then raise exception ''reception_forbidden''; end if;',
    'if v_role is null then raise exception ''reception_forbidden''; end if;
     if v_role=''Receptionist'' and v_op not in (''CAPABILITIES'',''MASTER'',''LIST'',''GET'',''CREATE'',''EDIT'',''MOVE'') then
      raise exception ''reception_forbidden'';
     end if;');
  end if;
  execute source;
 end loop;
end $$;

alter function public.zukait_reception_command(text,jsonb) rename to zukait_reception_role_base_command;
create function public.zukait_reception_command(p_actor_id text,p_command jsonb)
returns jsonb language plpgsql security invoker set search_path=public,pg_temp as $$
declare actor_role text;
begin
 select role into actor_role from public.staff_credentials where user_id=p_actor_id and active;
 if actor_role is null then raise exception 'reception_forbidden'; end if;
 if actor_role='Receptionist' and (p_command->>'operation' is null or
    p_command->>'operation' not in ('CAPABILITIES','MASTER','LIST','GET','CREATE','EDIT','MOVE','CREATE_JOB')) then
  raise exception 'reception_forbidden';
 end if;
 return public.zukait_reception_role_base_command(p_actor_id,p_command);
end $$;
revoke execute on function public.zukait_reception_command(text,jsonb) from public,anon,authenticated;
grant execute on function public.zukait_reception_command(text,jsonb) to service_role;
commit;
