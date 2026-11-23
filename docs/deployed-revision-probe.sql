-- Record of the already deployed workshop_single_round_trip_revision_probe migration.
-- No migration is required for this traffic rollout.
create or replace function public.zukait_workshop_revision_probe(p_token_hash text)
returns jsonb
language plpgsql
security invoker
set search_path = pg_catalog, public
as $function$
declare
  v_user jsonb;
  v_last_seen timestamptz;
  v_revision bigint;
  v_updated_at timestamptz;
  v_updated_by text;
begin
  select jsonb_build_object('id', c.user_id, 'name', c.display_name,
           'role', c.role, 'department', c.department), s.last_seen_at
    into v_user, v_last_seen
    from public.staff_sessions s
    join public.staff_credentials c on c.user_id = s.user_id
   where s.token_hash = p_token_hash
     and s.revoked_at is null
     and c.active = true
     and not (c.role in ('Receptionist','Accountant') and coalesce(c.must_change,false))
   limit 1;
  if v_user is null then
    return jsonb_build_object('ok',false,'code','invalid_session');
  end if;

  if v_last_seen is null or v_last_seen <= statement_timestamp()-interval '60 seconds' then
    update public.staff_sessions
       set last_seen_at=statement_timestamp()
     where token_hash=p_token_hash
       and (last_seen_at is null or last_seen_at <= statement_timestamp()-interval '60 seconds');
  end if;

  -- These roles keep their existing restricted API routing in the Edge Function.
  if v_user->>'role' in ('Receptionist','Accountant') then
    return jsonb_build_object('ok',true,'user',v_user);
  end if;

  select revision, updated_at, updated_by
    into v_revision, v_updated_at, v_updated_by
    from public.workshop_state where id='main';
  if not found then
    return jsonb_build_object('ok',false,'code','missing','user',v_user);
  end if;
  return jsonb_build_object('ok',true,'user',v_user,'revision',v_revision,
    'updated_at',v_updated_at,'updated_by',v_updated_by);
end;
$function$;
revoke all on function public.zukait_workshop_revision_probe(text) from public, anon, authenticated;
grant execute on function public.zukait_workshop_revision_probe(text) to service_role;

