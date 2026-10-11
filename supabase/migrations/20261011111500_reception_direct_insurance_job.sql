-- Owner-approved direct creation of manually numbered, already-approved insurance jobs.
-- No pre-existing checklist is required: one minimal reception audit record is
-- created atomically with the approval evidence and job card.
-- Strictly preserve existing Cash/Credit and checklist-based workflows.
begin;
do $migration$
declare
  definition text;
  old_text text;
  new_text text;
begin
  definition:=pg_get_functiondef('public.zukait_reception_command(text,jsonb)'::regprocedure);
  if definition is null then raise exception 'direct_insurance_dependency_missing'; end if;

  old_text:='''reason'',''reference'',''approval_date'',''evidence'')';
  new_text:='''reason'',''reference'',''approval_date'',''evidence'',''insurance_id'',''approval_confirmed'')';
  if (length(definition)-length(replace(definition,old_text,'')))/length(old_text)<>1 then
    raise exception 'direct_insurance_outer_fields_drift';
  end if;
  definition:=replace(definition,old_text,new_text);

  old_text:='''details'',''credit_account'',''received_confirmed'',''reason''))';
  new_text:='''details'',''credit_account'',''received_confirmed'',''reason'',''insurance_id'',''reference'',''approval_date'',''evidence'',''approval_confirmed''))';
  if (length(definition)-length(replace(definition,old_text,'')))/length(old_text)<>1 then
    raise exception 'direct_insurance_direct_fields_drift';
  end if;
  definition:=replace(definition,old_text,new_text);

  old_text:='kind not in (''CASH'',''CREDIT'')';
  new_text:='kind not in (''CASH'',''INSURANCE'',''CREDIT'')';
  if (length(definition)-length(replace(definition,old_text,'')))/length(old_text)<>1 then
    raise exception 'direct_insurance_kind_gate_drift';
  end if;
  definition:=replace(definition,old_text,new_text);

  old_text:='if kind=''CASH'' and p_command ? ''credit_account'' then raise exception ''reception_invalid_fields''; end if;';
  new_text:=$replacement$
  if kind<>'CREDIT' and p_command ? 'credit_account' then raise exception 'reception_invalid_fields'; end if;
  if kind='INSURANCE' then
   if p_command->'approval_confirmed' is distinct from 'true'::jsonb then raise exception 'reception_approval_confirmation_required'; end if;
   if coalesce(p_command->>'insurance_id','') !~ '^[1-9][0-9]{0,11}$' then raise exception 'reception_insurance_required'; end if;
   if not exists(select 1 from public.workshop_insurance_companies where id=(p_command->>'insurance_id')::bigint and active) then
    raise exception 'reception_insurance_required';
   end if;
   if jsonb_typeof(p_command->'reference') is distinct from 'string' or length(reference) not between 1 and 200
    or jsonb_typeof(p_command->'evidence') is distinct from 'string' or length(evidence) not between 1 and 2000 then
    raise exception 'reception_external_evidence_required';
   end if;
   if coalesce(p_command->>'approval_date','') !~ '^[0-9]{4}-[0-9]{2}-[0-9]{2}$' then
    raise exception 'reception_invalid_approval_date';
   end if;
   approval_day:=(p_command->>'approval_date')::date;
   if approval_day>(now() at time zone 'Asia/Muscat')::date then
    raise exception 'reception_invalid_approval_date';
   end if;
  end if;
$replacement$;
  if (length(definition)-length(replace(definition,old_text,'')))/length(old_text)<>1 then
    raise exception 'direct_insurance_validation_drift';
  end if;
  definition:=replace(definition,old_text,new_text);

  old_text:='''credit_account'',case when kind=''CREDIT'' then p_command->>''credit_account'' else null end));';
  new_text:='''credit_account'',case when kind=''CREDIT'' then p_command->>''credit_account'' else null end,''insurance_id'',case when kind=''INSURANCE'' then (p_command->>''insurance_id'')::bigint else null end));';
  if (length(definition)-length(replace(definition,old_text,'')))/length(old_text)<>1 then
    raise exception 'direct_insurance_intake_drift';
  end if;
  definition:=replace(definition,old_text,new_text);

  old_text:='select * into r from public.workshop_receptions where rc_no=intake->''record''->>''rc_no'' for update;';
  new_text:=$replacement$
   select * into r from public.workshop_receptions where rc_no=intake->'record'->>'rc_no' for update;
   if kind='INSURANCE' then
    insert into public.workshop_reception_external_approvals
      (id,rc_no,reference,approval_date,evidence,identity_snapshot,parts_snapshot,actor_id,reason)
      values(md5(request::text||':direct-insurance-approval')::uuid,
       r.rc_no,reference,approval_day,evidence,public.zukait_reception_identity(r.details,r.insurance_id),
       '[]'::jsonb,p_actor_id,reason);
    update public.workshop_receptions
      set approval_status='APPROVED',revision=revision+1,updated_by=p_actor_id,updated_at=now()
      where rc_no=r.rc_no returning * into r;
    if not public.zukait_reception_external_approval_valid(r) then
      raise exception 'reception_external_approval_required';
    end if;
   end if;
$replacement$;
  if (length(definition)-length(replace(definition,old_text,'')))/length(old_text)<>1 then
    raise exception 'direct_insurance_approval_drift';
  end if;
  definition:=replace(definition,old_text,new_text);

  execute definition;
end
$migration$;
commit;
