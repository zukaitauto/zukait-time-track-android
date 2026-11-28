-- Review draft, separate from catalogue schema. Do not deploy until save-path acceptance.
begin;
create table public.zukait_vehicle_index_intake (
 make_key text not null, model_key text not null,
 entered_make text not null check(char_length(entered_make) between 1 and 160),
 entered_model text not null check(char_length(entered_model) between 1 and 160),
 source_kind text not null check(source_kind in ('RECEPTION_CHECKLIST','BODYSHOP_JOB_CARD','MECHANICAL_CHECKLIST','MECHANICAL_JOB_CARD')),
 source_id text not null check(char_length(source_id) between 1 and 160),
 submitted_by text not null,
 submitted_at timestamptz not null default now(),
 primary key(make_key,model_key)
);
alter table public.zukait_vehicle_index_intake enable row level security;
revoke all on public.zukait_vehicle_index_intake from public,anon,authenticated;
grant select,insert on public.zukait_vehicle_index_intake to service_role;
-- This service-only RPC is for the post-commit server hook, not an exposed form endpoint.
create function public.zukait_vehicle_index_observe(p_session_hash text,p_make text,p_model text,p_source_kind text,p_source_id text)
returns jsonb language plpgsql security invoker set search_path=pg_catalog,public as $$
declare actor text; actor_role text; mk text; md text; v_make_id text; current_version bigint;
begin
 select c.user_id,c.role into actor,actor_role from public.staff_sessions s join public.staff_credentials c on c.user_id=s.user_id
 where s.token_hash=p_session_hash and s.revoked_at is null and c.active and not c.must_change for share of s,c;
 if actor is null or actor_role not in ('Manager','Supervisor','Receptionist','Mechanical Supervisor') then return jsonb_build_object('ok',false,'code','intake_forbidden');end if;
 if p_source_kind is null or p_source_kind not in ('RECEPTION_CHECKLIST','BODYSHOP_JOB_CARD','MECHANICAL_CHECKLIST','MECHANICAL_JOB_CARD') or (actor_role='Mechanical Supervisor' and p_source_kind not in ('MECHANICAL_CHECKLIST','MECHANICAL_JOB_CARD')) or p_source_id is null or upper(btrim(p_source_id))='ID001' or char_length(btrim(p_source_id)) not between 1 and 160 or p_make is null or p_model is null or char_length(btrim(p_make)) not between 1 and 160 or char_length(btrim(p_model)) not between 1 and 160 or p_make~'[[:cntrl:]]' or p_model~'[[:cntrl:]]' then return jsonb_build_object('ok',false,'code','invalid_intake');end if;
 mk:=lower(btrim(regexp_replace(normalize(p_make,NFKC),'[[:space:]]+',' ','g')));
 md:=lower(btrim(regexp_replace(normalize(p_model,NFKC),'[[:space:]]+',' ','g')));
 if mk='' or md='' then return jsonb_build_object('ok',false,'code','invalid_intake');end if;
 select version into current_version from public.zukait_vehicle_index_meta where id=true for share;
 if current_version is null then return jsonb_build_object('ok',false,'code','catalogue_not_initialized');end if;
 select case when kind='ADD_MAKE' then id else target_id end into v_make_id from public.zukait_vehicle_index_entries where scope='@makes' and name_key=mk and kind in ('ADD_MAKE','MAKE_ALIAS');
 if v_make_id is not null and exists(select 1 from public.zukait_vehicle_index_entries e where e.scope=v_make_id and e.name_key=md and e.kind in ('ADD_MODEL','MODEL_ALIAS')) then return jsonb_build_object('ok',true,'status','ALREADY_INDEXED');end if;
 insert into public.zukait_vehicle_index_intake(make_key,model_key,entered_make,entered_model,source_kind,source_id,submitted_by)
 values(mk,md,btrim(p_make),btrim(p_model),p_source_kind,btrim(p_source_id),actor)
 on conflict(make_key,model_key) do nothing;
 return jsonb_build_object('ok',true,'status','REVIEW_REQUIRED');
end $$;
revoke all on function public.zukait_vehicle_index_observe(text,text,text,text,text) from public,anon,authenticated;
grant execute on function public.zukait_vehicle_index_observe(text,text,text,text,text) to service_role;
-- One bounded service-only request for each confirmed save, no client endpoint.
create function public.zukait_vehicle_index_observe_batch(p_session_hash text,p_records jsonb)
returns jsonb language plpgsql security invoker set search_path=pg_catalog,public as $$
declare r jsonb; answer jsonb; total integer:=0;
begin
 if p_records is null or jsonb_typeof(p_records)<>'array' or jsonb_array_length(p_records)>100 or pg_column_size(p_records)>100000 then return jsonb_build_object('ok',false,'code','invalid_intake');end if;
 for r in select value from jsonb_array_elements(p_records) loop
  if jsonb_typeof(r)<>'object' or exists(select 1 from jsonb_object_keys(r) k where k not in ('make','model','sourceKind','sourceId')) then raise exception 'invalid_intake';end if;
  answer:=public.zukait_vehicle_index_observe(p_session_hash,r->>'make',r->>'model',r->>'sourceKind',r->>'sourceId');
  if answer->>'ok' is distinct from 'true' then raise exception 'vehicle_index_intake_rejected';end if;
  total:=total+1;
 end loop;
 return jsonb_build_object('ok',true,'count',total);
