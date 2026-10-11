-- Manager Full Edit updates linked identity and workshop details in one transaction.
begin;
create function public.zukait_manager_full_job_edit(p_expected_revision bigint,p_data jsonb,p_actor_id text,p_job_card text,p_reason text,p_live jsonb)
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
   insert into public.workshop_reception_audit(rc_no,operation,actor_id,before_data,after_data,reason) values(rc.rc_no,'EDIT',p_actor_id,to_jsonb(rc),jsonb_build_object('details',corrected_details,'job_type',kind,'insurance_id',company,'credit_account',account),p_reason);
   update public.workshop_receptions set details=corrected_details,job_type=kind,insurance_id=company,credit_account=account,updated_by=p_actor_id where rc_no=rc.rc_no;
  end if;
 end if;
 select * into snapshot from public.workshop_state where id='main';
 result:=public.zukait_commit_workshop_state_v2(snapshot.revision,p_data,p_actor_id,p_live);
 if not coalesce((result->>'ok')::boolean,false) then raise exception 'reception_full_edit_commit_failed'; end if;
 select x into j from public.workshop_state s,jsonb_array_elements(s.data->'jobs') x where s.id='main' and x->>'no'=p_job_card;
 return result||jsonb_build_object('job',j);
end $$;
revoke all on function public.zukait_manager_full_job_edit(bigint,jsonb,text,text,text,jsonb) from public,anon,authenticated;
grant execute on function public.zukait_manager_full_job_edit(bigint,jsonb,text,text,text,jsonb) to service_role;
commit;
