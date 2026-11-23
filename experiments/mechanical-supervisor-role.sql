-- Disposable/additive role candidate. Not a production migration or account creation.
-- Existing roles are preserved. No account is converted and no grants/flags are enabled.
alter table public.staff_credentials drop constraint if exists staff_credentials_role_check;
alter table public.staff_credentials add constraint staff_credentials_role_check
 check(role in ('Employee','Supervisor','Mechanical Supervisor','Manager','Purchaser','Receptionist','Accountant'));
