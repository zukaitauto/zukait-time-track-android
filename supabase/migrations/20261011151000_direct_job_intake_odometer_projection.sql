-- Keep the direct Job Card's intake reading in the Job Card itself as well
-- as the internal audit record. Do not reinterpret a historical checklist reading.
begin;
do $migration$
declare definition text; anchor text; replacement text;
begin
 definition:=pg_get_functiondef('public.zukait_reception_command(text,jsonb)'::regprocedure);
 anchor:='if kind=''CREDIT'' then j:=j||jsonb_build_object(''creditAccount'',trim(p_command->>''credit_account'')); end if;';
 replacement:=$body$
  if coalesce(r.details->>'odometer','')<>'' then
   if (r.details->>'odometer') !~ '^[0-9]{1,10}([.][0-9]{1,2})?$' then raise exception 'reception_invalid_odometer'; end if;
   if coalesce(r.details->>'odometer_unit','KM') not in ('KM','Miles') then raise exception 'reception_invalid_unit'; end if;
  end if;
  j:=j||jsonb_build_object('intakeOdometer',coalesce(r.details->>'odometer',''),
    'intakeOdometerUnit',coalesce(r.details->>'odometer_unit','KM'));
  if kind='CREDIT' then j:=j||jsonb_build_object('creditAccount',trim(p_command->>'credit_account')); end if;
$body$;
 if (length(definition)-length(replace(definition,anchor,'')))/length(anchor)<>1 then
  raise exception 'direct_intake_odometer_projection_drift';
 end if;
 execute replace(definition,anchor,replacement);
end
$migration$;
commit;
