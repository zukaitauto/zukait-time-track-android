-- Disposable fixture candidate ONLY; not a generated/applied production migration.
-- No public route calls this. Delivery integration/authority guards remain required.
alter table zukait_mechanical.settings add column qc_enabled boolean not null default false;
-- NULL means the owner has not selected a mixed-job policy. Never infer true/false.
alter table zukait_mechanical.settings add column mixed_mechanical_qc_required boolean;
create table zukait_mechanical.qc_events (
 request_id uuid primary key references zukait_mechanical.receipts(request_id),
 checklist_id uuid not null references zukait_mechanical.checklists(id),
 actor_id text not null references public.staff_credentials(user_id) check(actor_id='SUP003'),
 result text not null check(result in ('PASS','FAIL')),
 reason text not null check(length(reason)<=500 and (result<>'FAIL' or length(trim(reason))>0)),
 route text not null check(route in ('MECHANICAL_ONLY','MIXED')),
 work_fingerprint text not null check(work_fingerprint ~ '^[0-9a-f]{64}$'),
 source_records_revision bigint not null check(source_records_revision>=0),
 source_workshop_revision bigint not null check(source_workshop_revision>=0),
 records_revision bigint not null unique,
 recorded_at timestamptz not null default clock_timestamp()
);
create index on zukait_mechanical.qc_events(checklist_id,records_revision desc);
alter table zukait_mechanical.qc_events enable row level security;
revoke all on zukait_mechanical.qc_events from public,anon,authenticated,service_role;
grant select,insert on zukait_mechanical.qc_events to service_role;
create trigger immutable_qc_event before update or delete or truncate on zukait_mechanical.qc_events for each statement execute function zukait_mechanical.append_only();
create function public.zukait_mechanical_qc_commit(
 p_actor text,p_request uuid,p_fingerprint text,p_expected_records bigint,p_expected_workshop bigint,p_entity uuid,p_device text,p_plan jsonb,p_session_hash text
) returns jsonb language plpgsql security invoker set search_path=pg_catalog as $$
declare cfg zukait_mechanical.settings; ctl zukait_mechanical.control; receipt zukait_mechanical.receipts;
 ws_revision bigint; jc text; ws jsonb; result jsonb;
begin
 perform zukait_mechanical.authorize_session(p_actor,p_session_hash,'MECHANICAL_QC');
 -- Keep settings read-only for service_role; no privilege to enable itself.
 select * into cfg from zukait_mechanical.settings where singleton;
 if not cfg.qc_enabled then raise exception 'mechanical_qc_disabled';end if;
 if p_actor is distinct from 'SUP003' or not exists(select 1 from public.staff_credentials where user_id=p_actor and role='Supervisor' and active) then raise exception 'mechanical_qc_approver_required';end if;
 if cfg.department is null then raise exception 'mechanical_qc_policy_required';end if;
 if p_request is null or p_entity is null or p_fingerprint is null or p_fingerprint !~ '^[0-9a-f]{64}$' or p_device is null or length(p_device) not between 1 and 128 or jsonb_typeof(p_plan) is distinct from 'object' or octet_length(p_plan::text)>4096 then raise exception 'invalid_mechanical_qc_plan';end if;
 if (p_plan-array['result','reason','route','workFingerprint'])<>'{}'::jsonb or coalesce(p_plan->>'result','') not in ('PASS','FAIL') or jsonb_typeof(p_plan->'reason') is distinct from 'string' or length(p_plan->>'reason')>500 or (p_plan->>'result'='FAIL' and length(trim(p_plan->>'reason'))=0) or coalesce(p_plan->>'route','') not in ('MECHANICAL_ONLY','MIXED') or coalesce(p_plan->>'workFingerprint','') !~ '^[0-9a-f]{64}$' then raise exception 'invalid_mechanical_qc_plan';end if;
 -- Same ordering as the existing Mechanical commit: session, control, workshop.
 select * into ctl from zukait_mechanical.control where singleton for update;
 select * into receipt from zukait_mechanical.receipts where request_id=p_request;
 if found then
  if receipt.actor_id is distinct from p_actor or receipt.fingerprint is distinct from p_fingerprint or receipt.result->>'operation' is distinct from 'MECHANICAL_QC' or receipt.result->>'entityId' is distinct from p_entity::text then raise exception 'mechanical_request_reused';end if;
  return receipt.result||'{"duplicate":true}'::jsonb;
 end if;
 if p_expected_records is null or ctl.revision<>p_expected_records then raise exception 'mechanical_revision_conflict';end if;
 select revision,data into ws_revision,ws from public.workshop_state where id='main' for update;
 if not found or p_expected_workshop is null or ws_revision<>p_expected_workshop then raise exception 'workshop_revision_conflict';end if;
 if ctl.revision>=9007199254740991 or ws_revision>=9007199254740991 then raise exception 'revision_exhausted';end if;
 select job_card into jc from zukait_mechanical.checklists where id=p_entity;
 if not found then raise exception 'mechanical_checklist_required';end if;
 if not exists(select 1 from jsonb_array_elements(coalesce(ws->'jobs','[]')) j where upper(trim(j->>'no'))=upper(trim(jc)) and upper(trim(j->>'no'))<>'ID001' and not coalesce((j->>'delivered')::boolean,false) and not coalesce((j->>'cancelled')::boolean,false) and not coalesce((j->>'deleted')::boolean,false) and not coalesce((j->>'archived')::boolean,false) and upper(coalesce(j->>'status',''))<>'CANCELLED') then raise exception 'job_inactive';end if;
 if p_plan->>'route'='MIXED' then
  if cfg.mixed_mechanical_qc_required is null then raise exception 'mechanical_mixed_qc_policy_required';end if;
  if not cfg.mixed_mechanical_qc_required then raise exception 'mechanical_mixed_qc_not_required';end if;
 end if;
 -- Only the trusted server evaluator constructs this digest/route after work checks.
 -- Both locked revisions bind it to the snapshot evaluated; no full state/history
 -- or session token arrays enter this RPC. This is not a public work evaluator.
 result:=jsonb_build_object('ok',true,'requestId',p_request,'operation','MECHANICAL_QC','entityId',p_entity,'recordsRevision',ctl.revision+1,'workshopRevision',ws_revision,'requiresReadinessRefresh',true);
 insert into zukait_mechanical.receipts(request_id,actor_id,fingerprint,result) values(p_request,p_actor,p_fingerprint,result);
 insert into zukait_mechanical.qc_events(request_id,checklist_id,actor_id,result,reason,route,work_fingerprint,source_records_revision,source_workshop_revision,records_revision)
 values(p_request,p_entity,p_actor,p_plan->>'result',trim(p_plan->>'reason'),p_plan->>'route',p_plan->>'workFingerprint',ctl.revision,ws_revision,ctl.revision+1);
 insert into zukait_mechanical.audit(request_id,actor_id,operation,entity_id,device_id,reason,after_value) values(p_request,p_actor,'MECHANICAL_QC',p_entity,p_device,trim(p_plan->>'reason'),p_plan);
 update zukait_mechanical.control set revision=revision+1 where singleton;
 return result;
end $$;
revoke all on function public.zukait_mechanical_qc_commit(text,uuid,text,bigint,bigint,uuid,text,jsonb,text) from public,anon,authenticated;
grant execute on function public.zukait_mechanical_qc_commit(text,uuid,text,bigint,bigint,uuid,text,jsonb,text) to service_role;
