-- ZUKAIT ERP: array-level history compression primitives.
-- Experimental, private, NON-ACTIVATING migration: does not modify existing
-- workshop data/history, capture triggers or default history mode.
-- A future reviewed migration may use patches for changed top-level arrays
-- only when the patch is smaller than the complete replacement array.
-- Positional changes preserve insertion, deletion, reorder, JSON null and
-- nested JSON contents. Digest verification remains required on reconstruction.
--
-- make: {"length": <integer>, "changes": {"0": <json>,...}}.
-- Removed tail entries are represented solely by shorter length.
create or replace function zukait_history.make_array_patch(
  p_before jsonb, p_after jsonb
) returns jsonb language sql immutable strict
set search_path=pg_catalog
as $$
  with
  old_rows as (
    select pos-1 as idx, value from jsonb_array_elements(p_before)
    with ordinality t(value,pos)
  ),
  new_rows as (
    select pos-1 as idx, value from jsonb_array_elements(p_after)
    with ordinality t(value,pos)
  ),
  changes as (
    select n.idx,n.value from new_rows n
    left join old_rows o using (idx)
    where n.value is distinct from o.value
  )
  select jsonb_build_object(
    'length',jsonb_array_length(p_after),
    'changes',coalesce(jsonb_object_agg(idx::text,value),'{}'::jsonb)
  )
  from changes;
$$;
revoke all on function zukait_history.make_array_patch(jsonb,jsonb)
from public,anon,authenticated,service_role;

create or replace function zukait_history.apply_array_patch(
  p_before jsonb, p_patch jsonb
) returns jsonb language plpgsql immutable strict
set search_path=pg_catalog
as $$
declare
  v_length integer;
  v_changes jsonb;
  v_result jsonb;
begin
  if jsonb_typeof(p_before)<>'array' or jsonb_typeof(p_patch)<>'object'
     or jsonb_typeof(p_patch->'length')<>'number'
     or jsonb_typeof(p_patch->'changes')<>'object' then
    raise exception 'invalid_compact_array_patch';
  end if;
  v_length:=(p_patch->>'length')::integer;
  v_changes:=p_patch->'changes';
  if v_length<0 or v_length>1000000 then
    raise exception 'invalid_compact_array_length';
  end if;
  select coalesce(
    jsonb_agg(
      case when v_changes ? i::text then v_changes->(i::text)
           else p_before->i end order by i
    ), '[]'::jsonb
  ) into v_result
  from generate_series(0,v_length-1) i;
  if jsonb_array_length(v_result)<>v_length then
    raise exception 'compact_array_patch_length_mismatch';
  end if;
  return v_result;
end;
$$;
revoke all on function zukait_history.apply_array_patch(jsonb,jsonb)
from public,anon,authenticated,service_role;
-- No writes or trigger changes. No production cutover here.
