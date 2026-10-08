-- V215: Atomic active spare-part identity guard.
-- Additive projection only; does not replace zukait_v2_commit_event or any work/ID001 projection.

begin;

create table if not exists public.workshop_v2_spare_part_state (
  part_id text primary key,
  list_no text not null,
  job_card text not null,
  part_name text not null default '',
  part_no text not null default '',
  part_key text not null,
  status text not null default 'LISTED',
  revision bigint not null default 0,
  last_event_id text not null,
  updated_at timestamptz not null default now()
);

alter table public.workshop_v2_spare_part_state enable row level security;
revoke all on table public.workshop_v2_spare_part_state from anon, authenticated;
grant select, insert, update, delete on table public.workshop_v2_spare_part_state to service_role;

create unique index if not exists workshop_v2_spare_part_one_active_key
  on public.workshop_v2_spare_part_state(list_no, part_key)
  where status <> 'RETURNED';

create or replace function public.zukait_v2_spare_part_key(p_name text,p_part_no text)
returns text language sql immutable strict set search_path=public as $$
  select lower(regexp_replace(trim(coalesce(p_name,'')),'[^a-zA-Z0-9]+','','g')) || '|' ||
         upper(regexp_replace(trim(coalesce(p_part_no,'')),'[^a-zA-Z0-9]+','','g'));
$$;

create or replace function public.zukait_v2_project_spare_part_event()
returns trigger language plpgsql security definer set search_path=public as $$
declare
  p jsonb:=coalesce(new.payload,'{}'::jsonb);
  afterv jsonb:=case when jsonb_typeof(p->'after')='object' then p->'after' else '{}'::jsonb end;
  pid text:=coalesce(nullif(p->>'partId',''),new.entity_id);
  cur public.workshop_v2_spare_part_state%rowtype;
  nm text; pn text; st text; ln text; jc text; k text;
begin
  if new.event_type not like 'SPARE_PART%' then return new; end if;

  select * into cur from public.workshop_v2_spare_part_state where part_id=pid for update;

  if new.event_type='SPARE_PART_LISTED' then
    ln:=trim(coalesce(p->>'listNo','')); jc:=upper(trim(coalesce(p->>'jobCard','')));
    nm:=trim(coalesce(p->>'name','')); pn:=upper(trim(coalesce(p->>'partNo','')));
    if ln='' or jc='' or nm='' then raise exception 'invalid_spare_part_projection'; end if;
    k:=public.zukait_v2_spare_part_key(nm,pn);
    insert into public.workshop_v2_spare_part_state(part_id,list_no,job_card,part_name,part_no,part_key,status,revision,last_event_id)
    values(pid,ln,jc,nm,pn,k,'LISTED',coalesce(new.revision,0),new.event_id)
    on conflict(part_id) do update set
      list_no=excluded.list_no,job_card=excluded.job_card,part_name=excluded.part_name,part_no=excluded.part_no,
      part_key=excluded.part_key,status=excluded.status,revision=greatest(workshop_v2_spare_part_state.revision,excluded.revision),
      last_event_id=excluded.last_event_id,updated_at=now();
    return new;
  end if;

  if not found then return new; end if;

  if new.event_type='SPARE_PART_STATUS_CHANGED' then
    st:=trim(coalesce(p->>'to',''));
    if st<>'' then update public.workshop_v2_spare_part_state set status=st,revision=greatest(revision,coalesce(new.revision,0)),last_event_id=new.event_id,updated_at=now() where part_id=pid; end if;
  elsif new.event_type in ('SPARE_PART_ITEM_EDITED','SPARE_PART_MANAGER_CORRECTED','SPARE_PART_SUPERVISOR_CORRECTED','SPARE_PART_RETURN_CANCELLED') then
    nm:=trim(coalesce(afterv->>'name',cur.part_name)); pn:=upper(trim(coalesce(afterv->>'partNo',cur.part_no)));
    st:=trim(coalesce(afterv->>'status',cur.status)); k:=public.zukait_v2_spare_part_key(nm,pn);
    update public.workshop_v2_spare_part_state set part_name=nm,part_no=pn,part_key=k,status=st,
      revision=greatest(revision,coalesce(new.revision,0)),last_event_id=new.event_id,updated_at=now() where part_id=pid;
  end if;
  return new;
exception when unique_violation then
  raise exception 'duplicate_active_spare_part';
end;$$;

drop trigger if exists workshop_v2_spare_part_state_guard on public.workshop_v2_events;
create trigger workshop_v2_spare_part_state_guard
after insert on public.workshop_v2_events
for each row execute function public.zukait_v2_project_spare_part_event();

commit;
