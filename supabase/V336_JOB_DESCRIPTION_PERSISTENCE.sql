-- V336: Preserve Reception's Work Description on the newly created job.
-- This changes only the existing function body, retaining its permissions and transaction.
do $patch$
declare definition text; needle text; replacement text;
begin
 definition:=pg_get_functiondef('public.zukait_reception_command(text,jsonb)'::regprocedure);
 needle:=$old$'receptionLocation','VIW','amount',amount);$old$;
 replacement:=$new$'receptionLocation','VIW','amount',amount,'workDescription',case when notes in ('Linked Job Card intake','Direct Job intake') or notes like 'Supervisor Quick Entry:%' then '' else notes end);$new$;
 if position(replacement in definition)>0 then return;end if;
 if (length(definition)-length(replace(definition,needle,'')))/length(needle)<>1 then
  raise exception 'work_description_creation_patch_source_mismatch';
 end if;
 execute replace(definition,needle,replacement);
end $patch$;
