-- Permit purchaser credentials through the existing Manager-authorized staff-auth flow.
-- Applied to zukait-time-track-test as allow_purchaser_staff_credentials_role.
alter table public.staff_credentials drop constraint staff_credentials_role_check;
alter table public.staff_credentials add constraint staff_credentials_role_check
  check (role = any (array['Employee'::text, 'Supervisor'::text, 'Manager'::text, 'Purchaser'::text]));