end $$;
revoke all on function public.zukait_vehicle_index_observe_batch(text,jsonb) from public,anon,authenticated;
grant execute on function public.zukait_vehicle_index_observe_batch(text,jsonb) to service_role;
-- Manager-only queue. Approved pairs disappear from the pending view;
-- original observations are retained, not deleted or rewritten.
create function public.zukait_vehicle_index_intake_list(p_session_hash text,p_after_make text,p_after_model text)
returns jsonb language plpgsql security invoker set search_path=pg_catalog,public as $$
declare actor_role text; result jsonb; v bigint;
begin
 select c.role into actor_role from public.staff_sessions s join public.staff_credentials c on c.user_id=s.user_id
 where s.token_hash=p_session_hash and s.revoked_at is null and c.active and not c.must_change for share of s,c;
 if actor_role is distinct from 'Manager' then return jsonb_build_object('ok',false,'code','manager_required');end if;
 if (p_after_make is null) is distinct from (p_after_model is null) or char_length(coalesce(p_after_make,''))>200 or char_length(coalesce(p_after_model,''))>200 then return jsonb_build_object('ok',false,'code','invalid_cursor');end if;
 select version into v from public.zukait_vehicle_index_meta where id=true for share;
 if v is null then return jsonb_build_object('ok',false,'code','catalogue_not_initialized');end if;
 select coalesce(jsonb_agg(to_jsonb(q) order by q.make_key,q.model_key),'[]'::jsonb) into result from (
 select i.make_key,i.model_key,i.entered_make,i.entered_model,i.source_kind,i.source_id,i.submitted_at
 from public.zukait_vehicle_index_intake i
 left join public.zukait_vehicle_index_entries m on m.scope='@makes' and m.name_key=i.make_key and m.kind in ('ADD_MAKE','MAKE_ALIAS')
 left join public.zukait_vehicle_index_entries d on d.scope=case when m.kind='ADD_MAKE' then m.id else m.target_id end and d.name_key=i.model_key and d.kind in ('ADD_MODEL','MODEL_ALIAS')
 where d.id is null and (p_after_make is null or (i.make_key,i.model_key)>(p_after_make,p_after_model))
 order by i.make_key,i.model_key limit 50
 ) q;
 return jsonb_build_object('ok',true,'version',v,'rows',result);
end $$;
revoke all on function public.zukait_vehicle_index_intake_list(text,text,text) from public,anon,authenticated;
grant execute on function public.zukait_vehicle_index_intake_list(text,text,text) to service_role;

-- Targeted recovery uses authoritative saved records, never client-supplied names.
-- This is a manual bounded repair, not a scheduled or full workshop scan.
create function public.zukait_vehicle_index_intake_recover(p_session_hash text,p_source_kind text,p_source_id text)
returns jsonb language plpgsql security invoker set search_path=pg_catalog,public as $$
declare actor_role text; v_make text; v_model text;
begin
 select c.role into actor_role from public.staff_sessions s join public.staff_credentials c on c.user_id=s.user_id
 where s.token_hash=p_session_hash and s.revoked_at is null and c.active and not c.must_change for share of s,c;
 if actor_role is distinct from 'Manager' then return jsonb_build_object('ok',false,'code','manager_required');end if;
 if p_source_id is null or char_length(btrim(p_source_id)) not between 1 and 80 or p_source_id~'[[:cntrl:]]' then return jsonb_build_object('ok',false,'code','invalid_source');end if;
 if p_source_kind='RECEPTION_CHECKLIST' then
  select r.details->>'make',r.details->>'model' into v_make,v_model from public.workshop_receptions r where r.rc_no=btrim(p_source_id);
 elsif p_source_kind='MECHANICAL_CHECKLIST' then
  select r.vehicle->>'make',r.vehicle->>'model' into v_make,v_model from zukait_mechanical.prejob_checklists r where r.checklist_number=btrim(p_source_id);
 else return jsonb_build_object('ok',false,'code','invalid_source');
 end if;
 if not found then return jsonb_build_object('ok',false,'code','source_not_found');end if;
 if v_make is null or v_model is null then return jsonb_build_object('ok',false,'code','invalid_intake');end if;
 return public.zukait_vehicle_index_observe(p_session_hash,v_make,v_model,p_source_kind,btrim(p_source_id));
end $$;
revoke all on function public.zukait_vehicle_index_intake_recover(text,text,text) from public,anon,authenticated;
grant execute on function public.zukait_vehicle_index_intake_recover(text,text,text) to service_role;
commit;
