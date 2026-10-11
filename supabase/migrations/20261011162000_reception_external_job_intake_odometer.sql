-- Independent Job Card odometer on the existing, approved linked-checklist
-- CREATE_EXTERNAL_JOB operation. Original checklist details remain unchanged.
-- Staged only; do not apply without isolated PostgreSQL acceptance.
begin;
do $migration$
declare definition text; old_text text; new_text text;
begin
 definition:=pg_get_functiondef('public.zukait_reception_command(text,jsonb)'::regprocedure);
 old_text:='if op=''CREATE_EXTERNAL_JOB'' and exists(select 1 from jsonb_object_keys(p_command) k where k not in (''operation'',''rc_no'',''expected_revision'',''request_id'',''job_card'',''reason'')) then raise exception ''reception_invalid_fields''; end if;';
 new_text:='if op=''CREATE_EXTERNAL_JOB'' and exists(select 1 from jsonb_object_keys(p_command) k where k not in (''operation'',''rc_no'',''expected_revision'',''request_id'',''job_card'',''reason'',''job_intake_odometer'',''job_intake_unit'')) then raise exception ''reception_invalid_fields''; end if;';
 if (length(definition)-length(replace(definition,old_text,'')))/length(old_text)<>1 then raise exception 'linked_external_odometer_guard_drift'; end if;
 definition:=replace(definition,old_text,new_text);
 old_text:='if op<>''RECORD_EXTERNAL_APPROVAL'' then';
 new_text:=$replace$
 if op='CREATE_EXTERNAL_JOB' then
  if coalesce(p_command->>'job_intake_odometer','')<>'' and
    (p_command->>'job_intake_odometer') !~ '^[0-9]{1,10}([.][0-9]{1,2})?$'
    then raise exception 'reception_invalid_odometer'; end if;
  if coalesce(p_command->>'job_intake_unit','KM') not in ('KM','Miles')
    then raise exception 'reception_invalid_unit'; end if;
 end if;
 if op<>'RECORD_EXTERNAL_APPROVAL' then
$replace$;
 if (length(definition)-length(replace(definition,old_text,'')))/length(old_text)<>1 then raise exception 'linked_external_odometer_validation_drift'; end if;
 definition:=replace(definition,old_text,new_text);
 old_text:='''v2EventId'',''rc-direct-''||request,''v2Created'',true);';
 new_text:='''v2EventId'',''rc-direct-''||request,''v2Created'',true,''jobIntakeOdometer'',nullif(p_command->>''job_intake_odometer'',''''),''jobIntakeUnit'',case when op=''CREATE_EXTERNAL_JOB'' then coalesce(p_command->>''job_intake_unit'',''KM'') else coalesce(r.details->>''odometer_unit'',''KM'') end);';
 if (length(definition)-length(replace(definition,old_text,'')))/length(old_text)<>1 then raise exception 'linked_external_odometer_payload_drift'; end if;
 execute replace(definition,old_text,new_text);
end
$migration$;
commit;
