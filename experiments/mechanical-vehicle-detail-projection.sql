-- Additive read projection draft; no existing data or permissions change.
-- Generate a timestamped migration with Supabase CLI before release.
DO $patch$
DECLARE source text; updated text;
BEGIN
 SELECT pg_get_functiondef('public.zukait_mechanical_section(text,text,jsonb)'::regprocedure) INTO source;
 updated:=replace(source,
 $old$'customerName',j->'customerName'$old$,
 $new$'customerName',coalesce(j->'customer',j->'customerName'),'customer',coalesce(j->'customer',j->'customerName'),'jobIntakeOdometer',case when j ? 'jobIntakeOdometer' then j->'jobIntakeOdometer' else coalesce(j->'intakeOdometer',j->'odometer') end,'jobIntakeOdometerUnit',coalesce(j->'jobIntakeOdometerUnit',j->'intakeOdometerUnit',j->'odometerUnit','"KM"'::jsonb)$new$);
 IF updated=source THEN RAISE EXCEPTION 'mechanical_projection_source_requires_review'; END IF;
 EXECUTE updated;
END $patch$;
