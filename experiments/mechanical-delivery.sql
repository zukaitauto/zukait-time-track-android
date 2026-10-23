-- Disposable fixture candidate ONLY. Draft route requires separate off-by-default gates.
alter table zukait_mechanical.settings add column delivery_enabled boolean not null default false;
create table zukait_mechanical.deliveries (
 request_id uuid primary key references zukait_mechanical.receipts(request_id),
 checklist_id uuid not null unique references zukait_mechanical.checklists(id),
 actor_id text not null references public.staff_credentials(user_id),
 qc_request_id uuid references zukait_mechanical.qc_events(request_id),
 work_fingerprint text not null check(work_fingerprint ~ '^[0-9a-f]{64}$'),
 route text not null check(route in ('MECHANICAL_ONLY','MIXED')),
 source_records_revision bigint not null,source_workshop_revision bigint not null,
 records_revision bigint not null unique,workshop_revision bigint not null,
 projection jsonb not null,recorded_at timestamptz not null default clock_timestamp()
);
alter table zukait_mechanical.deliveries enable row level security;
revoke all on zukait_mechanical.deliveries from public,anon,authenticated,service_role;
grant select,insert on zukait_mechanical.deliveries to service_role;
create trigger immutable_delivery before update or delete or truncate on zukait_mechanical.deliveries for each statement execute function zukait_mechanical.append_only();

create function public.zukait_mechanical_deliver(p_actor text,p_request uuid,p_fingerprint text,p_expected_records bigint,p_expected_workshop bigint,p_entity uuid,p_device text,p_plan jsonb,p_session_hash text)
returns jsonb language plpgsql security invoker set search_path=pg_catalog as $$
declare cfg zukait_mechanical.settings; ctl zukait_mechanical.control; prior zukait_mechanical.receipts; qc zukait_mechanical.qc_events;
 staff_role text; staff_name text; jc text; ws jsonb; ws_revision bigint; ws_by text; ws_at timestamptz; job jsonb; after_job jsonb; jobs jsonb; audit jsonb; projection jsonb; result jsonb; at_ms bigint; qc_revision bigint; needs_mechanical boolean;
