-- V129 post-release backend fix: recognize JSON null end values as open sessions.
-- Applied to production on 2026-09-24 after live-status consistency audit.
-- This preserves the existing live-status function and only corrects its open-session predicate.

do $$
declare
  d text;
  old_text text := 'and ((not (s ? ''end'')) or s->''end'' is null or s->>''end'' in ('''',''null''))';
  new_text text := 'and ((not (s ? ''end'')) or s->''end'' = ''null''::jsonb or coalesce(s->>''end'','''') in ('''',''null'',''0''))';
begin
  select pg_get_functiondef(
    'public.zukait_refresh_live_status_from_state(jsonb,bigint,text)'::regprocedure
  ) into d;

  if position(old_text in d)=0 then
    raise exception 'Expected V126 open-session condition not found';
  end if;

  d := replace(d, old_text, new_text);
  execute d;
end $$;

-- Refresh derived live rows from the authoritative workshop state.
select public.zukait_refresh_live_status_from_state(data,revision,updated_by)
from public.workshop_state
where id='main';
