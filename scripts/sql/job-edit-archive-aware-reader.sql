-- Additive archive-aware reader; does not activate the archive or change workshop state.
CREATE SCHEMA IF NOT EXISTS private;
CREATE TABLE IF NOT EXISTS private.workshop_job_edit_audit_baseline (
 snapshot_revision bigint NOT NULL, position bigint NOT NULL, job_no text NOT NULL, payload jsonb NOT NULL,
 PRIMARY KEY(snapshot_revision,position)
);
CREATE INDEX IF NOT EXISTS workshop_job_edit_audit_baseline_page_idx
 ON private.workshop_job_edit_audit_baseline(snapshot_revision,job_no,position DESC);
ALTER TABLE private.workshop_job_edit_audit_baseline ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON private.workshop_job_edit_audit_baseline FROM PUBLIC, anon, authenticated;
GRANT USAGE ON SCHEMA private TO service_role;
GRANT SELECT ON private.workshop_job_edit_audit_baseline TO service_role;

CREATE OR REPLACE FUNCTION private.job_edit_audit_page_from_state(
 p_data jsonb,p_revision bigint,p_job_no text,p_before_position bigint,p_limit integer,p_expected_revision bigint
) RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY INVOKER SET search_path='' AS $$
DECLARE
 marker jsonb := p_data->'jobEditArchive';
 prefix_count bigint := 0;
 source_revision bigint;
 n bigint; lo bigint; hi bigint;
 page_size integer := greatest(1,least(coalesce(p_limit,50),100));
 response jsonb;
BEGIN
 IF p_job_no IS NULL OR btrim(p_job_no)='' OR (p_before_position IS NOT NULL AND (p_before_position<1 OR p_expected_revision IS NULL)) THEN
   RETURN jsonb_build_object('ok',false,'code','invalid_audit_cursor');
 END IF;
 IF p_expected_revision IS NOT NULL AND p_expected_revision<>p_revision THEN
   RETURN jsonb_build_object('ok',false,'code','audit_revision_changed','revision',p_revision);
 END IF;
 IF jsonb_typeof(coalesce(p_data->'jobEdits','[]'::jsonb)) <> 'array' THEN
   RETURN jsonb_build_object('ok',false,'code','audit_history_unavailable');
 END IF;
 IF marker IS NOT NULL THEN
   IF jsonb_typeof(marker)<>'object' OR coalesce(marker->>'snapshotRevision','') !~ '^[0-9]{1,15}$'
      OR coalesce(marker->>'prefixCount','') !~ '^[1-9][0-9]{0,14}$' THEN
     RETURN jsonb_build_object('ok',false,'code','audit_history_unavailable');
   END IF;
   source_revision:=(marker->>'snapshotRevision')::bigint;
   prefix_count:=(marker->>'prefixCount')::bigint;
   IF source_revision>p_revision THEN RETURN jsonb_build_object('ok',false,'code','audit_history_unavailable'); END IF;
   SELECT count(*),min(position),max(position) INTO n,lo,hi FROM private.workshop_job_edit_audit_baseline WHERE snapshot_revision=source_revision;
   IF n<>prefix_count OR lo<>1 OR hi<>prefix_count THEN RETURN jsonb_build_object('ok',false,'code','audit_history_unavailable'); END IF;
 END IF;
 WITH matched AS MATERIALIZED (
   SELECT q.audit_position,q.payload FROM (
     SELECT b.position AS audit_position,b.payload
     FROM private.workshop_job_edit_audit_baseline b
     WHERE source_revision IS NOT NULL AND b.snapshot_revision=source_revision AND b.job_no=p_job_no
     AND (p_before_position IS NULL OR b.position<p_before_position)
     UNION ALL
     SELECT prefix_count+e.pos AS audit_position,e.payload
     FROM jsonb_array_elements(coalesce(p_data->'jobEdits','[]'::jsonb)) WITH ORDINALITY e(payload,pos)
     WHERE coalesce(nullif(e.payload->>'job',''),e.payload#>>'{old,no}',e.payload#>>'{newValue,no}')=p_job_no
     AND (p_before_position IS NULL OR prefix_count+e.pos<p_before_position)
   ) q ORDER BY audit_position DESC LIMIT page_size+1
 ), page AS (
   SELECT * FROM matched ORDER BY audit_position DESC LIMIT page_size
 )
 SELECT jsonb_build_object('ok',true,'revision',p_revision,
   'rows',coalesce((SELECT jsonb_agg(to_jsonb(p) ORDER BY p.audit_position DESC) FROM page p),'[]'::jsonb),
   'next_position',CASE WHEN (SELECT count(*) FROM matched)>page_size THEN (SELECT min(audit_position) FROM page) ELSE NULL END)
 INTO response;
 RETURN response;
END;
$$;
REVOKE ALL ON FUNCTION private.job_edit_audit_page_from_state(jsonb,bigint,text,bigint,integer,bigint) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION private.job_edit_audit_page_from_state(jsonb,bigint,text,bigint,integer,bigint) TO service_role;

CREATE OR REPLACE FUNCTION public.zukait_job_edit_current_page(p_job_no text,p_before_position bigint DEFAULT NULL,p_limit integer DEFAULT 50,p_expected_revision bigint DEFAULT NULL)
RETURNS jsonb LANGUAGE sql STABLE SECURITY INVOKER SET search_path='' AS $$
 SELECT coalesce((SELECT private.job_edit_audit_page_from_state(s.data,s.revision,p_job_no,p_before_position,p_limit,p_expected_revision)
 FROM public.workshop_state s WHERE s.id='main'),jsonb_build_object('ok',false,'code','workshop_state_missing'));
$$;
REVOKE ALL ON FUNCTION public.zukait_job_edit_current_page(text,bigint,integer,bigint) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.zukait_job_edit_current_page(text,bigint,integer,bigint) TO service_role;