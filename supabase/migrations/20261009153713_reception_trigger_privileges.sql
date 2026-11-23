-- Pending activation only. Preserve the existing trigger body and execution role.
begin;
revoke execute on function public.zukait_v2_project_spare_part_event() from public, anon, authenticated;
grant execute on function public.zukait_v2_project_spare_part_event() to service_role;
commit;
