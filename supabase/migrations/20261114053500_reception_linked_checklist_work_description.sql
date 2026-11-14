-- Stage only: copy Work Description / Notes from a saved Checklist into
-- a *newly created* Job Card, in the same audited creation transaction.
-- Do not bind Work Description to the live vehicle identity: Manager/Supervisor
-- edits after creation must remain editable, never be silently overwritten.
-- This migration requires an independently approved backend deployment.
begin;
do $migration$
declare
  definition text;
  old_text text;
  new_text text;
begin
  -- Quote-approved Insurance: the CREATE_JOB function builds its own Job Card.
  -- The existing approval and approved-part transfer guards stay unchanged.
  definition:=pg_get_functiondef('public.zukait_reception_vehicle_command(text,jsonb)'::regprocedure);
  if definition is null then raise exception 'reception_quotation_command_missing'; end if;
  old_text:=$needle$'v2EventId',event_id,'v2Created',true);$needle$;
  new_text:=$replacement$'v2EventId',event_id,'v2Created',true,
   'workDescription',coalesce(rc.details->>'remarks',''));$replacement$;
  if (length(definition)-length(replace(definition,old_text,'')))/length(old_text)<>1 then
    raise exception 'reception_quotation_work_description_drift';
  end if;
  execute replace(definition,old_text,new_text);

  -- Externally approved Insurance: inherit the work description only during
  -- the CREATE_EXTERNAL_JOB builder, NOT the identity refresh trigger.
  definition:=pg_get_functiondef('public.zukait_reception_cash_base_command(text,jsonb)'::regprocedure);
  if definition is null then raise exception 'reception_external_command_missing'; end if;
  old_text:=$needle$'v2Created',true,'jobIntakeOdometer'$needle$;
  new_text:=$replacement$'v2Created',true,
   'workDescription',coalesce(r.details->>'remarks',''),'jobIntakeOdometer'$replacement$;
  if (length(definition)-length(replace(definition,old_text,'')))/length(old_text)<>1 then
    raise exception 'reception_external_work_description_drift';
  end if;
  execute replace(definition,old_text,new_text);

  -- Cash/Credit: existing CREATE_CHECKLIST_JOB first calls the audited
  -- CREATE_DIRECT_JOB then links it atomically. Populate its Work Description
  -- in that transaction's existing workshop_state update; don't add a second
  -- snapshot, weaken guards, or turn the checklist into a Direct Job Card.
  -- The creation remark is audit metadata; never substitute it for an empty
  -- Checklist Work Description.
  definition:=pg_get_functiondef('public.zukait_reception_command(text,jsonb)'::regprocedure);
  if definition is null then raise exception 'reception_command_missing'; end if;
  old_text:=$needle$when x->>'no'=no then (x-'directReceptionJob')||jsonb_build_object('receptionNo',r.rc_no,'receptionLocation',r.location) else x end order by n$needle$;
  new_text:=$replacement$when x->>'no'=no then (x-'directReceptionJob')||jsonb_build_object(
    'receptionNo',r.rc_no,'receptionLocation',r.location,
    'workDescription',coalesce(r.details->>'remarks','')
  ) else x end order by n$replacement$;
  if (length(definition)-length(replace(definition,old_text,'')))/length(old_text)<>1 then
    raise exception 'reception_cash_credit_work_description_drift';
  end if;
  execute replace(definition,old_text,new_text);
end;
$migration$;
commit;
