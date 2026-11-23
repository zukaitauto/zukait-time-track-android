-- ZUKAIT ERP: opt-in compact array patches, BACKWARD COMPATIBLE.
-- Depends on compact history foundation + array patch primitives.
-- QA first; legacy mode behavior stays unchanged.
-- Existing compact revisions have array_patches = {} by default.
-- No existing rows are deleted, no history is pruned, no cutover occurs.

alter table zukait_history.revisions
 add column if not exists array_patches jsonb not null default '{}'::jsonb;
alter table zukait_history.revisions
 drop constraint if exists revisions_array_patches_object_ck;
alter table zukait_history.revisions
 add constraint revisions_array_patches_object_ck
 check (jsonb_typeof(array_patches)='object');

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

  insert into zukait_history.revisions(
    revision,kind,payload,updated_at,updated_by,state_digest)
  values (old.revision,'checkpoint',old.data,old.updated_at,old.updated_by,md5(old.data::text))
  on conflict (revision) do nothing;

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

create or replace function zukait_history.reconstruct_state(p_revision bigint)
returns jsonb language plpgsql stable security definer
set search_path=pg_catalog,zukait_history,public
as $$
declare
  v_anchor bigint;
  v_state jsonb;
  v_previous jsonb;
  v_expected bigint;
  v_record record;
  v_patch record;
begin
  select revision,payload into v_anchor,v_state
  from zukait_history.revisions
  where revision <= p_revision and kind='checkpoint'
  order by revision desc limit 1;

  if v_anchor is null then
    select data into v_state from public.workshop_state_history
    where revision=p_revision;
    if found then return v_state; end if;
    raise exception 'history_checkpoint_missing_for_revision_%',p_revision;
  end if;

  v_expected:=v_anchor;
  for v_record in
    select revision,kind,payload,removed_keys,array_patches,state_digest
    from zukait_history.revisions
    where revision >= v_anchor and revision <= p_revision
    order by revision
  loop
    if v_record.revision <> v_expected and v_record.revision <> v_expected+1 then
      raise exception 'history_gap_at_revision_%',v_expected+1;
    end if;

    if v_record.kind='checkpoint' then
      v_state:=v_record.payload;
    else
      v_previous:=v_state;
      v_state:=(v_state-v_record.removed_keys) || v_record.payload;
      for v_patch in select key,value from jsonb_each(v_record.array_patches)
      loop
        if jsonb_typeof(v_previous->v_patch.key)<>'array' then
          raise exception 'history_patch_base_missing_revision_%_key_%',
            v_record.revision,v_patch.key;
        end if;
        v_state:=jsonb_set(
          v_state,array[v_patch.key],
          zukait_history.apply_array_patch(v_previous->v_patch.key,v_patch.value),
          true
        );
      end loop;
    end if;
    v_expected:=v_record.revision;
    if md5(v_state::text) <> v_record.state_digest then
      raise exception 'history_integrity_mismatch_revision_%',v_expected;
    end if;
  end loop;

  if v_expected <> p_revision then
    raise exception 'history_revision_not_captured_%',p_revision;
  end if;
  return v_state;
end;
$$;
revoke all on function zukait_history.reconstruct_state(bigint)
 from public,anon,authenticated;
grant execute on function zukait_history.reconstruct_state(bigint) to service_role;
