-- ZUKAIT: canonical Clear + Hardener merge
-- PREREQUISITE: deploy the workshop-api preserveConsumablesHistory materialAliases guard
-- from architecture-v2 commit cb5ae0824b9e59980680ebcddb2f6070fde71e55 or newer.
-- Backup #18, created 2026-11-08, is a pre-merge recovery checkpoint.
-- Run once; preserves original audit snapshots and per-line costs.
BEGIN;
DO $$
DECLARE
 v_id text;
 v_revision bigint;
 v_data jsonb;
 v_c jsonb;
 v_old constant text := 'mat-ec683af8-566f-4ca1-a727-77d09f6cbb66';
 v_new constant text := 'mat-bb11a6ab-c44f-45c0-b909-de94ea534f94';
 v_oldcount int;
 v_newcount int;
 v_oldprice int;
 v_oldissue int;
 v_oldactual int;
 v_before_cost numeric;
 v_after_cost numeric;
 v_m jsonb;
 v_rows jsonb;
 v_row jsonb;
 v_lines jsonb;
 v_item jsonb;
 v_ord bigint;
 v_lord bigint;
 v_next jsonb;
BEGIN
 SELECT id,revision,data INTO v_id,v_revision,v_data
 FROM public.workshop_state FOR UPDATE;
 IF v_id IS NULL THEN RAISE EXCEPTION 'Missing workshop state'; END IF;
 v_c:=v_data->'consumables';
 IF v_c IS NULL THEN RAISE EXCEPTION 'Missing consumables'; END IF;
 IF coalesce(v_c->'materialAliases'->>v_old,'')=v_new THEN
   RAISE NOTICE 'Merge already applied'; RETURN;
 END IF;
 SELECT count(*) INTO v_oldcount FROM jsonb_array_elements(v_c->'materials') x WHERE x->>'id'=v_old;
 SELECT count(*) INTO v_newcount FROM jsonb_array_elements(v_c->'materials') x WHERE x->>'id'=v_new;
 IF v_oldcount<>1 OR v_newcount<>1 THEN RAISE EXCEPTION 'Unexpected material master counts %, %',v_oldcount,v_newcount; END IF;
 IF NOT EXISTS (SELECT 1 FROM public.workshop_backups WHERE id=18 AND created_by='SYSTEM_PRE_CLEAR_HARDENER_MERGE') THEN
  RAISE EXCEPTION 'Pre-merge backup #18 missing';
 END IF;
 SELECT count(*) INTO v_oldprice FROM jsonb_array_elements(v_c->'prices') x WHERE x->>'materialId'=v_old;
 IF v_oldprice<>1 THEN RAISE EXCEPTION 'Unexpected legacy price count %',v_oldprice; END IF;
 SELECT count(*) INTO v_oldissue
 FROM jsonb_array_elements(v_c->'issues') x,
 LATERAL jsonb_array_elements(coalesce(x->'lines','[]'::jsonb)) l
 WHERE l->>'materialId'=v_old;
 SELECT count(*) INTO v_oldactual
 FROM jsonb_array_elements(v_c->'actuals') x,
 LATERAL jsonb_array_elements(coalesce(x->'lines','[]'::jsonb)) l
 WHERE l->>'materialId'=v_old;
 IF v_oldissue<>29 OR v_oldactual<>29 THEN
  RAISE EXCEPTION 'Legacy references changed: issues %, actuals %',v_oldissue,v_oldactual;
 END IF;
 SELECT coalesce(sum((l->>'lineCost')::numeric),0) INTO v_before_cost
 FROM jsonb_array_elements(v_c->'actuals') a,
 LATERAL jsonb_array_elements(coalesce(a->'lines','[]'::jsonb)) l;
 -- Retire old master; keep the existing canonical master (unit and category).
 SELECT coalesce(jsonb_agg(x.value ORDER BY x.ordinality),'[]'::jsonb) INTO v_rows
 FROM jsonb_array_elements(v_c->'materials') WITH ORDINALITY x(value,ordinality)
 WHERE x.value->>'id'<>v_old;
 v_c:=jsonb_set(v_c,'{materials}',v_rows);
 -- Historical price records remain separate by brand and retain their IDs and effective dates.
 SELECT coalesce(jsonb_agg(
   CASE WHEN x.value->>'materialId'=v_old
        THEN jsonb_set(x.value,'{materialId}',to_jsonb(v_new))
        ELSE x.value END ORDER BY x.ordinality),'[]'::jsonb)
 INTO v_rows FROM jsonb_array_elements(v_c->'prices') WITH ORDINALITY x(value,ordinality);
 v_c:=jsonb_set(v_c,'{prices}',v_rows);
 -- Remap material references only; never recompute issued/actual quantities or costs.
 FOREACH v_m IN ARRAY ARRAY['"issues"'::jsonb,'"actuals"'::jsonb] LOOP
   v_rows:='[]'::jsonb;
   FOR v_row,v_ord IN
     SELECT value,ordinality FROM jsonb_array_elements(v_c->trim(both '"' from v_m::text)) WITH ORDINALITY
   LOOP
     v_lines:='[]'::jsonb;
     FOR v_item,v_lord IN SELECT value,ordinality FROM jsonb_array_elements(coalesce(v_row->'lines','[]'::jsonb)) WITH ORDINALITY LOOP
       IF v_item->>'materialId'=v_old THEN v_item:=jsonb_set(v_item,'{materialId}',to_jsonb(v_new)); END IF;
       v_lines:=v_lines||jsonb_build_array(v_item);
     END LOOP;
     v_rows:=v_rows||jsonb_build_array(jsonb_set(v_row,'{lines}',v_lines));
   END LOOP;
   v_c:=jsonb_set(v_c,ARRAY[trim(both '"' from v_m::text)],v_rows);
 END LOOP;
 v_c:=jsonb_set(v_c,'{materialAliases}',coalesce(v_c->'materialAliases','{}'::jsonb)||jsonb_build_object(v_old,v_new));
 v_c:=jsonb_set(v_c,'{audit}',coalesce(v_c->'audit','[]'::jsonb)||jsonb_build_array(jsonb_build_object(
  'id','merge-clear-hardener-'||v_revision::text,
  'type','MATERIAL_CANONICAL_MERGE',
  'at',floor(extract(epoch from clock_timestamp())*1000),
  'by','SYSTEM_PREAUTHORIZED',
  'reason','Merge Clear+Hardener SAYARA and Clear + Hardener AUTO PAINT into one canonical material; preserve prices and cost',
  'fromMaterialId',v_old,'toMaterialId',v_new,
  'references',jsonb_build_object('issued',v_oldissue,'actual',v_oldactual,'prices',v_oldprice)
 )));
 SELECT coalesce(sum((l->>'lineCost')::numeric),0) INTO v_after_cost
 FROM jsonb_array_elements(v_c->'actuals') a,
 LATERAL jsonb_array_elements(coalesce(a->'lines','[]'::jsonb)) l;
 IF v_before_cost<>v_after_cost THEN RAISE EXCEPTION 'Cost changed from % to %',v_before_cost,v_after_cost; END IF;
 v_next:=jsonb_set(v_data,'{consumables}',v_c);
 UPDATE public.workshop_state SET data=v_next, revision=v_revision+1,
 updated_at=clock_timestamp(),updated_by='SYSTEM_PREAUTHORIZED_CLEAR_HARDENER_MERGE'
 WHERE id=v_id AND revision=v_revision;
 IF NOT FOUND THEN RAISE EXCEPTION 'Revision conflict'; END IF;
 RAISE NOTICE 'Merged material refs with unchanged total cost %',v_after_cost;
END $$;
COMMIT;
