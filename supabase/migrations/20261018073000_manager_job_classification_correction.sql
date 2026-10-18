-- A Manager may correct a pre-existing Cash/Credit classification without
-- fabricating insurer approval. New insurance job creation stays guarded.
begin;
create table public.workshop_job_classification_audit(
 id bigint generated always as identity primary key,
 job_card text not null, actor_id text not null references public.staff_credentials(user_id),
 created_at timestamptz not null default now(),reason text not null check(length(trim(reason)) between 1 and 2000),
 expected_revision bigint not null,transaction_id bigint not null,
 before_data jsonb not null,after_data jsonb not null,after_identity jsonb not null
);
alter table public.workshop_job_classification_audit enable row level security;
revoke all on public.workshop_job_classification_audit from public,anon,authenticated,service_role;
grant select,insert on public.workshop_job_classification_audit to service_role;
revoke all on sequence public.workshop_job_classification_audit_id_seq from public,anon,authenticated;
grant usage,select on sequence public.workshop_job_classification_audit_id_seq to service_role;
create function public.zukait_classification_audit_immutable() returns trigger language plpgsql set search_path=public as $$begin raise exception 'classification_audit_immutable';end$$;
create trigger classification_audit_immutable before update or delete on public.workshop_job_classification_audit for each row execute function public.zukait_classification_audit_immutable();
create function public.zukait_classification_identity(j jsonb) returns jsonb language sql immutable set search_path=public as $$
 select jsonb_build_object('no',j->>'no','type',upper(j->>'jobType'),'insurance',j->>'insuranceCompany','reg',j->>'reg','vin',j->>'vin');
$$;
create function public.zukait_manager_classification_valid(p_job text,p_before jsonb,p_after jsonb,p_revision bigint) returns boolean language sql stable security invoker set search_path=public as $$
 select upper(coalesce(p_before->>'jobType','')) in ('CASH','CREDIT') and upper(p_after->>'jobType')='INSURANCE' and exists(
 select 1 from public.workshop_job_classification_audit a join public.staff_credentials u on u.user_id=a.actor_id
 where a.job_card=p_job and a.expected_revision=p_revision and a.transaction_id=txid_current()
 and u.active and u.role='Manager' and a.before_data=p_before and a.after_identity=public.zukait_classification_identity(p_after));
$$;
revoke all on function public.zukait_classification_audit_immutable(),public.zukait_classification_identity(jsonb),public.zukait_manager_classification_valid(text,jsonb,jsonb,bigint) from public,anon,authenticated;
grant execute on function public.zukait_classification_identity(jsonb),public.zukait_manager_classification_valid(text,jsonb,jsonb,bigint) to service_role;
-- An existing linked job may await insurer approval after a classification
-- correction. Keep that provenance separate from actual approval_status.
alter table public.workshop_receptions add column manager_classification_id bigint references public.workshop_job_classification_audit(id);
create function public.zukait_linked_classification_valid(p_job text,p_id bigint) returns boolean language sql stable security invoker set search_path=public as $$
 select exists(select 1 from public.workshop_job_classification_audit where id=p_id and job_card=p_job and upper(before_data->>'jobType') in ('CASH','CREDIT') and upper(after_data->>'jobType')='INSURANCE');
