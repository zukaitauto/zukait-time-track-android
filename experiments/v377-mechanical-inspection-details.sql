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
-- Append-only request receipts support atomic retry and duplicate detection.
-- A future save RPC must lock the checklist row, compare expected revision,
-- check request_id plus fingerprint, write inspection, receipt and audit together.
create table zukait_mechanical.inspection_receipts (
 request_id uuid primary key,
 checklist_id uuid not null references zukait_mechanical.checklists(id) on delete restrict,
 actor_id text not null references public.staff_credentials(user_id),
 fingerprint text not null check (fingerprint ~ '^[0-9a-f]{64}
-- by the server contract inside the future atomic write boundary.
commit;
),
 expected_revision bigint not null check (expected_revision >= 0),
 result_revision bigint not null check (result_revision > 0),
 created_at timestamptz not null default clock_timestamp(),
 unique (checklist_id,result_revision)
);
create table zukait_mechanical.inspection_audit (
 request_id uuid primary key references zukait_mechanical.inspection_receipts(request_id) on delete restrict,
 checklist_id uuid not null references zukait_mechanical.checklists(id) on delete restrict,
 actor_id text not null references public.staff_credentials(user_id),
 before_value jsonb,
 after_value jsonb not null,
 recorded_at timestamptz not null default clock_timestamp()
);
alter table zukait_mechanical.inspection_receipts enable row level security;
alter table zukait_mechanical.inspection_audit enable row level security;
revoke all on zukait_mechanical.inspection_receipts,zukait_mechanical.inspection_audit from public,anon,authenticated,service_role;
grant select,insert on zukait_mechanical.inspection_receipts,zukait_mechanical.inspection_audit to service_role;
create trigger immutable_inspection_receipts before update or delete or truncate
 on zukait_mechanical.inspection_receipts for each statement
 execute function zukait_mechanical.append_only();
create trigger immutable_inspection_audit before update or delete or truncate
 on zukait_mechanical.inspection_audit for each statement
 execute function zukait_mechanical.append_only();
-- JSON shape, VIN, odometer, and functional checks must also be validated
-- by the server contract inside the future atomic write boundary.
commit;
