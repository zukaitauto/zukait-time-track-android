-- Add the isolated Mechanical Supervisor identity without changing existing users.
-- This does not enable Mechanical features or create/grant SUP003.
-- The paired staff-auth, workshop-api and client changes must be approved and
-- deployed together before provisioning this role. Existing roles remain valid.
alter table public.staff_credentials
 drop constraint staff_credentials_role_check,
 add constraint staff_credentials_role_check
 check(role in ('Employee','Supervisor','Mechanical Supervisor','Manager','Purchaser','Receptionist','Accountant'));
