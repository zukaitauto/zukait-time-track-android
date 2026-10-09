-- Run after pending migrations and event-driven fixtures in BEGIN/ROLLBACK.
do $$
begin
 if has_function_privilege('anon','public.zukait_v2_project_spare_part_event()','execute')
 or has_function_privilege('authenticated','public.zukait_v2_project_spare_part_event()','execute') then
  raise exception 'spare projection trigger remains publicly executable';
 end if;
 if not has_function_privilege('service_role','public.zukait_v2_project_spare_part_event()','execute') then
  raise exception 'service projection privileges removed';
 end if;
 if not exists(select 1 from pg_trigger where tgfoid='public.zukait_v2_project_spare_part_event()'::regprocedure and tgrelid='public.workshop_v2_events'::regclass and tgenabled='O') then
  raise exception 'normal spare event projection trigger missing';
 end if;
 execute 'set local role anon';
 begin
  perform public.zukait_v2_project_spare_part_event();
  raise exception 'anonymous trigger invocation accepted';
 exception when insufficient_privilege then null;
 end;
 execute 'reset role';
 execute 'set local role authenticated';
 begin
  perform public.zukait_v2_project_spare_part_event();
  raise exception 'authenticated trigger invocation accepted';
 exception when insufficient_privilege then null;
 end;
 execute 'reset role';
end;$$;
