-- Staged QA-only transactional intake recovery. Install after isolated tests.
begin;
create table public.zukait_vehicle_index_intake_outbox(
 id bigint generated always as identity primary key,
 source_kind text not null check(source_kind in ('RECEPTION_CHECKLIST','MECHANICAL_CHECKLIST','BODYSHOP_JOB_CARD','MECHANICAL_JOB_CARD')),
 source_id text not null check(char_length(source_id) between 1 and 160),
 entered_make text not null check(char_length(entered_make) between 1 and 160),
 entered_model text not null check(char_length(entered_model) between 1 and 160),
 created_by text not null,
 captured_at timestamptz not null default now(),
 processed_at timestamptz,
 result text check(result in ('ALREADY_INDEXED','REVIEW_REQUIRED','INVALID_INTAKE')),
 unique(source_kind,source_id)
);
create index zukait_vehicle_index_intake_outbox_pending on public.zukait_vehicle_index_intake_outbox(id) where processed_at is null;
alter table public.zukait_vehicle_index_intake_outbox enable row level security;
revoke all on public.zukait_vehicle_index_intake_outbox from public,anon,authenticated;
grant select,insert on public.zukait_vehicle_index_intake_outbox to service_role;
grant update(processed_at,result) on public.zukait_vehicle_index_intake_outbox to service_role;
grant usage,select on sequence public.zukait_vehicle_index_intake_outbox_id_seq to service_role;
create function public.zukait_vehicle_index_stage_checklist()
returns trigger language plpgsql security invoker set search_path=pg_catalog,public as $$
declare k text; src text; mk text; md text;
begin
 if tg_table_schema='public' and tg_table_name='workshop_receptions' then
  k:='RECEPTION_CHECKLIST';src:=new.rc_no;mk:=new.details->>'make';md:=new.details->>'model';
 elsif tg_table_schema='zukait_mechanical' and tg_table_name='prejob_checklists' then
  k:='MECHANICAL_CHECKLIST';src:=new.checklist_number;mk:=new.vehicle->>'make';md:=new.vehicle->>'model';
 else return new;end if;
 if mk is null or md is null or char_length(btrim(mk)) not between 1 and 160 or char_length(btrim(md)) not between 1 and 160 or mk~'[[:cntrl:]]' or md~'[[:cntrl:]]' then return new;end if;
 -- One small row, in the same transaction as the saved Checklist. No scans.
 -- Preserve the primary save in the exceptional case of a staging failure.
 begin
  insert into public.zukait_vehicle_index_intake_outbox(source_kind,source_id,entered_make,entered_model,created_by)
  values(k,src,btrim(mk),btrim(md),new.created_by) on conflict(source_kind,source_id) do nothing;
 exception when others then
  raise warning 'vehicle_index_outbox_stage_failed [%]',sqlstate;
 end;
 return new;
end $$;
revoke all on function public.zukait_vehicle_index_stage_checklist() from public,anon,authenticated;
grant execute on function public.zukait_vehicle_index_stage_checklist() to service_role;
create trigger zukait_vehicle_index_stage_reception after insert on public.workshop_receptions for each row execute function public.zukait_vehicle_index_stage_checklist();
create trigger zukait_vehicle_index_stage_mechanical after insert on zukait_mechanical.prejob_checklists for each row execute function public.zukait_vehicle_index_stage_checklist();
-- Only capture actual, newly committed JOB_CREATED events. The existing
-- commit_event function inserts the event before projection; any projection
-- rejection rolls back this row as well. Duplicate event IDs do not insert.
create function public.zukait_vehicle_index_stage_job_event()
returns trigger language plpgsql security invoker set search_path=pg_catalog,public as $$
declare k text; src text; mk text; md text; actor_role text;
begin
 if new.event_type is distinct from 'JOB_CREATED' or new.actor_id is null then return new;end if;
 src:=coalesce(nullif(btrim(new.payload->>'jobCard'),''),btrim(new.entity_id));
 mk:=new.payload->>'vehicleMake';md:=new.payload->>'vehicleModel';
 if src is null or upper(src)='ID001' or char_length(src) not between 1 and 160 or mk is null or md is null or char_length(btrim(mk)) not between 1 and 160 or char_length(btrim(md)) not between 1 and 160 or mk~'[[:cntrl:]]' or md~'[[:cntrl:]]' then return new;end if;
 begin
  select role into actor_role from public.staff_credentials where user_id=new.actor_id and active;
  if actor_role is null or actor_role not in ('Manager','Supervisor','Receptionist','Mechanical Supervisor') then return new;end if;
  k:=case when src~*'^MJC' then 'MECHANICAL_JOB_CARD' else 'BODYSHOP_JOB_CARD' end;
  if actor_role='Mechanical Supervisor' and k<>'MECHANICAL_JOB_CARD' then return new;end if;
  insert into public.zukait_vehicle_index_intake_outbox(source_kind,source_id,entered_make,entered_model,created_by)
  values(k,src,btrim(mk),btrim(md),new.actor_id) on conflict(source_kind,source_id) do nothing;
 exception when others then
  raise warning 'vehicle_index_job_outbox_stage_failed [%]',sqlstate;
 end;
 return new;
end $$;
revoke all on function public.zukait_vehicle_index_stage_job_event() from public,anon,authenticated;
grant execute on function public.zukait_vehicle_index_stage_job_event() to service_role;
create trigger zukait_vehicle_index_stage_job_event after insert on public.workshop_v2_events for each row when(new.event_type='JOB_CREATED') execute function public.zukait_vehicle_index_stage_job_event();
-- Only Manager can drain. One bounded batch on explicit review list opening.
-- Failed transactions leave pending rows in place. No background polling.
create function public.zukait_vehicle_index_intake_drain(p_session_hash text)
returns jsonb language plpgsql security invoker set search_path=pg_catalog,public as $$
declare actor_role text; r record; answer jsonb; total integer:=0; result_code text;
begin
 select c.role into actor_role from public.staff_sessions s join public.staff_credentials c on c.user_id=s.user_id
 where s.token_hash=p_session_hash and s.revoked_at is null and c.active and not c.must_change for share of s,c;
 if actor_role is distinct from 'Manager' then return jsonb_build_object('ok',false,'code','manager_required');end if;
 for r in select id,source_kind,source_id,entered_make,entered_model from public.zukait_vehicle_index_intake_outbox where processed_at is null order by id limit 30 for update skip locked loop
  answer:=public.zukait_vehicle_index_observe(p_session_hash,r.entered_make,r.entered_model,r.source_kind,r.source_id);
  if answer->>'ok'='true' then result_code:=answer->>'status';
  elsif answer->>'code'='invalid_intake' then result_code:='INVALID_INTAKE';
  else raise exception 'vehicle_index_intake_drain_deferred';end if;
  update public.zukait_vehicle_index_intake_outbox set processed_at=now(),result=result_code where id=r.id;
  total:=total+1;
 end loop;
 return jsonb_build_object('ok',true,'processed',total,'more',exists(select 1 from public.zukait_vehicle_index_intake_outbox where processed_at is null));
end $$;
revoke all on function public.zukait_vehicle_index_intake_drain(text) from public,anon,authenticated;
grant execute on function public.zukait_vehicle_index_intake_drain(text) to service_role;
commit;
