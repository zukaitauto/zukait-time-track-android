-- QA-verified, additive read path; create a tracked migration before rollout.
BEGIN;
CREATE OR REPLACE FUNCTION public.zukait_job_edit_current_page(p_job_no text, p_before_position bigint DEFAULT NULL::bigint, p_limit integer DEFAULT 50, p_expected_revision bigint DEFAULT NULL::bigint)
 RETURNS jsonb
 LANGUAGE sql
 STABLE
 SET search_path TO ''
AS $function$
with current_state as materialized (
  select revision, coalesce(data->'jobEdits','[]'::jsonb) as edits
  from public.workshop_state where id='main'
), settings as (
  select greatest(1,least(coalesce(p_limit,50),100)) as page_size
), matched as materialized (
  select e.pos as audit_position,e.payload
  from current_state s cross join lateral jsonb_array_elements(s.edits) with ordinality e(payload,pos)
  where p_job_no is not null and btrim(p_job_no) <> ''
    and coalesce(nullif(e.payload->>'job',''),e.payload#>>'{old,no}',e.payload#>>'{newValue,no}')=p_job_no
    and (p_before_position is null or e.pos<p_before_position)
    and (p_expected_revision is null or s.revision=p_expected_revision)
  order by e.pos desc limit (select page_size+1 from settings)
), page as (
  select * from matched order by audit_position desc limit (select page_size from settings)
)
select coalesce((select case
  when p_job_no is null or btrim(p_job_no)='' or (p_before_position is not null and (p_before_position<1 or p_expected_revision is null)) then jsonb_build_object('ok',false,'code','invalid_audit_cursor')
  when p_expected_revision is not null and s.revision<>p_expected_revision then jsonb_build_object('ok',false,'code','audit_revision_changed','revision',s.revision)
  else jsonb_build_object('ok',true,'revision',s.revision,'rows',coalesce((select jsonb_agg(to_jsonb(p) order by p.audit_position desc) from page p),'[]'::jsonb),'next_position',case when (select count(*) from matched)>(select page_size from settings) then (select min(audit_position) from page) else null end)
  end from current_state s),jsonb_build_object('ok',false,'code','workshop_state_missing'));
$function$;
REVOKE ALL ON FUNCTION public.zukait_job_edit_current_page(text,bigint,integer,bigint) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.zukait_job_edit_current_page(text,bigint,integer,bigint) TO service_role;
COMMIT;
