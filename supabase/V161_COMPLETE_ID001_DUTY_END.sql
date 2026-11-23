-- Complete ID001 assignments when the server closes their sessions at duty end.
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
  v_assignments jsonb;
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
    then case when s.value->>'job' = 'ID001' then
      s.value || jsonb_build_object(
        'end',v_boundary,'finished',true,'paused',false,'autoStopped',true,
        'autoStoppedAt',v_boundary,'autoStopReason','ID001 duty window ended',
        'closeReason','SERVER_DUTY_END')
    else
      s.value || jsonb_build_object(
        'end',v_boundary,'paused',true,'autoPausedAt',v_boundary,
        'autoPauseReason','Server pause at exact duty boundary',
        'closeReason','SERVER_DUTY_END')
    end
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
  select coalesce(jsonb_agg(
    case when a.value->>'job' = 'ID001'
      and coalesce((a.value->>'completed')::boolean,false) = false
      and coalesce((a.value->>'cancelled')::boolean,false) = false
      and exists (
        select 1 from jsonb_array_elements(v_sessions) s
        where s->>'job' = 'ID001'
          and s->>'closeReason' = 'SERVER_DUTY_END'
          and coalesce(nullif(s->>'end','')::bigint,0) = v_boundary
          and (s->>'assignmentId' = a.value->>'id'
            or (nullif(s->>'assignmentId','') is null
                and s->>'emp' = a.value->>'emp'))
      )
    then a.value || jsonb_build_object(
      'completed',true,'completedAt',v_boundary,'autoStopped',true,
      'autoStopReason','Duty hours ended')
    else a.value end order by a.ord), '[]'::jsonb)
  into v_assignments
  from jsonb_array_elements(coalesce(v_state.data->'assign','[]'::jsonb))
       with ordinality as a(value,ord);
  v_data := jsonb_set(jsonb_set(v_state.data,'{sessions}',v_sessions),
                      '{assign}',v_assignments);
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

