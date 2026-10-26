-- Optional own-signature corrections preserve original ink and all work.
create table zukait_mechanical.signature_corrections(
 request_id uuid primary key,signature_id uuid not null unique references zukait_mechanical.signatures(request_id),
 checklist_id uuid not null references zukait_mechanical.checklists(id),actor_id text not null references public.staff_credentials(user_id),
 device_id text not null,reason text not null check(length(trim(reason)) between 5 and 500),
 fingerprint text not null check(fingerprint ~ '^[0-9a-f]{64}$'),result jsonb not null,recorded_at timestamptz not null default clock_timestamp()
);
alter table zukait_mechanical.signature_corrections enable row level security;
revoke all on zukait_mechanical.signature_corrections from public,anon,authenticated,service_role;
grant select,insert on zukait_mechanical.signature_corrections to service_role;
create trigger immutable_signature_correction before update or delete or truncate on zukait_mechanical.signature_corrections for each statement execute function zukait_mechanical.append_only();

create function public.zukait_mechanical_signature_correction_read(p_actor text,p_session_hash text,p_request uuid)
returns jsonb language plpgsql security invoker set search_path=pg_catalog as $$
declare r zukait_mechanical.signature_corrections;
begin
 perform zukait_mechanical.authorize_signature(p_actor,p_session_hash);
 select * into r from zukait_mechanical.signature_corrections where request_id=p_request;
 if not found then return 'null'::jsonb;end if;
 if r.actor_id<>p_actor then raise exception 'mechanical_signature_forbidden';end if;
 return jsonb_build_object('actorId',r.actor_id,'fingerprint',r.fingerprint,'result',r.result);
end $$;

create function public.zukait_mechanical_signature_correct(p_actor text,p_session_hash text,p_request uuid,p_entity uuid,p_records bigint,p_workshop bigint,p_device text,p_source_hash text,p_fingerprint text,p_signature uuid,p_reason text)
returns jsonb language plpgsql security invoker set search_path=pg_catalog as $$
declare previous zukait_mechanical.signature_corrections;signature zukait_mechanical.signatures;revision bigint;verification jsonb;result jsonb;
begin
 -- Credential/session -> control -> workshop follows existing document writers.
 perform zukait_mechanical.authorize_signature(p_actor,p_session_hash);
 if p_request is null or p_entity is null or p_signature is null or p_records is null or p_workshop is null
  or p_fingerprint is null or p_fingerprint !~ '^[0-9a-f]{64}$' or p_source_hash is null or p_source_hash !~ '^[0-9a-f]{64}$'
  or length(trim(coalesce(p_device,''))) not between 1 and 128 or length(trim(coalesce(p_reason,''))) not between 5 and 500
 then raise exception 'invalid_mechanical_signature_correction';end if;
 select c.revision into revision from zukait_mechanical.control c where singleton for update;
 select * into previous from zukait_mechanical.signature_corrections where request_id=p_request;
 if found then
  if previous.actor_id<>p_actor or previous.fingerprint<>p_fingerprint then raise exception 'mechanical_signature_request_reused';end if;
  return previous.result;
 end if;
 if revision is distinct from p_records or revision>=9007199254740991 then raise exception 'mechanical_document_changed';end if;
 verification:=public.zukait_mechanical_document_read(p_actor,p_session_hash,'verify',p_entity,p_records,p_workshop);
 select * into signature from zukait_mechanical.signatures where request_id=p_signature;
 if not found or signature.actor_id<>p_actor or signature.checklist_id<>p_entity or signature.records_revision<>p_records
  or signature.workshop_revision<>p_workshop or signature.source_hash<>p_source_hash
  or exists(select 1 from zukait_mechanical.signature_corrections where signature_id=p_signature)
 then raise exception 'mechanical_document_changed';end if;
 result:=jsonb_build_object('requestId',p_request,'checklistId',p_entity,'actorId',p_actor,'signatureId',p_signature,
  'recordsRevision',revision+1,'workshopRevision',p_workshop,'requiresRedraw',true);
 insert into zukait_mechanical.signature_corrections(request_id,signature_id,checklist_id,actor_id,device_id,reason,fingerprint,result)
 values(p_request,p_signature,p_entity,p_actor,p_device,trim(p_reason),p_fingerprint,result);
 -- An audited revision invalidates the old print copy; original ink stays immutable.
 update zukait_mechanical.control c set revision=c.revision+1 where singleton;
 return result;
end $$;
revoke all on function public.zukait_mechanical_signature_correction_read(text,text,uuid) from public,anon,authenticated;
revoke all on function public.zukait_mechanical_signature_correct(text,text,uuid,uuid,bigint,bigint,text,text,text,uuid,text) from public,anon,authenticated;
grant execute on function public.zukait_mechanical_signature_correction_read(text,text,uuid) to service_role;
grant execute on function public.zukait_mechanical_signature_correct(text,text,uuid,uuid,bigint,bigint,text,text,text,uuid,text) to service_role;
notify pgrst,'reload schema';
