begin;
set local lock_timeout='5s';
create table public.workshop_job_numbers(stable_job text primary key,current_number text not null unique);
create table public.workshop_job_number_aliases(number text primary key,stable_job text not null references public.workshop_job_numbers(stable_job));
create index workshop_job_number_aliases_job on public.workshop_job_number_aliases(stable_job);
create table public.workshop_job_number_audit(id bigint generated always as identity primary key,stable_job text not null,from_number text not null,to_number text not null,actor_id text not null references public.staff_credentials(user_id),reason text not null,created_at timestamptz not null default now());
create index workshop_job_number_audit_job on public.workshop_job_number_audit(stable_job);
insert into public.workshop_job_numbers(stable_job,current_number)
 select no,no from (select j->>'no' no from public.workshop_state s,jsonb_array_elements(s.data->'jobs') j where s.id='main'
 union select job_card from public.workshop_v2_jobcards
 union select job_card from public.workshop_receptions where job_card is not null
 union select job_card from public.workshop_direct_job_approvals
 union select job_card from public.workshop_accounting_entries
 union select job_card from public.workshop_v2_assignments
 union select job_card from public.workshop_v2_work_sessions
 union select job_card from public.workshop_v2_spare_part_state
 union select job_card from public.workshop_v2_spare_part_list_numbers
 union select job_card from public.workshop_reception_job_cancellations
 union select job_card from public.workshop_job_classification_audit) jobs where nullif(trim(no),'') is not null;
