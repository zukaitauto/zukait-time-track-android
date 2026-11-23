-- V312: direct Job Cards require make/model/model year; optional customer/contact.
-- Migration is additive to existing direct-insurance command and must be applied
-- only after the preceding direct-only marker migration in isolated acceptance.
begin;
do $migration$
declare definition text; old_text text; new_text text;
begin
 definition:=pg_get_functiondef('public.zukait_reception_command(text,jsonb)'::regprocedure);
 old_text:='if nullif(trim(p_command->''details''->>''customer''),'''') is null or nullif(trim(p_command->''details''->>''contact''),'''') is null then raise exception ''reception_customer_required''; end if;';
 new_text:=$replacement$
  if jsonb_typeof(p_command->'details') is distinct from 'object'
     or nullif(trim(p_command->'details'->>'make'),'') is null
     or nullif(trim(p_command->'details'->>'model'),'') is null
     or coalesce(p_command->'details'->>'year','') !~ '^[0-9]{4}$'
  then raise exception 'reception_vehicle_required'; end if;
$replacement$;
 if (length(definition)-length(replace(definition,old_text,'')))/length(old_text)<>1 then
  raise exception 'direct_job_required_fields_drift';
 end if;
 execute replace(definition,old_text,new_text);
end
$migration$;
commit;
