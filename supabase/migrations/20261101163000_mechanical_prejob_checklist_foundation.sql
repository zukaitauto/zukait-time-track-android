-- Mechanical checklist-first intake foundation. Separate from existing job-linked
-- checklists and workshop_state; creating a draft never creates a Job Card.
CREATE TABLE IF NOT EXISTS zukait_mechanical.prejob_checklists (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
 checklist_number text NOT NULL UNIQUE,
 registration text NOT NULL CHECK(length(trim(registration)) BETWEEN 1 AND 80),
 job_type text NOT NULL CHECK(job_type IN ('CASH','CREDIT')),
 vehicle jsonb NOT NULL DEFAULT '{}'::jsonb CHECK(jsonb_typeof(vehicle)='object'),
 inspection jsonb NOT NULL DEFAULT '{}'::jsonb CHECK(jsonb_typeof(inspection)='object'),
 work_description text NOT NULL DEFAULT '',
 approval_status text NOT NULL DEFAULT 'PENDING' CHECK(approval_status IN ('PENDING','APPROVED','DECLINED')),
 approval_note text,
 approved_at timestamptz,
 linked_job_card text UNIQUE,
 created_by text NOT NULL REFERENCES public.staff_credentials(user_id),
 created_at timestamptz NOT NULL DEFAULT now(),
 updated_at timestamptz NOT NULL DEFAULT now(),
 revision integer NOT NULL DEFAULT 1 CHECK(revision>0),
 CHECK((linked_job_card IS NULL) OR (approval_status='APPROVED')),
 CHECK((approval_status='APPROVED' AND approved_at IS NOT NULL) OR (approval_status<>'APPROVED' AND approved_at IS NULL))
);
CREATE INDEX IF NOT EXISTS mechanical_prejob_registration_idx ON zukait_mechanical.prejob_checklists(lower(registration));
CREATE SEQUENCE IF NOT EXISTS zukait_mechanical.prejob_checklist_seq START WITH 1;
ALTER TABLE zukait_mechanical.prejob_checklists ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON zukait_mechanical.prejob_checklists FROM PUBLIC, anon, authenticated;
GRANT SELECT, INSERT, UPDATE ON zukait_mechanical.prejob_checklists TO service_role;
REVOKE ALL ON SEQUENCE zukait_mechanical.prejob_checklist_seq FROM PUBLIC, anon, authenticated;
GRANT USAGE ON SEQUENCE zukait_mechanical.prejob_checklist_seq TO service_role;
-- The existing Mechanical checklists and their Job Card / task relations
-- are deliberately unchanged. A separate guarded linking operation is needed
-- before a prejob checklist can be converted to an active Job Card.