$$;
revoke all on function public.zukait_linked_classification_valid(text,bigint) from public,anon,authenticated;
grant execute on function public.zukait_linked_classification_valid(text,bigint) to service_role;
alter table public.workshop_receptions drop constraint reception_link_by_type;
alter table public.workshop_receptions add constraint reception_link_by_type check(job_card is null or (outcome is null and (job_type<>'INSURANCE' or approval_status='APPROVED' or public.zukait_linked_classification_valid(job_card,manager_classification_id))));
create or replace function public.zukait_manager_full_job_edit(p_expected_revision bigint,p_data jsonb,p_actor_id text,p_job_card text,p_reason text,p_live jsonb)
returns jsonb language plpgsql security invoker set search_path=public,pg_temp as $$
declare original public.workshop_direct_job_identity; snapshot public.workshop_state; j jsonb; new_identity jsonb; result jsonb; company bigint; previous_job jsonb;
begin
 if not exists(select 1 from public.staff_credentials where user_id=p_actor_id and active and role='Manager') then raise exception 'reception_manager_required'; end if;
 if length(trim(coalesce(p_reason,''))) not between 1 and 2000 then raise exception 'reception_reason_required'; end if;
 -- Preserve Reception/direct-identity -> workshop-state lock order.
 perform 1 from public.workshop_receptions where job_card=p_job_card for update;
 perform 1 from public.workshop_direct_job_identity where job_card=p_job_card for update;
 select * into snapshot from public.workshop_state where id='main' for update;
 if snapshot.revision is distinct from p_expected_revision then return jsonb_build_object('ok',false,'code','conflict');end if;
 select x into previous_job from jsonb_array_elements(coalesce(snapshot.data->'jobs','[]')) x where x->>'no'=p_job_card;
 select x into j from jsonb_array_elements(coalesce(p_data->'jobs','[]')) x where x->>'no'=p_job_card;
 if previous_job is null or j is null then raise exception 'reception_job_not_found';end if;
 if upper(coalesce(previous_job->>'jobType','')) in ('CASH','CREDIT') and upper(j->>'jobType')='INSURANCE' then
  if not exists(select 1 from public.workshop_insurance_companies where name=j->>'insuranceCompany' and active) then raise exception 'reception_insurance_required';end if;
  insert into public.workshop_job_classification_audit(job_card,actor_id,reason,expected_revision,transaction_id,before_data,after_data,after_identity)
  values(p_job_card,p_actor_id,trim(p_reason),p_expected_revision,txid_current(),previous_job,j,public.zukait_classification_identity(j));
 end if;
 if exists(select 1 from public.workshop_receptions where job_card=p_job_card) then return public.zukait_manager_linked_full_job_edit(p_expected_revision,p_data,p_actor_id,p_job_card,p_reason,p_live); end if;
 select * into original from public.workshop_direct_job_identity where job_card=p_job_card for update;
 if not found then return public.zukait_manager_linked_full_job_edit(p_expected_revision,p_data,p_actor_id,p_job_card,p_reason,p_live); end if;
 select * into snapshot from public.workshop_state where id='main' for update;
 if snapshot.revision is distinct from p_expected_revision then return '{"ok":false,"code":"conflict"}'::jsonb; end if;
 select x into j from jsonb_array_elements(p_data->'jobs') x where x->>'no'=p_job_card;
 if j is null then raise exception 'reception_job_not_found'; end if;
 if coalesce(upper(j->>'jobType'),'') not in ('CASH','CREDIT','INSURANCE') then raise exception 'reception_invalid_job_type'; end if;
 if upper(j->>'jobType')='INSURANCE' then
  select id into company from public.workshop_insurance_companies where name=j->>'insuranceCompany';
  if company is null then raise exception 'reception_insurance_required'; end if;
  if not exists(select 1 from public.workshop_direct_job_approvals where job_card=p_job_card and job_type='INSURANCE') and upper(coalesce(original.identity->>'jobType',''))<>'INSURANCE' and not public.zukait_manager_classification_valid(p_job_card,previous_job,j,p_expected_revision) then raise exception 'reception_external_approval_required'; end if;
 end if;
 if upper(j->>'jobType')='CREDIT' then j:=j||jsonb_build_object('creditAccount',coalesce(nullif(original.identity->>'creditAccount',''),nullif(j->>'customer','')));if nullif(j->>'creditAccount','') is null then raise exception 'reception_credit_account_required'; end if; else j:=j-'creditAccount'; end if;
 new_identity:=public.zukait_direct_identity(j);
 if new_identity is distinct from original.identity then
  update public.workshop_direct_job_identity set identity=new_identity where job_card=p_job_card;
  insert into public.workshop_direct_job_audit(job_card,actor_id,before_data,after_data,reason) values(p_job_card,p_actor_id,original.identity,new_identity,p_reason);
 end if;
 result:=public.zukait_commit_workshop_state_v2(p_expected_revision,p_data,p_actor_id,p_live);
 if not coalesce((result->>'ok')::boolean,false) then raise exception 'reception_full_edit_commit_failed'; end if;
 select x into j from public.workshop_state s,jsonb_array_elements(s.data->'jobs') x where s.id='main' and x->>'no'=p_job_card;
 return result||jsonb_build_object('job',j);
