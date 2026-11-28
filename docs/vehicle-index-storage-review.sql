-- Review draft, NOT a migration; run only in an isolated QA PostgreSQL instance.
-- A reviewed catalogue must seed entries and one meta row atomically before enabling.
begin;
create table public.zukait_vehicle_index_meta (
 id boolean primary key default true check(id),
 version bigint not null check(version>=1)
);
create table public.zukait_vehicle_index_entries (
 id text primary key,
 kind text not null check(kind in ('ADD_MAKE','ADD_MODEL','MAKE_ALIAS','MODEL_ALIAS')),
 name text not null check(char_length(name) between 1 and 160),
 scope text not null,
 name_key text not null check(char_length(name_key)>0),
 make_id text references public.zukait_vehicle_index_entries(id),
 target_id text references public.zukait_vehicle_index_entries(id),
 unique(scope,name_key),
 check((kind='ADD_MAKE' and scope='@makes' and make_id is null and target_id is null)
    or (kind='ADD_MODEL' and scope=make_id and make_id is not null and target_id is null)
    or (kind='MAKE_ALIAS' and scope='@makes' and make_id is null and target_id is not null)
    or (kind='MODEL_ALIAS' and scope=make_id and make_id is not null and target_id is not null))
);
create table public.zukait_vehicle_index_audit (
 request_id text primary key,
 actor_id text not null,
 proposal jsonb not null,
 receipt jsonb not null,
 approved_at timestamptz not null default now()
);
alter table public.zukait_vehicle_index_meta enable row level security;
alter table public.zukait_vehicle_index_entries enable row level security;
alter table public.zukait_vehicle_index_audit enable row level security;
revoke all on public.zukait_vehicle_index_meta,public.zukait_vehicle_index_entries,public.zukait_vehicle_index_audit from public,anon,authenticated;
grant select,update on public.zukait_vehicle_index_meta to service_role;
grant select,insert on public.zukait_vehicle_index_entries,public.zukait_vehicle_index_audit to service_role;
create function public.zukait_vehicle_index_approve(
 p_session_hash text,p_request_id text,p_expected_version bigint,p_kind text,
 p_value text,p_make_id text,p_target_id text,p_reason text
) returns jsonb language plpgsql security invoker set search_path=pg_catalog,public as $$
declare
 actor text; actor_role text; current_version bigint; name_norm text; entry_scope text; new_id text;
 old_audit public.zukait_vehicle_index_audit%rowtype; proposal jsonb; receipt jsonb;
begin
 if p_session_hash is null or p_session_hash !~ '^[a-f0-9]{64}$' then return jsonb_build_object('ok',false,'code','invalid_session'); end if;
 -- Lock the authoritative session and credential rows for the transaction.
 select c.user_id::text,c.role::text into actor,actor_role
 from public.staff_sessions s join public.staff_credentials c on c.user_id=s.user_id
 where s.token_hash=p_session_hash and s.revoked_at is null and c.active is true and c.must_change is not true
 for share of s,c;
 if actor is null then return jsonb_build_object('ok',false,'code','invalid_session'); end if;
 if actor_role is distinct from 'Manager' then return jsonb_build_object('ok',false,'code','manager_required'); end if;
 if p_request_id is null or p_request_id !~ '^[A-Za-z0-9_.:-]{1,160}$'
 or p_expected_version is null or p_expected_version<1 or p_kind is null or p_kind not in ('ADD_MAKE','ADD_MODEL','MAKE_ALIAS','MODEL_ALIAS')
 or p_value is null or char_length(p_value)>160 or p_value ~ '[[:cntrl:]]'
 or p_reason is null or char_length(p_reason)>500 or char_length(btrim(p_reason))<5 or p_reason ~ '[[:cntrl:]]'
 or (p_kind in ('ADD_MODEL','MODEL_ALIAS')) is distinct from (p_make_id is not null)
 or (p_kind in ('MAKE_ALIAS','MODEL_ALIAS')) is distinct from (p_target_id is not null)
 then return jsonb_build_object('ok',false,'code','invalid_request'); end if;
 p_value:=btrim(p_value); p_reason:=btrim(p_reason);
 name_norm:=lower(btrim(regexp_replace(normalize(p_value,NFKC),'[[:space:]]+',' ','g')));
 if name_norm='' then return jsonb_build_object('ok',false,'code','invalid_request'); end if;
 proposal:=jsonb_build_object('kind',p_kind,'value',p_value,'makeId',p_make_id,'targetId',p_target_id,'reason',p_reason,'expectedVersion',p_expected_version);
 -- One small catalogue row serializes approvals; never locks workshop data.
 select version into current_version from public.zukait_vehicle_index_meta where id=true for update;
 if current_version is null then return jsonb_build_object('ok',false,'code','catalogue_not_initialized'); end if;
 select * into old_audit from public.zukait_vehicle_index_audit where request_id=p_request_id;
 if found then
  if old_audit.actor_id<>actor or old_audit.proposal<>proposal then return jsonb_build_object('ok',false,'code','request_id_conflict'); end if;
  return old_audit.receipt;
 end if;
 if current_version<>p_expected_version then return jsonb_build_object('ok',false,'code','catalogue_changed'); end if;
 if p_make_id is not null and not exists(select 1 from public.zukait_vehicle_index_entries where id=p_make_id and kind='ADD_MAKE') then return jsonb_build_object('ok',false,'code','unknown_target'); end if;
 if p_kind='MAKE_ALIAS' and not exists(select 1 from public.zukait_vehicle_index_entries where id=p_target_id and kind='ADD_MAKE') then return jsonb_build_object('ok',false,'code','unknown_target'); end if;
 if p_kind='MODEL_ALIAS' and not exists(select 1 from public.zukait_vehicle_index_entries where id=p_target_id and kind='ADD_MODEL' and make_id=p_make_id) then return jsonb_build_object('ok',false,'code','unknown_target'); end if;
 entry_scope:=coalesce(p_make_id,'@makes');
 if exists(select 1 from public.zukait_vehicle_index_entries where scope=entry_scope and name_key=name_norm) then return jsonb_build_object('ok',false,'code','name_exists'); end if;
 new_id:='local:'||gen_random_uuid()::text;
 insert into public.zukait_vehicle_index_entries(id,kind,name,scope,name_key,make_id,target_id)
 values(new_id,p_kind,p_value,entry_scope,name_norm,p_make_id,p_target_id);
 update public.zukait_vehicle_index_meta set version=current_version+1 where id=true;
 receipt:=jsonb_build_object('ok',true,'requestId',p_request_id,'entryId',new_id,'version',current_version+1);
 insert into public.zukait_vehicle_index_audit(request_id,actor_id,proposal,receipt) values(p_request_id,actor,proposal,receipt);
 return receipt;
end $$;
revoke all on function public.zukait_vehicle_index_approve(text,text,bigint,text,text,text,text,text) from public,anon,authenticated;
grant execute on function public.zukait_vehicle_index_approve(text,text,bigint,text,text,text,text,text) to service_role;
commit;
