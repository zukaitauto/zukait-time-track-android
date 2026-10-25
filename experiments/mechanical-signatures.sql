-- Disposable fixtures only. No generated/applied production migration.
alter table zukait_mechanical.settings add column signatures_enabled boolean not null default false;
alter table zukait_mechanical.settings add column signature_writers jsonb not null default '{}' check(jsonb_typeof(signature_writers)='object');
create table zukait_mechanical.signatures(
 request_id uuid primary key,checklist_id uuid not null references zukait_mechanical.checklists(id),actor_id text not null references public.staff_credentials(user_id),
 device_id text not null check(length(device_id) between 1 and 128),records_revision bigint not null,workshop_revision bigint not null,
 source_hash text not null check(source_hash ~ '^[0-9a-f]{64}$'),fingerprint text not null check(fingerprint ~ '^[0-9a-f]{64}$'),
 consent_version text not null default 'OWN_CHECKLIST_SIGNATURE_V1' check(consent_version='OWN_CHECKLIST_SIGNATURE_V1'),strokes jsonb not null,signed_at timestamptz not null default clock_timestamp(),unique(checklist_id,records_revision,workshop_revision,source_hash)
);
alter table zukait_mechanical.signatures enable row level security;
revoke all on zukait_mechanical.signatures from public,anon,authenticated,service_role;
grant select,insert on zukait_mechanical.signatures to service_role;
create trigger immutable_signature before update or delete or truncate on zukait_mechanical.signatures for each statement execute function zukait_mechanical.append_only();
create function zukait_mechanical.authorize_signature(p_actor text,p_session_hash text) returns jsonb language plpgsql security invoker set search_path=pg_catalog as $$
declare cfg zukait_mechanical.settings; staff_role text;
begin
 select * into cfg from zukait_mechanical.settings where singleton;
 if not coalesce(cfg.enabled and cfg.documents_enabled and cfg.signatures_enabled,false) then raise exception 'mechanical_signatures_disabled';end if;
 if p_actor is distinct from 'SUP003' then raise exception 'mechanical_signature_forbidden';end if;
 select role into staff_role from public.staff_credentials where user_id=p_actor and active for share;
 if staff_role is null or staff_role not in ('Supervisor','Mechanical Supervisor') then raise exception 'mechanical_signature_forbidden';end if;
 if p_session_hash is null or p_session_hash !~ '^[0-9a-f]{64}$' then raise exception 'mechanical_invalid_session';end if;
 perform 1 from public.staff_sessions where user_id=p_actor and token_hash=p_session_hash and revoked_at is null for share;
 if not found then raise exception 'mechanical_invalid_session';end if;
 if jsonb_typeof(cfg.signature_writers->p_actor) is distinct from 'array' or not coalesce((cfg.signature_writers->p_actor)?'OWN_SIGNATURE',false) then raise exception 'mechanical_signature_forbidden';end if;
 return jsonb_build_object('signaturesEnabled',true,'signatureWriters',jsonb_build_object(p_actor,cfg.signature_writers->p_actor));
end $$;
revoke all on function zukait_mechanical.authorize_signature(text,text) from public,anon,authenticated;
grant execute on function zukait_mechanical.authorize_signature(text,text) to service_role;
create function public.zukait_mechanical_signature_read(p_actor text,p_session_hash text,p_kind text,p_request uuid default null,p_entity uuid default null,p_records bigint default null,p_workshop bigint default null,p_source_hash text default null) returns jsonb language plpgsql security invoker set search_path=pg_catalog as $$
declare policy jsonb;r zukait_mechanical.signatures;verification jsonb;
begin
 policy:=zukait_mechanical.authorize_signature(p_actor,p_session_hash);
 if p_kind='policy' then return policy;end if;
 if p_kind='receipt' then
  select * into r from zukait_mechanical.signatures where request_id=p_request;
  if not found then return 'null'::jsonb;end if;
  if r.actor_id<>p_actor then raise exception 'mechanical_signature_forbidden';end if;
 elsif p_kind in('current','export','verify_export') then
  if p_kind in('export','verify_export') and not coalesce((policy->'signatureWriters'->p_actor)?'SIGNED_UNPRICED',false) then raise exception 'mechanical_signature_forbidden';end if;
  if p_source_hash is null or p_source_hash !~ '^[0-9a-f]{64}$' then raise exception 'invalid_mechanical_signature';end if;
  verification:=public.zukait_mechanical_document_read(p_actor,p_session_hash,'verify',p_entity,p_records,p_workshop);
  select * into r from zukait_mechanical.signatures where checklist_id=p_entity and records_revision=p_records and workshop_revision=p_workshop and source_hash=p_source_hash;
  if not found then return 'null'::jsonb;end if;
 else raise exception 'invalid_mechanical_signature';end if;
 -- This private reader is not exposed to ordinary unpriced document recipients.
 return jsonb_build_object('actorId',r.actor_id,'fingerprint',r.fingerprint,'result',jsonb_build_object('requestId',r.request_id,'checklistId',r.checklist_id,'actorId',r.actor_id,'recordsRevision',r.records_revision,'workshopRevision',r.workshop_revision,'sourceHash',r.source_hash,'signedAt',r.signed_at))||case when p_kind='export' then jsonb_build_object('strokes',r.strokes) else '{}'::jsonb end;