begin
 select * into cfg from zukait_mechanical.settings where singleton;
 if not coalesce(cfg.enabled and cfg.qc_enabled and cfg.delivery_enabled,false) then raise exception 'mechanical_delivery_disabled';end if;
 if p_session_hash is null or p_session_hash !~ '^[0-9a-f]{64}$' then raise exception 'mechanical_invalid_session';end if;
 select role,display_name into staff_role,staff_name from public.staff_credentials where user_id=p_actor and active for share;
 if staff_role is null or staff_role not in ('Supervisor','Receptionist') or jsonb_typeof(cfg.capabilities->p_actor) is distinct from 'array' or not coalesce((cfg.capabilities->p_actor)?'MECHANICAL_DELIVER',false) then raise exception 'mechanical_forbidden';end if;
 perform 1 from public.staff_sessions where token_hash=p_session_hash and user_id=p_actor and revoked_at is null for share;
 if not found then raise exception 'mechanical_invalid_session';end if;
 if cfg.department is null then raise exception 'mechanical_qc_policy_required';end if;
 if p_request is null or p_entity is null or p_fingerprint is null or p_fingerprint !~ '^[0-9a-f]{64}$' or p_device is null or length(p_device) not between 1 and 128 or jsonb_typeof(p_plan) is distinct from 'object' or octet_length(p_plan::text)>2048 then raise exception 'invalid_mechanical_delivery';end if;
 if (p_plan-array['route','workFingerprint','qcRequestId'])<>'{}'::jsonb or coalesce(p_plan->>'route','') not in ('MECHANICAL_ONLY','MIXED') or coalesce(p_plan->>'workFingerprint','') !~ '^[0-9a-f]{64}$' then raise exception 'invalid_mechanical_delivery';end if;
 -- Credentials/session, then control, then workshop: same order as QC writes.
 select * into ctl from zukait_mechanical.control where singleton for update;
 select * into prior from zukait_mechanical.receipts where request_id=p_request;
 if found then
  if prior.actor_id is distinct from p_actor or prior.fingerprint is distinct from p_fingerprint or prior.result->>'operation' is distinct from 'MECHANICAL_DELIVER' or prior.result->>'entityId' is distinct from p_entity::text then raise exception 'mechanical_request_reused';end if;
  return prior.result||'{"duplicate":true}'::jsonb;
 end if;
 if p_expected_records is null or ctl.revision<>p_expected_records then raise exception 'mechanical_revision_conflict';end if;
 select revision,data,updated_by,updated_at into ws_revision,ws,ws_by,ws_at from public.workshop_state where id='main' for update;
 if not found or p_expected_workshop is null or ws_revision<>p_expected_workshop then raise exception 'workshop_revision_conflict';end if;
 if ctl.revision>=9007199254740991 or ws_revision>=9007199254740991 then raise exception 'revision_exhausted';end if;
 select job_card into jc from zukait_mechanical.checklists where id=p_entity;
 if not found then raise exception 'mechanical_checklist_required';end if;
 if (select count(*) from jsonb_array_elements(coalesce(ws->'jobs','[]')) j where upper(trim(j->>'no'))=upper(trim(jc)))<>1 then raise exception 'mechanical_qc_scope_review';end if;
 select j into job from jsonb_array_elements(ws->'jobs') j where upper(trim(j->>'no'))=upper(trim(jc));
 if upper(trim(jc))='ID001' or coalesce((job->>'delivered')::boolean,false) or coalesce((job->>'cancelled')::boolean,false) or coalesce((job->>'deleted')::boolean,false) or coalesce((job->>'archived')::boolean,false) or upper(coalesce(job->>'status',''))='CANCELLED' then raise exception 'job_inactive';end if;
 if staff_role='Receptionist' and coalesce(job->>'receptionNo','')='' then raise exception 'mechanical_forbidden';end if;
 if p_plan->>'route'='MIXED' and cfg.mixed_mechanical_qc_required is null then raise exception 'mechanical_mixed_qc_policy_required';end if;
 needs_mechanical:=p_plan->>'route'='MECHANICAL_ONLY' or cfg.mixed_mechanical_qc_required;
 if needs_mechanical then
  select * into qc from zukait_mechanical.qc_events where checklist_id=p_entity order by records_revision desc limit 1;
  if not found or qc.result<>'PASS' or qc.actor_id<>'SUP003' or qc.request_id::text is distinct from p_plan->>'qcRequestId' or qc.work_fingerprint is distinct from p_plan->>'workFingerprint' or qc.route is distinct from p_plan->>'route' then raise exception 'mechanical_delivery_not_ready';end if;
 elsif p_plan->>'qcRequestId' is not null then raise exception 'invalid_mechanical_delivery';end if;
 -- Work/route/legacy QC are evaluated by the trusted server planner, bound to
 -- locked revisions. Never expose this internal service RPC to ordinary roles.
 at_ms:=floor(extract(epoch from clock_timestamp())*1000)::bigint;
 qc_revision:=coalesce((job->'qcWorkflow'->>'revision')::bigint,0);
 if qc_revision<0 or qc_revision>=9007199254740991 then raise exception 'revision_exhausted';end if;
 audit:=jsonb_build_object('operation','DELIVER','by',p_actor,'name',staff_name,'at',at_ms);
 projection:=jsonb_build_object('delivered',true,'deliveredAt',at_ms,'deliveredBy',p_actor,'deliveredByName',staff_name,'status','Delivered','qcPassed',true,'mechanicalDelivery',jsonb_build_object('requestId',p_request,'checklistId',p_entity));
 after_job:=job||projection||jsonb_build_object('qcWorkflow',(case when jsonb_typeof(job->'qcWorkflow')='object' then job->'qcWorkflow' else '{}'::jsonb end)||jsonb_build_object('revision',qc_revision+1,'history',(case when jsonb_typeof(job->'qcWorkflow'->'history')='array' then job->'qcWorkflow'->'history' else '[]'::jsonb end)||jsonb_build_array(audit)));
 result:=jsonb_build_object('ok',true,'requestId',p_request,'operation','MECHANICAL_DELIVER','entityId',p_entity,'recordsRevision',ctl.revision+1,'workshopRevision',ws_revision+1);
 insert into zukait_mechanical.receipts(request_id,actor_id,fingerprint,result) values(p_request,p_actor,p_fingerprint,result);
 insert into zukait_mechanical.deliveries(request_id,checklist_id,actor_id,qc_request_id,work_fingerprint,route,source_records_revision,source_workshop_revision,records_revision,workshop_revision,projection)
 values(p_request,p_entity,p_actor,case when needs_mechanical then qc.request_id else null end,p_plan->>'workFingerprint',p_plan->>'route',ctl.revision,ws_revision,ctl.revision+1,ws_revision+1,projection);
 insert into zukait_mechanical.audit(request_id,actor_id,operation,entity_id,device_id,after_value) values(p_request,p_actor,'MECHANICAL_DELIVER',p_entity,p_device,projection);
 select jsonb_agg(case when upper(trim(j->>'no'))=upper(trim(jc)) then after_job else j end order by n) into jobs from jsonb_array_elements(ws->'jobs') with ordinality x(j,n);
 insert into public.workshop_state_history(revision,data,updated_at,updated_by) values(ws_revision,ws,ws_at,ws_by) on conflict(revision) do nothing;
 update public.workshop_state set data=jsonb_set(ws,'{jobs}',jobs),revision=ws_revision+1,updated_by=p_actor,updated_at=clock_timestamp() where id='main';
 update zukait_mechanical.control set revision=revision+1 where singleton;
 return result;
