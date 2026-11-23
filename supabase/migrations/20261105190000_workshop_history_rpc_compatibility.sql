-- Service-role-only API for workshop conflict-merge history lookup.
-- Requires compact-history foundation and read-compatibility migration.
-- Returns the original JSON object, or SQL NULL for unknown old revisions.
-- Does not modify existing state or change history capture mode.
create or replace function public.zukait_history_revision_data(p_revision bigint)
returns jsonb
language plpgsql stable security definer
set search_path=pg_catalog,public,zukait_history
as $$
declare
  v_data jsonb;
begin
  select h.data into v_data
  from zukait_history.read_revision(p_revision) h;
  return v_data;
exception when raise_exception then
  if sqlerrm like 'history_revision_not_found_%' then
    return null;
  end if;
  raise;
end;
$$;
revoke all on function public.zukait_history_revision_data(bigint)
from public,anon,authenticated;
grant execute on function public.zukait_history_revision_data(bigint)
to service_role;
comment on function public.zukait_history_revision_data(bigint)
is 'Private service-role revision reader for workshop-api conflict merge; never grant to app clients.';
