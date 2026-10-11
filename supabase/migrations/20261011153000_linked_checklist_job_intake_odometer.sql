-- Staged: a linked checklist keeps its original inspection reading. The
-- CREATE_JOB operation may separately accept a job-intake odometer.
-- Existing approval, duplicate prevention and transaction rules remain intact.
begin;
do $body$
declare def text; old_text text; new_text text;
begin
 def:=pg_get_functiondef('public.zukait_reception_command(text,jsonb)'::regprocedure);
 -- The original CREATE_JOB wrapper was renamed as the underlying approval
 -- command in later migrations; this migration intentionally targets the
 -- currently active operation only when its original body is still present.
 if position('if op is distinct from ''CREATE_JOB''' in def)=0 then
  raise exception 'linked_odometer_command_version_requires_review';
 end if;
 old_text:='''operation'',''rc_no'',''expected_revision'',''request_id'',''job_card'',''reason'')';
 new_text:='''operation'',''rc_no'',''expected_revision'',''request_id'',''job_card'',''reason'',''job_intake_odometer'',''job_intake_unit'')';
 if (length(def)-length(replace(def,old_text,'')))/length(old_text)<>1 then raise exception 'linked_odometer_field_guard_drift'; end if;
 def:=replace(def,old_text,new_text);
 old_text:='-- Temporarily link inside this transaction so the shared creation guard can';
 new_text:=$replace$
 if coalesce(p_command->>'job_intake_odometer','')<>'' and
    (p_command->>'job_intake_odometer') !~ '^[0-9]{1,10}([.][0-9]{1,2})?$' then
  raise exception 'reception_invalid_odometer';
 end if;
 if coalesce(p_command->>'job_intake_unit','KM') not in ('KM','Miles') then
  raise exception 'reception_invalid_unit';
 end if;
 -- Temporarily link inside this transaction so the shared creation guard can$replace$;
 if (length(def)-length(replace(def,old_text,'')))/length(old_text)<>1 then raise exception 'linked_odometer_validation_drift'; end if;
 def:=replace(def,old_text,new_text);
 old_text:='''v2EventId'',event_id,''v2Created'',true);';
 new_text:='''v2EventId'',event_id,''v2Created'',true,''jobIntakeOdometer'',nullif(p_command->>''job_intake_odometer'',''''),''jobIntakeUnit'',coalesce(p_command->>''job_intake_unit'',''KM''));';
 if (length(def)-length(replace(def,old_text,'')))/length(old_text)<>1 then raise exception 'linked_odometer_job_payload_drift'; end if;
 execute replace(def,old_text,new_text);
end
$body$;
commit;