do $$begin
 if to_regclass('public.voice_notes') is not null then
  execute 'insert into public.workshop_job_numbers(stable_job,current_number) select distinct job_no,job_no from public.voice_notes where nullif(trim(job_no),'''') is not null on conflict(stable_job) do nothing';
 end if;
end$$;
insert into public.workshop_job_number_aliases(number,stable_job) select upper(trim(stable_job)),stable_job from public.workshop_job_numbers;
alter table public.workshop_job_numbers enable row level security;
alter table public.workshop_job_number_aliases enable row level security;
alter table public.workshop_job_number_audit enable row level security;
revoke all on public.workshop_job_numbers,public.workshop_job_number_aliases,public.workshop_job_number_audit from public,anon,authenticated;
grant select,insert,update on public.workshop_job_numbers to service_role;
grant select,insert on public.workshop_job_number_aliases,public.workshop_job_number_audit to service_role;
grant usage on sequence public.workshop_job_number_audit_id_seq to service_role;
create view public.workshop_job_number_directory with (security_invoker=true) as
 select a.number,a.stable_job,n.current_number from public.workshop_job_number_aliases a join public.workshop_job_numbers n using(stable_job)
 where exists(select 1 from public.workshop_job_number_audit h where h.stable_job=n.stable_job);
revoke all on public.workshop_job_number_directory from public,anon,authenticated;
grant select on public.workshop_job_number_directory to service_role;
-- Computed relationship: include numbering in the existing authenticated-session read.
-- No second HTTP/database lookup is added to normal requests or revision probes.
create function public.workshop_session_job_numbers(public.staff_sessions)
returns setof public.workshop_job_number_directory language sql stable security invoker set search_path=public,pg_temp rows 1000 as $$
 select * from public.workshop_job_number_directory;
$$;
revoke all on function public.workshop_session_job_numbers(public.staff_sessions) from public,anon,authenticated;
grant execute on function public.workshop_session_job_numbers(public.staff_sessions) to service_role;
create function public.zukait_job_number_key(value text) returns text language sql immutable security invoker set search_path=public,pg_temp as $$
 select case when trim(value) ~ '^[0-9]+$' then coalesce(nullif(ltrim(trim(value),'0'),''),'0') else upper(trim(value)) end;
$$;
revoke all on function public.zukait_job_number_key(text) from public,anon,authenticated;
grant execute on function public.zukait_job_number_key(text) to service_role;
create function public.zukait_job_number_guard() returns trigger language plpgsql security invoker set search_path=public,pg_temp as $$
declare number_key text; stable text;
begin
 if tg_table_name='workshop_state' then
  if tg_op='UPDATE' and new.data->'jobs' is not distinct from old.data->'jobs' then return new;end if;
  if exists(select 1 from jsonb_array_elements(coalesce(new.data->'jobs','[]')) j group by public.zukait_job_number_key(j->>'no') having count(*)>1) then raise exception 'job_number_duplicate';end if;
  if exists(select 1 from jsonb_array_elements(coalesce(new.data->'jobs','[]')) j join public.workshop_job_number_aliases a on a.number=public.zukait_job_number_key(j->>'no') where a.stable_job<>j->>'no') then raise exception 'job_number_duplicate';end if;
  for stable in select j->>'no' from jsonb_array_elements(coalesce(new.data->'jobs','[]')) j
   where not exists(select 1 from public.workshop_job_numbers n where n.stable_job=j->>'no') loop
   insert into public.workshop_job_numbers(stable_job,current_number) values(stable,stable);
   insert into public.workshop_job_number_aliases(number,stable_job) values(public.zukait_job_number_key(stable),stable);
  end loop;
 else
  number_key:=public.zukait_job_number_key(new.job_card);
  if exists(select 1 from public.workshop_job_number_aliases where number=number_key and stable_job<>new.job_card) then raise exception 'job_number_duplicate';end if;
  insert into public.workshop_job_numbers(stable_job,current_number) values(new.job_card,new.job_card) on conflict(stable_job) do nothing;
  insert into public.workshop_job_number_aliases(number,stable_job) values(number_key,new.job_card) on conflict(number) do nothing;
 end if;
 return new;
exception when unique_violation then raise exception 'job_number_duplicate';
end $$;
revoke all on function public.zukait_job_number_guard() from public,anon,authenticated;
grant execute on function public.zukait_job_number_guard() to service_role;
create trigger job_number_namespace_state before insert or update of data on public.workshop_state for each row execute function public.zukait_job_number_guard();
create trigger job_number_namespace_projection before insert or update of job_card on public.workshop_v2_jobcards for each row execute function public.zukait_job_number_guard();
create function public.zukait_job_number_audit_immutable() returns trigger language plpgsql security invoker set search_path=public,pg_temp as $$begin raise exception 'job_number_audit_immutable';end$$;
revoke all on function public.zukait_job_number_audit_immutable() from public,anon,authenticated;
create trigger job_number_audit_immutable before update or delete on public.workshop_job_number_audit for each row execute function public.zukait_job_number_audit_immutable();
create trigger job_number_audit_no_truncate before truncate on public.workshop_job_number_audit for each statement execute function public.zukait_job_number_audit_immutable();
-- One transaction for the existing full edit and public-number correction.
-- Stored job keys, append-only financial entries, events and all links stay unchanged.
create function public.zukait_manager_numbered_job_edit(p_expected_revision bigint,p_data jsonb,p_actor_id text,p_job_card text,p_reason text,p_live jsonb,p_new_number text,p_expected_number text,p_confirmed boolean)
returns jsonb language plpgsql security invoker set search_path=public,pg_temp as $$
declare snapshot public.workshop_state; previous_number text; result jsonb;
begin
 if not exists(select 1 from public.staff_credentials where user_id=p_actor_id and active and role='Manager') then raise exception 'job_edit_manager_required';end if;
 if p_confirmed is distinct from true then raise exception 'job_number_confirmation_required';end if;
 if p_new_number is null or p_new_number !~ '^[1-9][0-9]{0,9}$' or p_job_card='ID001' then raise exception 'job_number_invalid';end if;
 -- Same Reception/direct-identity -> state lock order as the established full edit.
 perform 1 from public.workshop_receptions where job_card=p_job_card for update;
 perform 1 from public.workshop_direct_job_identity where job_card=p_job_card for update;
 select * into snapshot from public.workshop_state where id='main' for update;
 if snapshot.revision is distinct from p_expected_revision then return jsonb_build_object('ok',false,'code','conflict');end if;
 if not exists(select 1 from jsonb_array_elements(snapshot.data->'jobs') j where j->>'no'=p_job_card) then raise exception 'reception_job_not_found';end if;
 select current_number into previous_number from public.workshop_job_numbers where stable_job=p_job_card;
 previous_number:=coalesce(previous_number,p_job_card);
 if previous_number is distinct from p_expected_number then raise exception 'job_number_conflict';end if;
 if exists(select 1 from jsonb_array_elements(snapshot.data->'jobs') j where public.zukait_job_number_key(j->>'no')=p_new_number and j->>'no'<>p_job_card)
 or exists(select 1 from public.workshop_v2_jobcards where public.zukait_job_number_key(job_card)=p_new_number and job_card<>p_job_card)
 or exists(select 1 from public.workshop_receptions where public.zukait_job_number_key(job_card)=p_new_number and job_card<>p_job_card)
 or exists(select 1 from public.workshop_direct_job_approvals where public.zukait_job_number_key(job_card)=p_new_number and job_card<>p_job_card)
 or exists(select 1 from public.workshop_job_number_aliases where number=p_new_number and stable_job<>p_job_card) then raise exception 'job_number_duplicate';end if;
 result:=public.zukait_manager_full_job_edit(p_expected_revision,p_data,p_actor_id,p_job_card,p_reason,p_live);
 if not coalesce((result->>'ok')::boolean,false) then return result;end if;
 insert into public.workshop_job_numbers(stable_job,current_number) values(p_job_card,p_new_number) on conflict(stable_job) do update set current_number=excluded.current_number;
 insert into public.workshop_job_number_aliases(number,stable_job) values(public.zukait_job_number_key(p_job_card),p_job_card) on conflict(number) do nothing;
 insert into public.workshop_job_number_aliases(number,stable_job) values(p_new_number,p_job_card) on conflict(number) do nothing;
 if previous_number<>p_new_number then insert into public.workshop_job_number_audit(stable_job,from_number,to_number,actor_id,reason) values(p_job_card,previous_number,p_new_number,p_actor_id,p_reason);end if;
 return result||jsonb_build_object('data',(select data from public.workshop_state where id='main'),'number_rows',(select coalesce(jsonb_agg(d),'[]') from public.workshop_job_number_directory d));
exception when unique_violation then raise exception 'job_number_duplicate';
end $$;
revoke all on function public.zukait_manager_numbered_job_edit(bigint,jsonb,text,text,text,jsonb,text,text,boolean) from public,anon,authenticated;
grant execute on function public.zukait_manager_numbered_job_edit(bigint,jsonb,text,text,text,jsonb,text,text,boolean) to service_role;
notify pgrst,'reload schema';
commit;
