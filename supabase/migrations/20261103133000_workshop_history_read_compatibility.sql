-- Backwards-compatible history read API. No destructive writes.
-- Requires 20261103123000_workshop_compact_history_foundation.sql.
-- Migrate all legacy readers before separately approving compact mode.
create or replace function zukait_history.read_revision(p_revision bigint)
returns table(revision bigint,data jsonb,updated_at timestamptz,updated_by text,storage_format text)
language plpgsql stable security definer
set search_path=pg_catalog,zukait_history,public
as $$
declare
  v_rev bigint; v_data jsonb; v_at timestamptz; v_by text; v_kind text;
begin
  if p_revision is null or p_revision < 0 then
    raise exception 'invalid_history_revision';
  end if;
  select s.revision,s.data,s.updated_at,s.updated_by,'current'
  into v_rev,v_data,v_at,v_by,v_kind from public.workshop_state s
  where s.id='main' and s.revision=p_revision;
  if not found then
    select h.revision,h.data,h.updated_at,h.updated_by,'legacy'
    into v_rev,v_data,v_at,v_by,v_kind from public.workshop_state_history h
    where h.revision=p_revision;
  end if;
  if not found then
    select h.revision,zukait_history.reconstruct_state(h.revision),h.updated_at,
           h.updated_by,h.kind
    into v_rev,v_data,v_at,v_by,v_kind
    from zukait_history.revisions h where h.revision=p_revision;
  end if;
  if not found then
    raise exception 'history_revision_not_found_%',p_revision;
  end if;
  revision:=v_rev;data:=v_data;updated_at:=v_at;
  updated_by:=v_by;storage_format:=v_kind;
  return next;
end;
$$;
revoke all on function zukait_history.read_revision(bigint) from public,anon,authenticated;
grant execute on function zukait_history.read_revision(bigint) to service_role;
