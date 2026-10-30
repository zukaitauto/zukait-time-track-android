-- V377 REVIEW-ONLY draft: inspection details for an existing Mechanical checklist.
-- Not included in supabase/migrations and must not be applied to production.
-- The existing Mechanical checklist identity and job-card link remain authoritative.
begin;
create table zukait_mechanical.inspection_details (
 checklist_id uuid primary key references zukait_mechanical.checklists(id) on delete restrict,
 revision bigint not null default 1 check (revision >= 1),
 job_type text not null check (job_type in ('CASH','CREDIT')),
 vehicle jsonb not null check (jsonb_typeof(vehicle) = 'object'),
 damage_marks jsonb not null check (jsonb_typeof(damage_marks) = 'array' and jsonb_array_length(damage_marks) <= 100),
 function_checks jsonb not null check (jsonb_typeof(function_checks) = 'object'),
 work_description text not null check (length(trim(work_description)) between 1 and 2000),
 created_by text not null references public.staff_credentials(user_id),
 created_at timestamptz not null default clock_timestamp(),
 updated_by text not null references public.staff_credentials(user_id),
 updated_at timestamptz not null default clock_timestamp()
);
-- Default deny; service-role-only access through a future authenticated RPC.
alter table zukait_mechanical.inspection_details enable row level security;
revoke all on zukait_mechanical.inspection_details from public,anon,authenticated,service_role;
grant select,insert,update on zukait_mechanical.inspection_details to service_role;
-- JSON shape, VIN, odometer, and functional checks must also be validated
-- by the server contract inside the future atomic write boundary.
commit;