end $$;
create or replace function public.zukait_reception_guard_job_creation()
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
  if not public.zukait_reception_job_approval_valid(job_no,j->>'receptionNo',new.data) and not (tg_op='UPDATE' and previous is not null and public.zukait_manager_classification_valid(job_no,previous,j,old.revision)) then
   raise exception 'insurance_job_requires_approved_reception';
  end if;
 end loop;
 return new;
end;
$$;

create or replace function public.zukait_manager_linked_full_job_edit(p_expected_revision bigint,p_data jsonb,p_actor_id text,p_job_card text,p_reason text,p_live jsonb)
returns jsonb language plpgsql security definer set search_path=public,pg_temp as $$
declare rc public.workshop_receptions; snapshot public.workshop_state; j jsonb; company bigint; kind text; corrected_details jsonb; result jsonb; account text;
begin
 if not exists(select 1 from public.staff_credentials where user_id=p_actor_id and active and role='Manager') then raise exception 'reception_manager_required'; end if;
 if length(trim(coalesce(p_reason,''))) not between 1 and 2000 then raise exception 'reception_reason_required'; end if;
 -- Match the established Reception -> state lock order.
 select * into rc from public.workshop_receptions where job_card=p_job_card for update;
 select * into snapshot from public.workshop_state where id='main' for update;
 if snapshot.revision is distinct from p_expected_revision then return jsonb_build_object('ok',false,'code','conflict'); end if;
 select x into j from jsonb_array_elements(p_data->'jobs') x where x->>'no'=p_job_card;
 if j is null then raise exception 'reception_job_not_found'; end if;
 if rc.rc_no is not null then
  kind:=upper(j->>'jobType');
  if kind not in ('CASH','CREDIT','INSURANCE') then raise exception 'reception_invalid_job_type'; end if;
  if kind='INSURANCE' then
   select id into company from public.workshop_insurance_companies where name=j->>'insuranceCompany' and (active or id=rc.insurance_id);
   if company is null then raise exception 'reception_insurance_required'; end if;
  end if;
  if kind='CREDIT' then
   account:=coalesce(nullif(rc.credit_account,''),nullif(j->>'customer',''),nullif(j->>'customerName',''));
   if account is null then raise exception 'reception_credit_account_required'; end if;
  end if;
  corrected_details:=rc.details||jsonb_build_object('make',j->>'make','model',j->>'model','year',coalesce(j->>'year',''),'registration',j->>'reg','vin',coalesce(j->>'vin',''),'customer',coalesce(j->>'customer',j->>'customerName',''),'contact',coalesce(j->>'mobile',''),'claim',coalesce(j->>'claimNo',''));
  if corrected_details is distinct from rc.details or kind<>rc.job_type or company is distinct from rc.insurance_id or account is distinct from rc.credit_account then
   insert into public.workshop_reception_audit(rc_no,operation,actor_id,before_data,after_data,reason) values(rc.rc_no,'EDIT',p_actor_id,to_jsonb(rc),jsonb_build_object('details',corrected_details,'job_type',kind,'insurance_id',company,'credit_account',account,'approval_status',case when rc.job_type<>kind and kind='INSURANCE' then 'WAITING' else rc.approval_status end),p_reason);
   update public.workshop_receptions set details=corrected_details,job_type=kind,insurance_id=company,credit_account=account,manager_classification_id=coalesce((select a.id from public.workshop_job_classification_audit a where a.job_card=p_job_card and a.transaction_id=txid_current() order by a.id desc limit 1),rc.manager_classification_id),approval_status=case when rc.job_type<>kind and kind='INSURANCE' then 'WAITING' else rc.approval_status end,updated_by=p_actor_id where rc_no=rc.rc_no;
  end if;
 end if;
 select * into snapshot from public.workshop_state where id='main';
 result:=public.zukait_commit_workshop_state_v2(snapshot.revision,p_data,p_actor_id,p_live);
 if not coalesce((result->>'ok')::boolean,false) then raise exception 'reception_full_edit_commit_failed'; end if;
 select x into j from public.workshop_state s,jsonb_array_elements(s.data->'jobs') x where s.id='main' and x->>'no'=p_job_card;
 return result||jsonb_build_object('job',j);
end $$;
commit;
