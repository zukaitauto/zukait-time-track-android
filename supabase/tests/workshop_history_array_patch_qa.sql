-- ZUKAIT lossless array-patch primitives: QA only, read-only tests.
-- Requires 20261105180000_workshop_history_array_patch_experiment.sql.
DO $verify$
DECLARE
  v_old jsonb;
  v_new jsonb;
  v_patch jsonb;
  v_restored jsonb;
  v_case text;
BEGIN
  FOR v_case IN SELECT unnest(ARRAY[
    'append','update','remove_middle','truncate','reorder','json_null','nested'
  ]) LOOP
    v_old:='[{"id":1,"value":"A"},{"id":2,"value":"B"},{"id":3,"value":"C"}]'::jsonb;
    v_new:=CASE v_case
      WHEN 'append' THEN '[{"id":1,"value":"A"},{"id":2,"value":"B"},{"id":3,"value":"C"},{"id":4,"value":"D"}]'::jsonb
      WHEN 'update' THEN '[{"id":1,"value":"A"},{"id":2,"value":"NEW"},{"id":3,"value":"C"}]'::jsonb
      WHEN 'remove_middle' THEN '[{"id":1,"value":"A"},{"id":3,"value":"C"}]'::jsonb
      WHEN 'truncate' THEN '[{"id":1,"value":"A"}]'::jsonb
      WHEN 'reorder' THEN '[{"id":3,"value":"C"},{"id":2,"value":"B"},{"id":1,"value":"A"}]'::jsonb
      WHEN 'json_null' THEN '[{"id":1,"value":"A"},null,{"id":3,"value":"C"}]'::jsonb
      WHEN 'nested' THEN '[{"id":1,"value":{"nested":[1,2,3]}},{"id":2,"value":"B"},{"id":3,"value":"C"}]'::jsonb
    END;
    v_patch:=zukait_history.make_array_patch(v_old,v_new);
    v_restored:=zukait_history.apply_array_patch(v_old,v_patch);
    IF v_restored IS DISTINCT FROM v_new THEN
      RAISE EXCEPTION 'array_patch_not_lossless: %',v_case;
    END IF;
  END LOOP;

  -- Empty-list corner cases
  v_patch:=zukait_history.make_array_patch('[1,2]'::jsonb,'[]'::jsonb);
  IF zukait_history.apply_array_patch('[1,2]'::jsonb,v_patch)<>'[]'::jsonb
  THEN RAISE EXCEPTION 'empty_array_patch_failed'; END IF;
  v_patch:=zukait_history.make_array_patch('[]'::jsonb,'[null,{"x":1}]'::jsonb);
  IF zukait_history.apply_array_patch('[]'::jsonb,v_patch)
     <> '[null,{"x":1}]'::jsonb
  THEN RAISE EXCEPTION 'append_to_empty_array_failed'; END IF;
END $verify$;
