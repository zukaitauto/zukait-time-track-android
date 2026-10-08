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

  if new.event_type='SPARE_PART_ITEM_EDITED' and nullif(trim(afterv->>'deletedAt'),'') is not null then
    delete from public.workshop_v2_spare_part_state where part_id=pid;
    return new;
  end if;

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

create table if not exists public.workshop_v2_spare_part_state_conflicts (
  list_no text not null,
  part_key text not null,
  part_ids text[] not null,
  detected_at timestamptz not null default now(),
  primary key(list_no,part_key)
);
revoke all on table public.workshop_v2_spare_part_state_conflicts from anon,authenticated;
grant select,insert,update,delete on table public.workshop_v2_spare_part_state_conflicts to service_role;

-- Rebuild current state from the immutable event history without changing any event.
truncate table public.workshop_v2_spare_part_state;
insert into public.workshop_v2_spare_part_state(part_id,list_no,job_card,part_name,part_no,part_key,status,revision,last_event_id,updated_at)
with listed as (
  select distinct on (e.entity_id)
    e.entity_id part_id, trim(e.payload->>'listNo') list_no, upper(trim(e.payload->>'jobCard')) job_card,
    trim(e.payload->>'name') part_name, upper(trim(coalesce(e.payload->>'partNo',''))) part_no,
    e.server_time listed_at
  from public.workshop_v2_events e
  where e.event_type='SPARE_PART_LISTED'
  order by e.entity_id,e.server_time desc,e.event_id desc
), latest_identity as (
  select distinct on (e.entity_id)
    e.entity_id part_id,e.event_id,e.revision,e.server_time,e.payload
  from public.workshop_v2_events e
  where e.event_type in ('SPARE_PART_ITEM_EDITED','SPARE_PART_MANAGER_CORRECTED','SPARE_PART_SUPERVISOR_CORRECTED','SPARE_PART_RETURN_CANCELLED')
    and (nullif(trim(e.payload->'after'->>'name'),'') is not null or nullif(trim(e.payload->'after'->>'partNo'),'') is not null)
  order by e.entity_id,e.server_time desc,e.event_id desc
), latest_status as (
  select distinct on (e.entity_id)
    e.entity_id part_id,e.event_id,e.revision,e.server_time,e.event_type,e.payload
  from public.workshop_v2_events e
  where (e.event_type='SPARE_PART_STATUS_CHANGED' and nullif(trim(e.payload->>'to'),'') is not null)
     or (e.event_type in ('SPARE_PART_MANAGER_CORRECTED','SPARE_PART_SUPERVISOR_CORRECTED','SPARE_PART_RETURN_CANCELLED') and nullif(trim(e.payload->'after'->>'status'),'') is not null)
  order by e.entity_id,e.server_time desc,e.event_id desc
)
select l.part_id,l.list_no,l.job_card,
  coalesce(nullif(trim(i.payload->'after'->>'name'),''),l.part_name),
  coalesce(nullif(upper(trim(i.payload->'after'->>'partNo')),''),l.part_no),
  public.zukait_v2_spare_part_key(coalesce(nullif(trim(i.payload->'after'->>'name'),''),l.part_name),coalesce(nullif(upper(trim(i.payload->'after'->>'partNo')),''),l.part_no)),
  case when s.event_type='SPARE_PART_STATUS_CHANGED' then coalesce(nullif(trim(s.payload->>'to'),''),'LISTED')
       else coalesce(nullif(trim(s.payload->'after'->>'status'),''),'LISTED') end,
  greatest(coalesce(i.revision,0),coalesce(s.revision,0)),coalesce(s.event_id,i.event_id),greatest(coalesce(s.server_time,l.listed_at),coalesce(i.server_time,l.listed_at))
from listed l left join latest_identity i using(part_id) left join latest_status s using(part_id)
where l.list_no<>'' and l.job_card<>'' and l.part_name<>''
  and not exists (
    select 1 from public.workshop_v2_events d
    where d.entity_id=l.part_id and d.event_type='SPARE_PART_ITEM_EDITED'
      and nullif(trim(d.payload->'after'->>'deletedAt'),'') is not null
      and not exists (
        select 1 from public.workshop_v2_events later
        where later.entity_id=l.part_id and later.event_type='SPARE_PART_LISTED'
          and (later.server_time>d.server_time or (later.server_time=d.server_time and later.event_id>d.event_id))
      )
  );

delete from public.workshop_v2_spare_part_state_conflicts;
insert into public.workshop_v2_spare_part_state_conflicts(list_no,part_key,part_ids)
select list_no,part_key,array_agg(part_id order by part_id)
from public.workshop_v2_spare_part_state
where status<>'RETURNED'
group by list_no,part_key having count(*)>1;

do $
begin
  if exists(select 1 from public.workshop_v2_spare_part_state_conflicts) then
    raise notice 'Spare part active-state conflicts detected; unique guard index deferred until reviewed.';
  else
    create unique index if not exists workshop_v2_spare_part_one_active_key
      on public.workshop_v2_spare_part_state(list_no,part_key) where status<>'RETURNED';
  end if;
end $;

drop trigger if exists workshop_v2_spare_part_state_guard on public.workshop_v2_events;
create trigger workshop_v2_spare_part_state_guard
after insert on public.workshop_v2_events
for each row execute function public.zukait_v2_project_spare_part_event();

commit;
