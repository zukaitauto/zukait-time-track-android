-- STAGED ONLY: requires the five compact-history foundation/reader/array migrations.
-- Does not install infrastructure, enable compact mode, alter history data,
-- change checkpoint intervals, remove rows or change application permissions.
-- Avoid re-evaluating the complete OLD-state seed on every captured save.
-- Deploy only with separately approved exact-source history rollout.
create or replace function zukait_history.capture_state_update()
returns trigger language plpgsql security definer
set search_path=pg_catalog,zukait_history,public
as $$
declare
  v_mode text;
  v_interval integer;
  v_set jsonb;
  v_removed text[];
  v_kind text;
  v_patches jsonb:='{}'::jsonb;
  v_pair record;
  v_patch jsonb;
begin
  select mode,checkpoint_interval into v_mode,v_interval
  from zukait_history.configuration where singleton=true;
  if coalesce(v_mode,'legacy')='legacy' then return new; end if;
  if new.revision = old.revision and new.data is not distinct from old.data then
    return new;
  end if;
  if new.revision <> old.revision + 1 then
    raise exception 'history_revision_not_sequential: % -> %',old.revision,new.revision;
  end if;

  -- Most OLD revisions were captured as NEW on the preceding save.
  -- Test the indexed revision before evaluating the full payload/digest.
  -- Retain ON CONFLICT for safety; no existing revision is overwritten.
  if not exists (select 1 from zukait_history.revisions where revision=old.revision) then
    insert into zukait_history.revisions(
      revision,kind,payload,updated_at,updated_by,state_digest)
    values (old.revision,'checkpoint',old.data,old.updated_at,old.updated_by,md5(old.data::text))
    on conflict (revision) do nothing;
  end if;

  if (new.revision % v_interval)=0 then
    v_kind:='checkpoint';
    v_set:=new.data;
    v_removed:='{}'::text[];
  else
    v_kind:='delta';
    select coalesce(jsonb_object_agg(e.key,e.value),'{}'::jsonb)
    into v_set
    from jsonb_each(new.data) e
    where (old.data->e.key) is distinct from e.value;

    select coalesce(array_agg(e.key),'{}'::text[])
    into v_removed
    from jsonb_each(old.data) e
    where not (new.data ? e.key);

    -- Only use a positional patch when it materially reduces bytes.
    -- Full replacement remains the fallback for large reorders or rewrites.
    for v_pair in
      select e.key,e.value,old.data->e.key as previous_value
      from jsonb_each(v_set) e
      where jsonb_typeof(e.value)='array'
        and jsonb_typeof(old.data->e.key)='array'
    loop
      v_patch:=zukait_history.make_array_patch(v_pair.previous_value,v_pair.value);
      if pg_column_size(v_patch)*5 <= pg_column_size(v_pair.value)*4 then
        v_set:=v_set-v_pair.key;
        v_patches:=jsonb_set(v_patches,array[v_pair.key],v_patch,true);
      end if;
    end loop;
  end if;

  insert into zukait_history.revisions(
    revision,kind,payload,removed_keys,array_patches,updated_at,updated_by,state_digest)
  values (
    new.revision,v_kind,v_set,v_removed,v_patches,
    new.updated_at,new.updated_by,md5(new.data::text)
  );
  return new;
end;
$$;
revoke all on function zukait_history.capture_state_update() from public,anon,authenticated,service_role;
