begin;

create table if not exists public.workshop_v2_preliminary_links(
  session_id text primary key,
  job_card text not null,
  source_job text not null default 'ID001',
  linked_event_id text not null unique,
  linked_by text,
  linked_at timestamptz not null default now(),
  reversed_event_id text unique,
  reversed_by text,
  reversed_at timestamptz,
  reversal_reason text
);

create or replace function public.zukait_v2_apply_preliminary_link_event(
  p_event_id text,p_entity_id text,p_event_type text,p_actor_id text,p_payload jsonb
) returns void language plpgsql security invoker set search_path=public as $$
declare v_session text:=trim(coalesce(p_payload->>'sessionId',p_entity_id,''));
declare v_job text:=upper(trim(coalesce(p_payload->>'jobCard','')));
declare v_row public.workshop_v2_preliminary_links%rowtype;
begin
  if v_session='' then raise exception 'preliminary_session_required'; end if;
  if p_event_type='ID001_PRELIMINARY_LINKED' then
    if v_job='' then raise exception 'preliminary_job_required'; end if;
    select * into v_row from public.workshop_v2_preliminary_links where session_id=v_session for update;
    if found and v_row.reversed_at is null then
      if v_row.job_card=v_job and v_row.linked_event_id=p_event_id then return; end if;
      raise exception 'preliminary_session_already_linked';
    end if;
    insert into public.workshop_v2_preliminary_links(session_id,job_card,linked_event_id,linked_by,linked_at,reversed_event_id,reversed_by,reversed_at,reversal_reason)
    values(v_session,v_job,p_event_id,nullif(p_actor_id,''),now(),null,null,null,null)
    on conflict(session_id) do update set job_card=excluded.job_card,linked_event_id=excluded.linked_event_id,linked_by=excluded.linked_by,linked_at=excluded.linked_at,reversed_event_id=null,reversed_by=null,reversed_at=null,reversal_reason=null;
  elsif p_event_type='ID001_PRELIMINARY_REVERSED' then
    select * into v_row from public.workshop_v2_preliminary_links where session_id=v_session for update;
    if not found or v_row.reversed_at is not null then raise exception 'preliminary_link_not_active'; end if;
    if trim(coalesce(p_payload->>'reason',''))='' then raise exception 'preliminary_reversal_reason_required'; end if;
    update public.workshop_v2_preliminary_links set reversed_event_id=p_event_id,reversed_by=nullif(p_actor_id,''),reversed_at=now(),reversal_reason=left(trim(p_payload->>'reason'),240) where session_id=v_session;
  else raise exception 'invalid_preliminary_event';
  end if;
end;$$;

revoke all on function public.zukait_v2_apply_preliminary_link_event(text,text,text,text,jsonb) from public,anon,authenticated;
grant execute on function public.zukait_v2_apply_preliminary_link_event(text,text,text,text,jsonb) to service_role;

commit;