end $$;
revoke all on function public.zukait_mechanical_deliver(text,uuid,text,bigint,bigint,uuid,text,jsonb,text) from public,anon,authenticated;
grant execute on function public.zukait_mechanical_deliver(text,uuid,text,bigint,bigint,uuid,text,jsonb,text) to service_role;

create function zukait_mechanical.protect_delivery() returns trigger language plpgsql security invoker set search_path=pg_catalog as $$
declare current_jobs jsonb; next_jobs jsonb; next_counts jsonb; c record; before_job jsonb; after_job jsonb; permit zukait_mechanical.deliveries; field text; correction jsonb; delivered_jobs text[];
begin
 if new.data is not distinct from old.data or not exists(select 1 from zukait_mechanical.checklists) then return new;end if;
 if jsonb_typeof(new.data->'jobs') is distinct from 'array' then raise exception 'mechanical_delivery_authority_conflict';end if;
 select coalesce(jsonb_object_agg(upper(trim(j->>'no')),j),'{}') into current_jobs from jsonb_array_elements(coalesce(old.data->'jobs','[]')) j;
 select coalesce(jsonb_object_agg(no,value),'{}'),coalesce(jsonb_object_agg(no,n),'{}') into next_jobs,next_counts
 from (select upper(trim(j->>'no')) no,jsonb_agg(j)->0 value,count(*) n from jsonb_array_elements(new.data->'jobs') j where j->>'no' is not null group by upper(trim(j->>'no'))) x;
 -- No control locks here: legacy saves already hold workshop; reversing the
 -- order would deadlock against a Mechanical control->workshop writer.
 for c in select id,job_card from zukait_mechanical.checklists loop
  before_job:=current_jobs->upper(trim(c.job_card));after_job:=next_jobs->upper(trim(c.job_card));
  -- Preserve unrelated writes if legacy metadata has no current job at all.
  if before_job is null and after_job is null then continue;end if;
  if after_job is null or (next_counts->>upper(trim(c.job_card)))::bigint<>1 then raise exception 'mechanical_delivery_authority_conflict';end if;
  if not coalesce((before_job->>'delivered')::boolean,false) then
   if coalesce((after_job->>'delivered')::boolean,false) or after_job ? 'mechanicalDelivery' or upper(coalesce(after_job->>'status',''))='DELIVERED' then
    select * into permit from zukait_mechanical.deliveries where checklist_id=c.id and source_workshop_revision=old.revision and workshop_revision=new.revision;
    if not found or new.updated_by is distinct from permit.actor_id or (select jsonb_object_agg(k,after_job->k) from jsonb_object_keys(permit.projection) k) is distinct from permit.projection then raise exception 'mechanical_delivery_authority_conflict';end if;
   end if;
  else
   foreach field in array array['delivered','deliveredBy','deliveredByName','status','mechanicalDelivery','qcPassed'] loop
    if after_job->field is distinct from before_job->field then raise exception 'mechanical_delivery_authority_conflict';end if;
   end loop;
   if after_job->'deliveredAt' is distinct from before_job->'deliveredAt' then
    correction:=after_job->'deliveryAudit'->-1;
    if not exists(select 1 from public.staff_credentials where user_id=new.updated_by and role='Manager' and active)
     or correction->>'operation' is distinct from 'DELIVERY_DATE_CORRECTION' or correction->>'by' is distinct from new.updated_by
     or correction->'from' is distinct from before_job->'deliveredAt' or correction->'to' is distinct from after_job->'deliveredAt'
     or coalesce(correction->>'reason','')='' or length(correction->>'reason')>2000
     or coalesce((correction->>'to')::numeric,0)<=0
     or ((after_job->'deliveryAudit') - (jsonb_array_length(after_job->'deliveryAudit')-1)) is distinct from coalesce(before_job->'deliveryAudit','[]'::jsonb)
     or (after_job->'qcWorkflow'->>'revision')::bigint is distinct from coalesce((before_job->'qcWorkflow'->>'revision')::bigint,0)+1
     or after_job->'qcWorkflow'->'history' is distinct from (coalesce(before_job->'qcWorkflow'->'history','[]'::jsonb)||jsonb_build_array(correction))
    then raise exception 'mechanical_delivery_authority_conflict';end if;
   end if;
  end if;
 end loop;
 -- Preserve closed historical corrections, but an older full save cannot
 -- reopen allocations or append running periods to an actual delivered job.
 if new.data->'assign' is distinct from old.data->'assign' or new.data->'sessions' is distinct from old.data->'sessions' then
  select array_agg(upper(trim(registered.job_card))) into delivered_jobs from zukait_mechanical.deliveries d join zukait_mechanical.checklists registered on registered.id=d.checklist_id;
  if delivered_jobs is not null then
   if exists(select 1 from jsonb_array_elements(coalesce(new.data->'assign','[]')) a where upper(trim(a->>'job'))=any(delivered_jobs) and not coalesce((a->>'cancelled')::boolean,false) and a->'completed' is distinct from 'true'::jsonb)
    or exists(select 1 from jsonb_array_elements(coalesce(new.data->'sessions','[]')) s where upper(trim(s->>'job'))=any(delivered_jobs) and not coalesce((s->>'cancelled')::boolean,false) and not coalesce((s->>'voided')::boolean,false) and not coalesce((s->>'deleted')::boolean,false) and (s->>'end' is null or s->>'end' in ('','0','null')))
   then raise exception 'mechanical_delivery_authority_conflict';end if;
  end if;
 end if;
 return new;
