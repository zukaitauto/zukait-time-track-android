-- Optional estimates on all Job Card types. Creation, receipts and amount are one transaction.
-- Staged only; production activation requires isolated acceptance.
begin;
alter function public.zukait_reception_command(text,jsonb) rename to zukait_reception_cash_base_command;
create function public.zukait_reception_command(p_actor_id text,p_command jsonb)
returns jsonb language plpgsql security definer set search_path=public,pg_temp as $$
declare
 actor_role text; request uuid; cached public.workshop_reception_commands;
 cash_result jsonb; rc public.workshop_receptions; snapshot public.workshop_state; job_no text; jobs jsonb; amount numeric;
begin
 select role into actor_role from public.staff_credentials where user_id=p_actor_id and active;
 if actor_role is null then raise exception 'reception_forbidden'; end if;
 if p_command->>'operation'='EDIT' and actor_role<>'Manager' then
  select * into rc from public.workshop_receptions where rc_no=p_command->>'rc_no' for update;
  if rc.job_card is not null then
   select * into snapshot from public.workshop_state where id='main' for update;
   if exists(select 1 from jsonb_array_elements(snapshot.data->'jobs') j where j->>'no'=rc.job_card and coalesce((j->>'delivered')::boolean,false)) then raise exception 'reception_manager_required'; end if;
  end if;
 end if;
 if not (p_command ? 'cash_amount') then return public.zukait_reception_cash_base_command(p_actor_id,p_command); end if;
 if actor_role not in ('Manager','Supervisor','Receptionist') or coalesce(p_command->>'operation','') not in ('CREATE_JOB','CREATE_DIRECT_JOB','CREATE_EXTERNAL_JOB') then raise exception 'reception_job_forbidden'; end if;
 if p_command->'cash_amount'<>'null'::jsonb and jsonb_typeof(p_command->'cash_amount') not in ('string','number') then raise exception 'reception_invalid_amount'; end if;
 if coalesce(p_command->>'cash_amount','')<>'' then
  if (p_command->>'cash_amount') !~ '^[0-9]+([.][0-9]{1,3})?$' or length(p_command->>'cash_amount')>20 then raise exception 'reception_invalid_amount'; end if;
  amount:=(p_command->>'cash_amount')::numeric;
  if amount<0 or amount>1000000 then raise exception 'reception_invalid_amount'; end if;
 end if;
 if coalesce(p_command->>'request_id','') !~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' then raise exception 'reception_request_required'; end if;
 request:=(p_command->>'request_id')::uuid;
 perform pg_advisory_xact_lock(hashtextextended(request::text,0));
 select * into cached from public.workshop_reception_commands where request_id=request;
 if found then
  if cached.actor_id<>p_actor_id or cached.command<>p_command then raise exception 'reception_request_conflict'; end if;
  return cached.result||'{"duplicate":true}'::jsonb;
 end if;
 cash_result:=public.zukait_reception_cash_base_command(p_actor_id,p_command-'cash_amount');
 job_no:=cash_result->'record'->>'job_card';
 if job_no is null then raise exception 'reception_job_not_found'; end if;
 select * into snapshot from public.workshop_state where id='main' for update;
 if not exists(select 1 from jsonb_array_elements(snapshot.data->'jobs') j where j->>'no'=job_no) then raise exception 'reception_job_not_found'; end if;
 select jsonb_agg(case when j->>'no'=job_no then j||jsonb_build_object('amount',amount) else j end order by n)
 into jobs from jsonb_array_elements(snapshot.data->'jobs') with ordinality a(j,n);
 insert into public.workshop_state_history(revision,data,updated_at,updated_by) values(snapshot.revision,snapshot.data,snapshot.updated_at,snapshot.updated_by) on conflict(revision) do nothing;
 update public.workshop_state set data=jsonb_set(snapshot.data,'{jobs}',jobs),revision=snapshot.revision+1,updated_by=p_actor_id,updated_at=now() where id='main';
 cash_result:=cash_result||jsonb_build_object('server_revision',snapshot.revision+1);
 update public.workshop_reception_commands set command=p_command,result=cash_result where request_id=request;
 return cash_result;
end $$;
revoke all on function public.zukait_reception_command(text,jsonb),public.zukait_reception_cash_base_command(text,jsonb) from public,anon,authenticated;
grant execute on function public.zukait_reception_command(text,jsonb),public.zukait_reception_cash_base_command(text,jsonb) to service_role;
commit;
