-- Read-only job-specific consumables projection. No stock or costing changes.
CREATE OR REPLACE FUNCTION private.project_job_consumables(p_c jsonb,p_job_no text)
RETURNS jsonb LANGUAGE sql IMMUTABLE SECURITY INVOKER SET search_path='' AS $$
 SELECT CASE WHEN p_job_no IS NULL OR btrim(p_job_no)='' OR jsonb_typeof(p_c) IS DISTINCT FROM 'object'
 OR jsonb_typeof(coalesce(p_c->'issues','[]'::jsonb)) IS DISTINCT FROM 'array'
 OR jsonb_typeof(coalesce(p_c->'actuals','[]'::jsonb)) IS DISTINCT FROM 'array'
 THEN jsonb_build_object('ok',false,'code','consumables_unavailable')
 ELSE jsonb_build_object('ok',true,
 'issues',coalesce((SELECT jsonb_agg(e.payload ORDER BY e.pos) FROM jsonb_array_elements(coalesce(p_c->'issues','[]'::jsonb)) WITH ORDINALITY e(payload,pos) WHERE upper(btrim(e.payload->>'jobCard'))=upper(btrim(p_job_no))),'[]'::jsonb),
 'actuals',coalesce((SELECT jsonb_agg(e.payload ORDER BY e.pos) FROM jsonb_array_elements(coalesce(p_c->'actuals','[]'::jsonb)) WITH ORDINALITY e(payload,pos) WHERE upper(btrim(e.payload->>'jobCard'))=upper(btrim(p_job_no))),'[]'::jsonb)) END;
$$;
REVOKE ALL ON FUNCTION private.project_job_consumables(jsonb,text) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION private.project_job_consumables(jsonb,text) TO service_role;
CREATE OR REPLACE FUNCTION public.zukait_job_consumables_read(p_job_no text)
RETURNS jsonb LANGUAGE sql STABLE SECURITY INVOKER SET search_path='' AS $$
 SELECT coalesce((SELECT private.project_job_consumables(s.data->'consumables',p_job_no)||jsonb_build_object('revision',s.revision) FROM public.workshop_state s WHERE id='main'),jsonb_build_object('ok',false,'code','workshop_state_missing'));
$$;
REVOKE ALL ON FUNCTION public.zukait_job_consumables_read(text) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.zukait_job_consumables_read(text) TO service_role;