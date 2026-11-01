-- Require an explicit, unique manual Mechanical Job Card number.
-- Reuse Reception's authoritative duplicate-number validation and preserve its transaction.
DO $migration$
DECLARE fn text; old_block text; new_block text;
BEGIN
 SELECT pg_get_functiondef('public.zukait_mechanical_section(text,text,jsonb)'::regprocedure) INTO fn;
 old_block := $old$
  if coalesce(trim(p_command->'command'->>'job_card'),'')<>'' then raise exception 'mechanical_job_number_server_assigned';end if;
  -- The original command remains the immutable retry fingerprint. Only the
  -- delegated validated command receives a number; failed transactions may leave gaps.
  seq:=nextval('zukait_mechanical.job_no_seq');
  number:='MJC'||case when length(seq::text)>3 then seq::text else lpad(seq::text,3,'0') end;
  perform set_config('zukait.mechanical_intake_actor',p_actor,true);
  result:=public.zukait_reception_command(p_actor,jsonb_set(p_command->'command','{job_card}',to_jsonb(number)));
$old$;
 new_block := $new$
  number:=upper(trim(coalesce(p_command->'command'->>'job_card','')));
  if number !~ '^[A-Z0-9][A-Z0-9/-]{0,39}$' or number='ID001' then raise exception 'reception_invalid_job_number';end if;
  perform pg_advisory_xact_lock(hashtextextended('mechanical-manual-jc:'||number,0));
  perform set_config('zukait.mechanical_intake_actor',p_actor,true);
  result:=public.zukait_reception_command(p_actor,jsonb_set(p_command->'command','{job_card}',to_jsonb(number)));
$new$;
 IF position(old_block in fn)>0 THEN
  EXECUTE replace(fn,old_block,new_block);
 ELSIF position('number:=upper(trim(coalesce(p_command->''command''->>''job_card'','''')));' in fn)>0 THEN
  -- Already upgraded, no second change.
  NULL;
 ELSE
  RAISE EXCEPTION 'mechanical_manual_number_migration_needs_review';
 END IF;
END
$migration$;
