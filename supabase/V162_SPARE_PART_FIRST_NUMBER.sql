-- Restore PL001 before the first real Parts List is created.
-- Earlier rollback checks advanced this sequence without retaining a list.
begin;
lock table public.workshop_v2_spare_part_list_numbers in access exclusive mode;
do $$
begin
  if not exists (select 1 from public.workshop_v2_spare_part_list_numbers) then
    execute 'alter sequence public.workshop_v2_spare_part_list_no_seq restart with 1';
  end if;
end;
$$;
commit;
