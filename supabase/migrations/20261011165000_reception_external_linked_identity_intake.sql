-- Stage atomic vehicle identity corrections during linked external-approved Job Card intake.
-- Depends on the staged 20261011162000 independent odometer migration.
-- No production deployment is authorized by this commit.
begin;
do $migration$
declare
 definition text;
 old_text text;
 new_text text;
begin
 definition:=pg_get_functiondef('public.zukait_reception_command(text,jsonb)'::regprocedure);
 if definition is null then raise exception 'linked_intake_command_missing'; end if;

 old_text:='''approval_confirmed'') then raise exception ''reception_invalid_fields''; end if;';
 new_text:='''approval_confirmed'',''identity_updates'') then raise exception ''reception_invalid_fields''; end if;';
 if (length(definition)-length(replace(definition,old_text,'')))/length(old_text)<>1 then
   raise exception 'linked_identity_outer_guard_drift';
 end if;
 definition:=replace(definition,old_text,new_text);

 old_text:='''job_intake_odometer'',''job_intake_unit'')) then raise exception ''reception_invalid_fields''; end if;';
 new_text:='''job_intake_odometer'',''job_intake_unit'',''identity_updates'',''insurance_id'',''approval_confirmed'',''reference'',''approval_date'',''evidence'')) then raise exception ''reception_invalid_fields''; end if;';
 if (length(definition)-length(replace(definition,old_text,'')))/length(old_text)<>1 then
   raise exception 'linked_identity_operation_guard_drift';
 end if;
 definition:=replace(definition,old_text,new_text);

 old_text:='j jsonb; intake jsonb;';
 new_text:='j jsonb; intake jsonb; intake_details jsonb; corrected_details jsonb; corrected_insurance bigint; identity_changed boolean;';
 if (length(definition)-length(replace(definition,old_text,'')))/length(old_text)<>1 then
   raise exception 'linked_identity_declaration_drift';
 end if;
 definition:=replace(definition,old_text,new_text);

 old_text:='select * into snapshot from public.workshop_state where id=''main'' for update;';
 new_text:=$replacement$
  -- Compare the supplied corrections while holding the checklist row lock.
  -- Never update the checklist odometer, its inspection marks, or its original date.
  if op='CREATE_EXTERNAL_JOB' then
   intake_details:=coalesce(p_command->'identity_updates','{}'::jsonb);
   if jsonb_typeof(intake_details)<>'object' or length(intake_details::text)>4500
      or exists(select 1 from jsonb_object_keys(intake_details) k
       where k not in ('make','model','year','registration','vin','customer','contact','claim'))
      or exists(select 1 from jsonb_each(intake_details) e
       where jsonb_typeof(e.value)<>'string' or length(e.value#>>'{}')>200) then
    raise exception 'reception_invalid_fields';
   end if;
   if p_command ? 'insurance_id' then
    if coalesce(p_command->>'insurance_id','') !~ '^[1-9][0-9]{0,11}$' then
     raise exception 'reception_insurance_required';
    end if;
    corrected_insurance:=(p_command->>'insurance_id')::bigint;
   else
    corrected_insurance:=r.insurance_id;
   end if;
   if not exists(select 1 from public.workshop_insurance_companies
     where id=corrected_insurance and active) then raise exception 'reception_insurance_required'; end if;
   corrected_details:=r.details||intake_details;
   if nullif(trim(corrected_details->>'make'),'') is null
    or nullif(trim(corrected_details->>'model'),'') is null
    or coalesce(corrected_details->>'year','') !~ '^[0-9]{4}$'
    or nullif(trim(corrected_details->>'claim'),'') is null then
    raise exception 'reception_vehicle_claim_required';
   end if;
   if coalesce(corrected_details->>'vin','')<>'' and length(trim(corrected_details->>'vin'))>40 then
    raise exception 'reception_invalid_fields';
   end if;
   identity_changed:=(corrected_details is distinct from r.details
     or corrected_insurance is distinct from r.insurance_id);
   if identity_changed then
    -- A change to insured identity invalidates the prior insurer's evidence.
    -- Require Manager/Supervisor verification and append new approval evidence;
    -- do not mutate the previous approval or silently inherit its authority.
    if actor_role not in ('Manager','Supervisor') then raise exception 'reception_manager_required'; end if;
    if p_command->'approval_confirmed' is distinct from 'true'::jsonb
      then raise exception 'reception_approval_confirmation_required'; end if;
    if jsonb_typeof(p_command->'reference') is distinct from 'string'
      or length(trim(p_command->>'reference')) not between 1 and 200
      or jsonb_typeof(p_command->'evidence') is distinct from 'string'
      or length(trim(p_command->>'evidence')) not between 1 and 2000 then
     raise exception 'reception_external_evidence_required';
    end if;
    if coalesce(p_command->>'approval_date','') !~ '^[0-9]{4}-[0-9]{2}-[0-9]{2}$'
      then raise exception 'reception_invalid_approval_date'; end if;
    approval_day:=(p_command->>'approval_date')::date;
    if approval_day>(now() at time zone 'Asia/Muscat')::date
      then raise exception 'reception_invalid_approval_date'; end if;
    update public.workshop_receptions
      set details=corrected_details,insurance_id=corrected_insurance,
        revision=revision+1,updated_by=p_actor_id,updated_at=now()
      where rc_no=r.rc_no returning * into r;
    insert into public.workshop_reception_external_approvals
     (id,rc_no,reference,approval_date,evidence,identity_snapshot,parts_snapshot,actor_id,reason)
     values(md5(request::text||':identity-reverification')::uuid,
       r.rc_no,trim(p_command->>'reference'),approval_day,trim(p_command->>'evidence'),
       public.zukait_reception_identity(r.details,r.insurance_id),'[]'::jsonb,p_actor_id,
       'Linked Job Card identity correction: '||reason);
    if not public.zukait_reception_external_approval_valid(r) then
      raise exception 'reception_external_approval_required';
    end if;
   end if;
  end if;
  select * into snapshot from public.workshop_state where id='main' for update;
$replacement$;
 if (length(definition)-length(replace(definition,old_text,'')))/length(old_text)<>1 then
   raise exception 'linked_identity_atomic_creation_drift';
 end if;
 definition:=replace(definition,old_text,new_text);
 execute definition;
end
$migration$;
commit;
