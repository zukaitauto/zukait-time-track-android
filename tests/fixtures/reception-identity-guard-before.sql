CREATE OR REPLACE FUNCTION public.zukait_reception_vehicle_state_guard()
 RETURNS trigger
 LANGUAGE plpgsql
 SET search_path TO 'public'
AS $function$
declare r public.workshop_receptions; master jsonb; quotes jsonb;
 jobs jsonb; prior_jobs jsonb; jobs_changed boolean:=false; quotes_changed boolean:=false;
begin
 if new.id<>'main' then return new; end if;
 jobs:=coalesce(new.data->'jobs','[]');
 quotes:=coalesce(new.data->'estimates','[]');
 if tg_op='UPDATE' then prior_jobs:=coalesce(old.data->'jobs','[]');else prior_jobs:='[]';end if;
 for r in select * from public.workshop_receptions where job_card is not null loop
  -- Do not let a stale full-state save unlink or remove a linked job.
  if (select count(*) from jsonb_array_elements(jobs) j where j->>'no'=r.job_card)<>1
   then raise exception 'reception_linked_job_required'; end if;
  master:=public.zukait_reception_job_identity(r);
  select jsonb_agg(case when j->>'no'=r.job_card then
   -- Remove legacy aliases so blank corrections cannot reveal stale fallback values.
   (j-array['vehicleMake','vehicleModel','modelYear','vehicleYear','model_year','vehicle_year','registration','registrationNo','registration_no','VIN','vinNumber','chassis','chassisNo','claimNumber','claim_no','claim','name','phone','customerMobile','insurance_company','job_type'])||master else j end order by n)
   into jobs from jsonb_array_elements(jobs) with ordinality a(j,n);
  jobs_changed:=true;
  if exists(select 1 from public.workshop_reception_estimates q where q.rc_no=r.rc_no and (select count(*) from jsonb_array_elements(quotes) e where e->>'id'=q.estimate_id)<>1)
    then raise exception 'reception_linked_estimate_required'; end if;
  if new.data ? 'estimates' and tg_op='UPDATE' and exists(select 1 from jsonb_array_elements(prior_jobs) j where j->>'no'=r.job_card) then
   select coalesce(jsonb_agg(case when e->>'jobCard'=r.job_card or exists(
     select 1 from public.workshop_reception_estimates q where q.rc_no=r.rc_no and q.estimate_id=e->>'id') then
     e||coalesce((select jsonb_object_agg(k,v) from jsonb_each(jsonb_build_object('receptionNo',r.rc_no,'customerName',master->>'customerName','mobile',master->>'mobile',
      'makeModel',master->>'vehicle','year',master->>'year','registration',master->>'reg',
      'vin',master->>'vin','claimNo',master->>'claimNo','insuranceCompany',master->>'insuranceCompany')) kv(k,v)
      where e ? k or exists(select 1 from public.workshop_reception_estimates q where q.rc_no=r.rc_no and q.estimate_id=e->>'id' and q.identity_snapshot is distinct from public.zukait_reception_identity(r.details,r.insurance_id))),'{}'::jsonb)
     else e end order by n),'[]') into quotes from jsonb_array_elements(quotes) with ordinality a(e,n);
   quotes_changed:=true;
  end if;
 end loop;
 if jobs_changed then new.data:=jsonb_set(new.data,'{jobs}',jobs);end if;
 if quotes_changed then new.data:=jsonb_set(new.data,'{estimates}',quotes);end if;
 return new;
end; $function$


;
