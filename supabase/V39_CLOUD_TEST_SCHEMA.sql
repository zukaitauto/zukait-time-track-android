-- Zukait Time Track V39 Cloud Multi-User TEST
-- TEST-ONLY shared-state schema.
-- This intentionally allows the mobile app's publishable key to read/write one shared workshop state.
-- Before production, replace this with Supabase Auth + role-based RLS and normalized tables.

create table if not exists public.workshop_state (
  id text primary key,
  revision bigint not null default 0,
  data jsonb not null default '{}'::jsonb,
  updated_at timestamptz not null default now(),
  updated_by text
);

alter table public.workshop_state enable row level security;

revoke all on table public.workshop_state from anon, authenticated;
grant select, insert, update on table public.workshop_state to anon, authenticated;

drop policy if exists "v39 test read shared state" on public.workshop_state;
create policy "v39 test read shared state"
on public.workshop_state
for select
to anon, authenticated
using (id = 'main');

drop policy if exists "v39 test insert shared state" on public.workshop_state;
create policy "v39 test insert shared state"
on public.workshop_state
for insert
to anon, authenticated
with check (id = 'main');

drop policy if exists "v39 test update shared state" on public.workshop_state;
create policy "v39 test update shared state"
on public.workshop_state
for update
to anon, authenticated
using (id = 'main')
with check (id = 'main');

create or replace function public.zukait_save_workshop_state(
  p_expected_revision bigint,
  p_data jsonb,
  p_changed_by text default null
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_revision bigint;
  v_next bigint;
begin
  select revision
    into v_revision
    from public.workshop_state
   where id = 'main'
   for update;

  if not found then
    if coalesce(p_expected_revision, 0) <> 0 then
      return jsonb_build_object('ok', false, 'reason', 'missing', 'revision', 0);
    end if;

    insert into public.workshop_state(id, revision, data, updated_at, updated_by)
    values ('main', 1, coalesce(p_data, '{}'::jsonb), now(), p_changed_by);

    return jsonb_build_object('ok', true, 'revision', 1, 'created', true);
  end if;

  if v_revision <> coalesce(p_expected_revision, -1) then
    return jsonb_build_object('ok', false, 'reason', 'conflict', 'revision', v_revision);
  end if;

  v_next := v_revision + 1;

  update public.workshop_state
     set revision = v_next,
         data = coalesce(p_data, '{}'::jsonb),
         updated_at = now(),
         updated_by = p_changed_by
   where id = 'main';

  return jsonb_build_object('ok', true, 'revision', v_next);
end;
$$;

revoke all on function public.zukait_save_workshop_state(bigint, jsonb, text) from public;
grant execute on function public.zukait_save_workshop_state(bigint, jsonb, text) to anon, authenticated;

comment on table public.workshop_state is
'V39 TEST ONLY. Single shared JSON workshop state for multi-phone pilot. Replace with normalized tables + Auth/RLS before production.';
