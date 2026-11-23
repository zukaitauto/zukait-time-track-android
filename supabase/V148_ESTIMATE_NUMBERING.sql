begin;

create table if not exists public.workshop_v2_estimate_numbers(
  estimate_no text primary key,
  sequence_no bigint not null unique,
  client_key text not null unique,
  created_at timestamptz not null default now(),
  created_by text
);

alter table public.workshop_v2_estimate_numbers enable row level security;
revoke all on table public.workshop_v2_estimate_numbers from anon, authenticated;
grant select, insert, update, delete on table public.workshop_v2_estimate_numbers to service_role;

create sequence if not exists public.workshop_v2_estimate_no_seq start 1;

create or replace function public.zukait_v2_allocate_estimate_no(
  p_actor_id text,
  p_client_key text
)
returns table(
  estimate_no text,
  sequence_no bigint,
  created_at timestamptz,
  created_by text
)
language plpgsql
security invoker
set search_path=public
as $$
declare
  v_seq bigint;
  v_no text;
  v_key text;
begin
  v_key:=nullif(trim(coalesce(p_client_key,'')),'');
  if v_key is null then raise exception 'client_key_required'; end if;

  if exists(select 1 from public.workshop_v2_estimate_numbers e where e.client_key=v_key) then
    return query
      select e.estimate_no,e.sequence_no,e.created_at,e.created_by
      from public.workshop_v2_estimate_numbers e
      where e.client_key=v_key
      limit 1;
    return;
  end if;

  v_seq:=nextval('public.workshop_v2_estimate_no_seq');
  v_no:='Zi-Qt'||lpad(v_seq::text,3,'0');

  insert into public.workshop_v2_estimate_numbers(
    estimate_no,sequence_no,client_key,created_by
  ) values(
    v_no,v_seq,v_key,nullif(trim(coalesce(p_actor_id,'')),'')
  );

  return query
    select e.estimate_no,e.sequence_no,e.created_at,e.created_by
    from public.workshop_v2_estimate_numbers e
    where e.estimate_no=v_no
    limit 1;
exception when unique_violation then
  return query
    select e.estimate_no,e.sequence_no,e.created_at,e.created_by
    from public.workshop_v2_estimate_numbers e
    where e.client_key=v_key
    limit 1;
end;
$$;

revoke all on function public.zukait_v2_allocate_estimate_no(text,text) from public,anon,authenticated;
grant execute on function public.zukait_v2_allocate_estimate_no(text,text) to service_role;

commit;
