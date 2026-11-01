-- Safely support older and newer Mechanical CREATE_JOB RPC variants.
-- Manual number must be supplied by the caller; Reception performs canonical
-- namespace uniqueness checks within this same transaction.
DO $migration$
DECLARE fn text; old_auto text; old_legacy text; upgraded text;
BEGIN
 SELECT pg_get_functiondef('public.zukait_mechanical_section(text,text,jsonb)'::regprocedure) INTO fn;
 old_auto := $old$
  if coalesce(trim(p_command->'command'->>'job_card'),'')<>'' then raise exception 'mechanical_job_number_server_assigned';end if;
  -- The original command remains the immutable retry fingerprint. Only the
  -- delegated validated command receives a number; failed transactions may leave gaps.
  seq:=nextval('zukait_mechanical.job_no_seq');
  number:='MJC'||case when length(seq::text)>3 then seq::text else lpad(seq::text,3,'0') end;
  perform set_config('zukait.mechanical_intake_actor',p_actor,true);
  result:=public.zukait_reception_command(p_actor,jsonb_set(p_command->'command','{job_card}',to_jsonb(number)));
$old$;
 old_legacy := $legacy$
  perform set_config('zukait.mechanical_intake_actor',p_actor,true);
  result:=public.zukait_reception_command(p_actor,p_command->'command');
$legacy$;
 upgraded := $new$
  if coalesce(p_command->'command'->>'job_type','') not in ('CASH','CREDIT') then raise exception 'mechanical_cash_credit_only';end if;
  number:=upper(trim(coalesce(p_command->'command'->>'job_card','')));
  if number !~ '^[A-Z0-9][A-Z0-9/-]{0,39}$' or number='ID001' then raise exception 'reception_invalid_job_number';end if;
  -- Serialize concurrent creates of the same manual identifier.
  -- Reception also checks all existing Job Card number namespaces.
  perform pg_advisory_xact_lock(hashtextextended('mechanical-manual-jc:'||number,0));
  perform set_config('zukait.mechanical_intake_actor',p_actor,true);
  result:=public.zukait_reception_command(p_actor,jsonb_set(p_command->'command','{job_card}',to_jsonb(number)));
$new$;
 IF position(old_auto in fn)>0 THEN
  EXECUTE replace(fn,old_auto,upgraded);
 ELSIF position(old_legacy in fn)>0 THEN
  EXECUTE replace(fn,old_legacy,upgraded);
 ELSIF position('mechanical-manual-jc:' in fn)>0 THEN
  NULL;
 ELSE
  RAISE EXCEPTION 'mechanical_manual_number_migration_needs_review';
 END IF;
END
$migration$;
