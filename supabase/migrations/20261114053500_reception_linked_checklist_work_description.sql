-- Copy the saved Checklist "Work Description / Notes" to newly linked Job Cards.
-- Cash/Credit use CREATE_CHECKLIST_JOB, while approved Insurance uses CREATE_JOB
-- or CREATE_EXTERNAL_JOB. Do not loosen any insurance approval, identity or
-- job-number guards. Preserve free-form multiline description text.
-- Stage only: publish backend separately after isolated validation/approval.
begin;
do $migration$
declare
  definition text;
  old_text text;
  new_text text;
begin
  -- Every Job Card built from the existing Reception case identity (including
  -- approved Insurance) inherits the saved Checklist notes at creation time.
  definition:=pg_get_functiondef('public.zukait_reception_job_identity(public.workshop_receptions)'::regprocedure);
  if definition is null then raise exception 'reception_job_identity_missing'; end if;
  old_text:=$needle$'insurance',(select name from public.workshop_insurance_companies where id=r.insurance_id))$needle$;
  new_text:=$replacement$'insurance',(select name from public.workshop_insurance_companies where id=r.insurance_id),
 'workDescription',coalesce(r.details->>'remarks',''))$replacement$;
  if (length(definition)-length(replace(definition,old_text,'')))/length(old_text)<>1 then
    raise exception 'reception_work_description_identity_source_drift';
  end if;
  execute replace(definition,old_text,new_text);

  -- The existing Cash/Credit checklist-to-JC path first calls an audited
  -- CREATE_DIRECT_JOB and already updates the Job Card JSON in the same
  -- transaction. Copy Checklist notes in that existing update so no extra
  -- workshop_state history/snapshot write occurs. For blank notes, retain the
  -- existing value, including any explicit creation description.
  definition:=pg_get_functiondef('public.zukait_reception_command(text,jsonb)'::regprocedure);
  if definition is null then raise exception 'reception_command_missing'; end if;
  old_text:=$needle$when x->>'no'=no then (x-'directReceptionJob')||jsonb_build_object('receptionNo',r.rc_no,'receptionLocation',r.location) else x end order by n$needle$;
  new_text:=$replacement$when x->>'no'=no then (x-'directReceptionJob')||jsonb_build_object(
   'receptionNo',r.rc_no,'receptionLocation',r.location,
   'workDescription',coalesce(nullif(btrim(r.details->>'remarks'),''),coalesce(x->>'workDescription',''))
  ) else x end order by n$replacement$;
  if (length(definition)-length(replace(definition,old_text,'')))/length(old_text)<>1 then
    raise exception 'reception_work_description_cash_link_source_drift';
  end if;
  execute replace(definition,old_text,new_text);
end;
$migration$;
commit;
