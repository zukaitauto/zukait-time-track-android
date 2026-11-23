-- Supabase default privileges may grant service_role ALL on new tables.
-- Explicitly narrow the journal to append/read and protect TRUNCATE as well.
begin;
revoke all on public.workshop_accounting_entries,public.workshop_accountant_commands,public.workshop_accountant_account_audit from service_role;
grant select,insert on public.workshop_accounting_entries,public.workshop_accountant_commands,public.workshop_accountant_account_audit to service_role;
revoke all on function public.zukait_accountant_immutable() from public,anon,authenticated;
grant execute on function public.zukait_accountant_immutable() to service_role;
create trigger accounting_no_truncate before truncate on public.workshop_accounting_entries for each statement execute function public.zukait_accountant_immutable();
create trigger accountant_audit_no_truncate before truncate on public.workshop_accountant_account_audit for each statement execute function public.zukait_accountant_immutable();
create trigger accountant_receipt_no_truncate before truncate on public.workshop_accountant_commands for each statement execute function public.zukait_accountant_immutable();
commit;