end $$;
revoke all on function zukait_mechanical.protect_delivery() from public,anon,authenticated;
create trigger mechanical_delivery_authority before update of data on public.workshop_state for each row execute function zukait_mechanical.protect_delivery();

-- Identical-state legacy RPC retries can still write p_live without a state
-- UPDATE. Protect that independent write path as well, with no flag bypass.
create function zukait_mechanical.protect_delivered_live() returns trigger language plpgsql security invoker set search_path=pg_catalog as $$
begin
 if new.status in ('Working','Paused','Overtime','ID001') then
  if exists(select 1 from zukait_mechanical.deliveries d join zukait_mechanical.checklists c on c.id=d.checklist_id where upper(trim(c.job_card))=upper(trim(new.job_no))) then raise exception 'mechanical_delivery_authority_conflict';end if;
  if new.assignment_id ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' then
   if exists(select 1 from zukait_mechanical.links l join zukait_mechanical.tasks t on t.id=l.task_id join zukait_mechanical.deliveries d on d.checklist_id=t.checklist_id where l.assignment_id=new.assignment_id::uuid) then raise exception 'mechanical_delivery_authority_conflict';end if;
  end if;
 end if;
 return new;
end $$;
revoke all on function zukait_mechanical.protect_delivered_live() from public,anon,authenticated;
create trigger mechanical_delivered_live_authority before insert or update on public.workshop_live_status for each row execute function zukait_mechanical.protect_delivered_live();
