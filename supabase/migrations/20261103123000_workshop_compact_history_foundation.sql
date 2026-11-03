-- ZUKAIT ERP: non-destructive incremental state-history foundation (v1).
-- DEPLOYMENT POLICY: migration creates infrastructure only; default mode 'legacy'.
-- Existing workshop_state_history rows and current application APIs stay unchanged.
-- A separate reviewed cutover is required before enabling compact mode.
--
-- History stores the complete state at a checkpoint and top-level JSON changes
-- between checkpoints. Rebuild is checked against an MD5 digest of each version.
-- This is lossless even when a section is removed or contains JSON null.
-- A changed large array is still stored whole; array-level diff is future work.
--
-- Never delete historical snapshots without externally verified restore tests.
create schema if not exists zukait_history;
revoke all on schema zukait_history from public, anon, authenticated;

create table if not exists zukait_history.configuration (
  singleton boolean primary key default true check (singleton),
  mode text not null default 'legacy'
    check (mode in ('legacy','dual','compact')),
  checkpoint_interval integer not null default 100
    check (checkpoint_interval between 10 and 1000),
  cutover_approved boolean not null default false,
  updated_at timestamptz not null default now(),
  check (mode <> 'compact' or cutover_approved)
);
insert into zukait_history.configuration(singleton,mode,checkpoint_interval,cutover_approved)
values (true,'legacy',100,false) on conflict (singleton) do nothing;
alter table zukait_history.configuration enable row level security;
revoke all on zukait_history.configuration from public, anon, authenticated, service_role;

create table if not exists zukait_history.revisions (
  revision bigint primary key,
  kind text not null check (kind in ('checkpoint','delta')),
  payload jsonb not null,
  removed_keys text[] not null default '{}'::text[],
  updated_at timestamptz not null,
  updated_by text,
  state_digest text not null check(length(state_digest)=32),
  created_at timestamptz not null default now(),
  check (
    (kind='checkpoint' and cardinality(removed_keys)=0)
    or kind='delta'
  )
);
create index if not exists zukait_history_revisions_time_idx
  on zukait_history.revisions(updated_at desc,revision desc);
alter table zukait_history.revisions enable row level security;
revoke all on zukait_history.revisions from public, anon, authenticated, service_role;

-- All known writers already archive OLD state before updating workshop_state.
-- In compact mode suppress ONLY the large legacy INSERT; the paired AFTER UPDATE
-- below writes a checkpoint/delta atomically in the same transaction.
create or replace function zukait_history.before_legacy_archive()
returns trigger language plpgsql security definer
set search_path = pg_catalog, zukait_history, public
as $$
declare v_mode text; v_approved boolean;
begin
  select mode, cutover_approved into v_mode, v_approved
    from zukait_history.configuration where singleton=true;
  if v_mode='compact' then
    if not coalesce(v_approved,false) then
      raise exception 'compact_history_cutover_not_approved';
    end if;
    return null;
  end if;
  return new;
end;
$$;
revoke all on function zukait_history.before_legacy_archive() from public,anon,authenticated,service_role;
drop trigger if exists zukait_history_archive_gate on public.workshop_state_history;
create trigger zukait_history_archive_gate
before insert on public.workshop_state_history
for each row execute function zukait_history.before_legacy_archive();

-- Works for both app RPC saves and server-side Reception/Mechanical saves.
-- No-write saves with an unchanged revision create no history entry.
create or replace function zukait_history.capture_state_update()
returns trigger language plpgsql security definer
set search_path = pg_catalog, zukait_history, public
as $$
declare
  v_mode text;
  v_interval integer;
  v_set jsonb;
  v_removed text[];
  v_kind text;
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

  -- Seed a full state for the first revision when compact capture starts.
  insert into zukait_history.revisions(
      revision,kind,payload,updated_at,updated_by,state_digest)
  values (old.revision,'checkpoint',old.data,old.updated_at,old.updated_by,
          md5(old.data::text))
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
  end if;

  insert into zukait_history.revisions(
    revision,kind,payload,removed_keys,updated_at,updated_by,state_digest)
  values (
    new.revision,v_kind,v_set,v_removed,new.updated_at,new.updated_by,
    md5(new.data::text)
  );
  return new;
end;
$$;
revoke all on function zukait_history.capture_state_update() from public,anon,authenticated,service_role;
drop trigger if exists zukait_history_capture on public.workshop_state;
create trigger zukait_history_capture
after update of revision,data on public.workshop_state
for each row when (old.revision is distinct from new.revision or old.data is distinct from new.data)
execute function zukait_history.capture_state_update();

-- Exact, bounded reconstruction using the most recent checkpoint.
-- Missing revisions or an integrity mismatch fail closed instead of returning
-- potentially incomplete employee time, job, invoice, or audit records.
create or replace function zukait_history.reconstruct_state(p_revision bigint)
returns jsonb language plpgsql stable security definer
set search_path = pg_catalog, zukait_history, public
as $$
declare
  v_anchor bigint;
  v_state jsonb;
  v_expected bigint;
  v_record record;
  v_digest text;
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
    select revision,kind,payload,removed_keys,state_digest
    from zukait_history.revisions
    where revision >= v_anchor and revision <= p_revision
    order by revision
  loop
    if v_record.revision <> v_expected and
       v_record.revision <> v_expected+1 then
      raise exception 'history_gap_at_revision_%',v_expected+1;
    end if;
    if v_record.kind='checkpoint' then
      v_state:=v_record.payload;
    else
      v_state:=(v_state - v_record.removed_keys) || v_record.payload;
    end if;
    v_expected:=v_record.revision;
    v_digest:=v_record.state_digest;
    if md5(v_state::text) <> v_digest then
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
grant usage on schema zukait_history to service_role;
grant execute on function zukait_history.reconstruct_state(bigint) to service_role;

-- Cutover PRECONDITIONS (not performed by this migration):
-- 1) Restore a current verified backup to isolated staging.
-- 2) Enable 'dual' on staging and test every save path and per-revision digest.
-- 3) Convert legacy history readers to reconstruct_state and prove rollback.
-- 4) Only then approve a separate compact-mode migration.
-- 5) No backfill, deletion, VACUUM FULL, or destructive cleanup in this release.
