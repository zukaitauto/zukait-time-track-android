-- Pause open workshop sessions at the exact Oman duty boundaries.
-- pg_cron uses GMT on this project; Oman is UTC+04:00 year-round.
create or replace function public.zukait_pause_at_duty_end()
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  v_local timestamp := clock_timestamp() at time zone 'Asia/Muscat';
  v_hour integer;
  v_boundary bigint;
  v_state public.workshop_state%rowtype;
  v_sessions jsonb;
  v_changed integer;
  v_data jsonb;
begin
  v_hour := extract(hour from v_local)::integer;
  if extract(isodow from v_local)::integer = 5
     or extract(minute from v_local)::integer <> 0
     or v_hour not in (13, 19) then
    return 0;
  end if;
  v_boundary := (extract(epoch from
    ((v_local::date + make_time(v_hour,0,0)) at time zone 'Asia/Muscat')) * 1000)::bigint;
  select * into v_state from public.workshop_state where id = 'main' for update;
  if not found then return 0; end if;

  select coalesce(jsonb_agg(
    case when
      (s.value->'end' is null or s.value->'end' = 'null'::jsonb or s.value->>'end' in ('','0'))
      and (
        (coalesce(nullif(s.value->>'start','')::bigint,0) < v_boundary)
        or (coalesce((s.value->>'autoOvertime')::boolean,false)
            and coalesce(nullif(s.value->>'start','')::bigint,0) = v_boundary
            and coalesce(nullif(s.value->>'overtimeApprovedAt','')::bigint,0) = 0)
      )
    then s.value || jsonb_build_object(
      'end',v_boundary,'paused',true,'autoPausedAt',v_boundary,
      'autoPauseReason','Server pause at exact duty boundary',
      'closeReason','SERVER_DUTY_END')
    else s.value end
    order by s.ord), '[]'::jsonb),
    count(*) filter (where
      (s.value->'end' is null or s.value->'end' = 'null'::jsonb or s.value->>'end' in ('','0'))
      and (
        coalesce(nullif(s.value->>'start','')::bigint,0) < v_boundary
        or (coalesce((s.value->>'autoOvertime')::boolean,false)
            and coalesce(nullif(s.value->>'start','')::bigint,0) = v_boundary
            and coalesce(nullif(s.value->>'overtimeApprovedAt','')::bigint,0) = 0)
      ))
  into v_sessions,v_changed
  from jsonb_array_elements(coalesce(v_state.data->'sessions','[]'::jsonb))
       with ordinality as s(value,ord);

  if v_changed = 0 then return 0; end if;
  v_data := jsonb_set(v_state.data,'{sessions}',v_sessions);
  insert into public.workshop_state_history(revision,data,updated_at,updated_by)
  values(v_state.revision,v_state.data,v_state.updated_at,v_state.updated_by)
  on conflict (revision) do nothing;
  update public.workshop_state
     set data=v_data,revision=v_state.revision+1,
         updated_at=clock_timestamp(),updated_by='server_duty_pause'
   where id='main';
  perform public.zukait_refresh_live_status_from_state(v_data,v_state.revision+1,'server_duty_pause');
  return v_changed;
end;
$$;

revoke all on function public.zukait_pause_at_duty_end() from public,anon,authenticated;
grant execute on function public.zukait_pause_at_duty_end() to service_role;

select cron.schedule('zukait_pause_1300_oman','0 9 * * *',
  'select public.zukait_pause_at_duty_end();');
select cron.schedule('zukait_pause_1900_oman','0 15 * * *',
  'select public.zukait_pause_at_duty_end();');
