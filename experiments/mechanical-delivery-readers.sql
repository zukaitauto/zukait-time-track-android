-- Fixture ONLY. Load after mechanical-delivery.sql. No production migration.
create function zukait_mechanical.authorize_delivery(p_actor text,p_session_hash text) returns jsonb language plpgsql security invoker set search_path=pg_catalog as $$
declare cfg zukait_mechanical.settings; staff_role text;
begin
 select * into cfg from zukait_mechanical.settings where singleton;
 if not coalesce(cfg.enabled and cfg.qc_enabled and cfg.delivery_enabled,false) then raise exception 'mechanical_delivery_disabled';end if;
 if p_session_hash is null or p_session_hash !~ '^[0-9a-f]{64}$' then raise exception 'mechanical_invalid_session';end if;
 select role into staff_role from public.staff_credentials where user_id=p_actor and active for share;
 if staff_role is null or staff_role not in ('Supervisor','Receptionist','Mechanical Supervisor') or jsonb_typeof(cfg.capabilities->p_actor) is distinct from 'array' or not coalesce((cfg.capabilities->p_actor)?'MECHANICAL_DELIVER',false) then raise exception 'mechanical_forbidden';end if;
 perform 1 from public.staff_sessions where token_hash=p_session_hash and user_id=p_actor and revoked_at is null for share;
 if not found then raise exception 'mechanical_invalid_session';end if;
 return jsonb_build_object('flags',jsonb_build_object('mechanical',true),'mechanicalDeliveryEnabled',true,'mechanicalDepartment',cfg.department,'mechanicalStaff',jsonb_build_object(p_actor,cfg.capabilities->p_actor),'qc',jsonb_build_object('mechanicalApproverId','SUP003','mechanicalOnlyMode','SOLE_MECHANICAL_APPROVER','mixedPaintingApproverId','SUP002','mixedFinalApproverId','SUP001','mixedMechanicalRequired',cfg.mixed_mechanical_qc_required));
end $$;
revoke all on function zukait_mechanical.authorize_delivery(text,text) from public,anon,authenticated;
grant execute on function zukait_mechanical.authorize_delivery(text,text) to service_role;

-- Lookup preserves ordinary delivery rights: no Mechanical capability is
-- required merely to learn that an ordinary JC has no Mechanical checklist.
create function public.zukait_mechanical_delivery_lookup(p_actor text,p_session_hash text,p_job_card text) returns jsonb language plpgsql security invoker set search_path=pg_catalog as $$
declare staff_role text; checklist uuid; linked boolean;
begin
 if p_session_hash is null or p_session_hash !~ '^[0-9a-f]{64}$' then raise exception 'mechanical_invalid_session';end if;
 select role into staff_role from public.staff_credentials where user_id=p_actor and active for share;
 if staff_role is null or staff_role not in ('Supervisor','Receptionist','Mechanical Supervisor') then raise exception 'mechanical_forbidden';end if;
 perform 1 from public.staff_sessions where token_hash=p_session_hash and user_id=p_actor and revoked_at is null for share;
 if not found then raise exception 'mechanical_invalid_session';end if;
 if p_job_card is null or length(trim(p_job_card)) not between 1 and 80 then raise exception 'invalid_mechanical_command';end if;
 if (select count(*) from zukait_mechanical.checklists where upper(trim(job_card))=upper(trim(p_job_card)))>1 then raise exception 'mechanical_qc_scope_review';end if;
 select id into checklist from zukait_mechanical.checklists where upper(trim(job_card))=upper(trim(p_job_card));
 if checklist is null then return jsonb_build_object('ok',true,'registered',false);end if;
 if staff_role='Receptionist' then
  select exists(select 1 from public.workshop_state w cross join lateral jsonb_array_elements(coalesce(w.data->'jobs','[]')) j where w.id='main' and upper(trim(j->>'no'))=upper(trim(p_job_card)) and coalesce(j->>'receptionNo','')<>'') into linked;
  if not linked then raise exception 'mechanical_forbidden';end if;
 end if;
 return jsonb_build_object('ok',true,'registered',true,'checklistId',checklist);
end $$;
revoke all on function public.zukait_mechanical_delivery_lookup(text,text,text) from public,anon,authenticated;
grant execute on function public.zukait_mechanical_delivery_lookup(text,text,text) to service_role;

create function public.zukait_mechanical_delivery_read(p_actor text,p_session_hash text,p_kind text,p_entity uuid default null,p_request uuid default null) returns jsonb language plpgsql security invoker set search_path=pg_catalog as $$
declare policy jsonb; prior zukait_mechanical.receipts; context jsonb;
begin
 policy:=zukait_mechanical.authorize_delivery(p_actor,p_session_hash);
 if p_kind='policy' then return policy;end if;
 if p_kind='receipt' then
  if p_request is null then raise exception 'invalid_mechanical_command';end if;
  select * into prior from zukait_mechanical.receipts where request_id=p_request;
  if not found then return 'null'::jsonb;end if;
  if prior.actor_id<>p_actor then raise exception 'mechanical_request_reused';end if;
  return jsonb_build_object('actorId',prior.actor_id,'fingerprint',prior.fingerprint,'result',prior.result);
 end if;
 if p_kind is distinct from 'context' or p_entity is null then raise exception 'invalid_mechanical_command';end if;
 context:=public.zukait_mechanical_qc_read(p_actor,p_session_hash,'delivery_context',p_entity,null);
 if exists(select 1 from public.staff_credentials where user_id=p_actor and role='Receptionist') and coalesce(context->'snapshot'->'data'->'jobs'->0->>'receptionNo','')='' then raise exception 'mechanical_forbidden';end if;
 return context;
end $$;
revoke all on function public.zukait_mechanical_delivery_read(text,text,text,uuid,uuid) from public,anon,authenticated;
grant execute on function public.zukait_mechanical_delivery_read(text,text,text,uuid,uuid) to service_role;
