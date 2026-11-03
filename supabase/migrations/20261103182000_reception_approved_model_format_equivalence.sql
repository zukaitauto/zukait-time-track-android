-- Preserve one recorded Insurance approval when the vehicle model changes
-- in capitalization or whitespace only (e.g. "420 I" -> "420i").
-- Every other approved identity field remains byte-for-byte checked.
-- Do not synthesize approvals or change their date, actor, or evidence.
create or replace function public.zukait_reception_external_approval_valid(r public.workshop_receptions)
returns boolean
language sql
stable
security invoker
set search_path = public, pg_temp
as $approval$
  select r.job_type='INSURANCE'
    and r.approval_status='APPROVED'
    and r.outcome is null
    and exists(
      select 1
      from (
        select a.identity_snapshot,a.parts_snapshot
        from public.workshop_reception_external_approvals a
        where a.rc_no=r.rc_no
        order by a.recorded_at desc,a.id desc
        limit 1
      ) a
      where (a.identity_snapshot - 'model') =
            (public.zukait_reception_identity(r.details,r.insurance_id) - 'model')
        and regexp_replace(upper(coalesce(a.identity_snapshot->>'model','')),'[[:space:]]+','','g') =
            regexp_replace(upper(coalesce(r.details->>'model','')),'[[:space:]]+','','g')
        and a.parts_snapshot='[]'::jsonb
        and coalesce(
          (select items from public.workshop_reception_preliminary_parts p where p.rc_no=r.rc_no),
          '[]'::jsonb
        )='[]'::jsonb
    );
$approval$;