end $$;
revoke all on function public.zukait_mechanical_signature_read(text,text,text,uuid,uuid,bigint,bigint,text) from public,anon,authenticated;
grant execute on function public.zukait_mechanical_signature_read(text,text,text,uuid,uuid,bigint,bigint,text) to service_role;
create function public.zukait_mechanical_signature_commit(p_actor text,p_session_hash text,p_request uuid,p_entity uuid,p_records bigint,p_workshop bigint,p_device text,p_source_hash text,p_fingerprint text,p_strokes jsonb) returns jsonb language plpgsql security invoker set search_path=pg_catalog as $$
declare prior jsonb;r zukait_mechanical.signatures;stroke jsonb;point jsonb;first_point jsonb;count_points integer:=0;moved boolean:=false;verification jsonb;
begin
 perform zukait_mechanical.authorize_signature(p_actor,p_session_hash);
 if p_request is null or p_entity is null or p_source_hash is null or p_source_hash !~ '^[0-9a-f]{64}$' or p_fingerprint is null or p_fingerprint !~ '^[0-9a-f]{64}$' or length(trim(coalesce(p_device,''))) not between 1 and 128 then raise exception 'invalid_mechanical_signature';end if;
 -- Exact retry remains historical evidence, never current-document approval.
 select * into r from zukait_mechanical.signatures where request_id=p_request;
 if found then
  if r.actor_id<>p_actor or r.fingerprint<>p_fingerprint then raise exception 'mechanical_signature_request_reused';end if;
  return jsonb_build_object('requestId',r.request_id,'checklistId',r.checklist_id,'actorId',r.actor_id,'recordsRevision',r.records_revision,'workshopRevision',r.workshop_revision,'sourceHash',r.source_hash,'signedAt',r.signed_at);
 end if;
 verification:=public.zukait_mechanical_document_read(p_actor,p_session_hash,'verify',p_entity,p_records,p_workshop);
 if jsonb_typeof(p_strokes) is distinct from 'array' or jsonb_array_length(p_strokes) not between 1 and 64 or octet_length(p_strokes::text)>50000 then raise exception 'invalid_mechanical_signature';end if;
 for stroke in select value from jsonb_array_elements(p_strokes) loop
  if jsonb_typeof(stroke) is distinct from 'array' or jsonb_array_length(stroke) not between 2 and 256 then raise exception 'invalid_mechanical_signature';end if;
  for point in select value from jsonb_array_elements(stroke) loop
   count_points:=count_points+1;
   if count_points>1024 or jsonb_typeof(point) is distinct from 'array' or jsonb_array_length(point)<>2 or jsonb_typeof(point->0) is distinct from 'number' or jsonb_typeof(point->1) is distinct from 'number' then raise exception 'invalid_mechanical_signature';end if;
   if (point->>0)::numeric<>trunc((point->>0)::numeric) or (point->>1)::numeric<>trunc((point->>1)::numeric) or (point->>0)::numeric not between 0 and 10000 or (point->>1)::numeric not between 0 and 10000 then raise exception 'invalid_mechanical_signature';end if;
   if first_point is null then first_point:=point;end if;
   if abs((point->>0)::numeric-(first_point->>0)::numeric)+abs((point->>1)::numeric-(first_point->>1)::numeric)>=100 then moved:=true;end if;
  end loop;
 end loop;
 if not moved then raise exception 'invalid_mechanical_signature';end if;
 -- Serialize on a signature-only advisory key; two different UUIDs cannot sign the
 -- same print source twice, without advancing unrelated workshop/control revisions.
 perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended('mechanical-signature:'||p_entity::text,0));
 select * into r from zukait_mechanical.signatures where request_id=p_request;
 if found then
  if r.actor_id<>p_actor or r.fingerprint<>p_fingerprint then raise exception 'mechanical_signature_request_reused';end if;
 elsif exists(select 1 from zukait_mechanical.signatures where checklist_id=p_entity and records_revision=p_records and workshop_revision=p_workshop and source_hash=p_source_hash) then raise exception 'mechanical_signature_already_recorded';
 else
  insert into zukait_mechanical.signatures(request_id,checklist_id,actor_id,device_id,records_revision,workshop_revision,source_hash,fingerprint,strokes) values(p_request,p_entity,p_actor,p_device,p_records,p_workshop,p_source_hash,p_fingerprint,p_strokes) returning * into r;
 end if;
 return jsonb_build_object('requestId',r.request_id,'checklistId',r.checklist_id,'actorId',r.actor_id,'recordsRevision',r.records_revision,'workshopRevision',r.workshop_revision,'sourceHash',r.source_hash,'signedAt',r.signed_at);
end $$;
revoke all on function public.zukait_mechanical_signature_commit(text,text,uuid,uuid,bigint,bigint,text,text,text,jsonb) from public,anon,authenticated;
grant execute on function public.zukait_mechanical_signature_commit(text,text,uuid,uuid,bigint,bigint,text,text,text,jsonb) to service_role;
