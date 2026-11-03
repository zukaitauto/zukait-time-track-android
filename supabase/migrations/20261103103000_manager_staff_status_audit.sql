-- Manager-only staff activation/deactivation, no deletion of workshop history.
-- Called by staff-auth with a validated Manager session AND fresh password confirmation.
-- This function uses SECURITY INVOKER; only service_role may call it.
create table if not exists public.staff_status_audit (
  request_id uuid primary key,
  actor_id text not null references public.staff_credentials(user_id),
  target_id text not null references public.staff_credentials(user_id),
  previous_active boolean not null,
  new_active boolean not null,
  reason text not null check (char_length(btrim(reason)) between 3 and 2000),
  changed_at timestamptz not null default now()
);
alter table public.staff_status_audit enable row level security;
revoke all on table public.staff_status_audit from public, anon, authenticated;
grant select, insert on table public.staff_status_audit to service_role;

create or replace function public.zukait_manager_staff_status(
  p_actor_id text,
  p_target_id text,
  p_active boolean,
  p_reason text,
  p_request_id uuid
) returns jsonb
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_actor_role text;
  v_actor_active boolean;
  v_target_role text;
  v_target_active boolean;
  v_prior public.staff_status_audit%rowtype;
  v_changed_at timestamptz := now();
begin
  if p_actor_id is null or p_target_id is null or p_request_id is null or p_active is null
     or char_length(btrim(coalesce(p_reason, ''))) not between 3 and 2000 then
    raise exception 'staff_status_invalid_request';
  end if;

  -- Serialize retries by request ID and make them strictly idempotent.
  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(p_request_id::text, 0));
  select * into v_prior from public.staff_status_audit where request_id = p_request_id;
  if found then
    if v_prior.actor_id = p_actor_id and v_prior.target_id = p_target_id
       and v_prior.new_active = p_active and v_prior.reason = btrim(p_reason) then
      return pg_catalog.jsonb_build_object(
        'ok', true, 'duplicate', true, 'target_id', v_prior.target_id,
        'active', v_prior.new_active, 'changed_at', v_prior.changed_at
      );
    end if;
    raise exception 'staff_status_request_conflict';
  end if;

  select role, active into v_actor_role, v_actor_active
    from public.staff_credentials where user_id = p_actor_id for share;
  if not found or v_actor_role <> 'Manager' or v_actor_active is distinct from true then
    raise exception 'staff_status_manager_required';
  end if;

  if p_actor_id = p_target_id then
    raise exception 'staff_status_self_forbidden';
  end if;

  select role, active into v_target_role, v_target_active
    from public.staff_credentials where user_id = p_target_id for update;
  if not found then
    raise exception 'staff_status_not_found';
  end if;
  -- Manager roles and Accountant accounts use distinct administration workflows.
  if v_target_role not in ('Employee','Supervisor','Mechanical Supervisor','Purchaser','Receptionist') then
    raise exception 'staff_status_role_forbidden';
  end if;
  if v_target_active is not distinct from p_active then
    raise exception 'staff_status_unchanged';
  end if;

  update public.staff_credentials
    set active = p_active, updated_at = v_changed_at
    where user_id = p_target_id;

  -- Revocation is part of the SAME transaction as the account status change.
  -- Re-activation never un-revokes an old session: a fresh login is required.
  if p_active = false then
    update public.staff_sessions set revoked_at = v_changed_at
      where user_id = p_target_id and revoked_at is null;
  end if;

  insert into public.staff_status_audit
    (request_id, actor_id, target_id, previous_active, new_active, reason, changed_at)
  values
    (p_request_id, p_actor_id, p_target_id, v_target_active, p_active, btrim(p_reason), v_changed_at);

  return pg_catalog.jsonb_build_object(
    'ok', true, 'duplicate', false, 'target_id', p_target_id,
    'active', p_active, 'changed_at', v_changed_at
  );
end;
$$;

revoke all on function public.zukait_manager_staff_status(text,text,boolean,text,uuid) from public, anon, authenticated;
grant execute on function public.zukait_manager_staff_status(text,text,boolean,text,uuid) to service_role;
