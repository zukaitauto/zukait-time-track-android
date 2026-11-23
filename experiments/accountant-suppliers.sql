-- Disposable fixture only. NOT a generated/applied production migration.
create schema zukait_suppliers;
revoke all on schema zukait_suppliers from public,anon,authenticated;
grant usage on schema zukait_suppliers to service_role;
create table zukait_suppliers.control(singleton boolean primary key default true check(singleton),revision bigint not null default 0 check(revision>=0),enabled boolean not null default false,roles jsonb not null default '["Accountant","Manager"]' check(jsonb_typeof(roles)='array'));
insert into zukait_suppliers.control default values;
create table zukait_suppliers.suppliers(id uuid primary key,created_at timestamptz not null default now());
create table zukait_suppliers.events(request_id uuid primary key references public.workshop_accountant_commands(request_id),supplier_id uuid not null references zukait_suppliers.suppliers(id),revision bigint not null unique,operation text not null check(operation in('SUPPLIER_CREATE','SUPPLIER_UPDATE','SUPPLIER_SOURCE_BIND')),actor_id text not null,device_id text not null,reason text not null,before_state jsonb,after_state jsonb not null,created_at timestamptz not null default now());
create index supplier_events_latest on zukait_suppliers.events(supplier_id,revision desc) where operation in('SUPPLIER_CREATE','SUPPLIER_UPDATE');
create table zukait_suppliers.source_links(source_type text not null check(source_type in('PAINT_ORDER','SPARE_PART_LINE','CONSUMABLE_PURCHASE','VENDOR_BILL')),source_id text not null,supplier_id uuid not null references zukait_suppliers.suppliers(id),request_id uuid not null unique references public.workshop_accountant_commands(request_id),primary key(source_type,source_id));
create view zukait_suppliers.current_suppliers with(security_invoker=true) as select s.id,e.after_state->>'name' name,(e.after_state->>'active')::boolean active,e.revision from zukait_suppliers.suppliers s cross join lateral(select after_state,revision from zukait_suppliers.events where supplier_id=s.id and operation in('SUPPLIER_CREATE','SUPPLIER_UPDATE') order by revision desc limit 1)e;
alter table zukait_suppliers.control enable row level security;alter table zukait_suppliers.suppliers enable row level security;alter table zukait_suppliers.events enable row level security;alter table zukait_suppliers.source_links enable row level security;
revoke all on all tables in schema zukait_suppliers from public,anon,authenticated,service_role;
grant select on all tables in schema zukait_suppliers to service_role;
grant insert on zukait_suppliers.suppliers,zukait_suppliers.events,zukait_suppliers.source_links to service_role;
grant update(revision) on zukait_suppliers.control to service_role;
-- Reuse the existing immutable trigger; no second financial ledger/receipt store.
create trigger supplier_identity_immutable before update or delete on zukait_suppliers.suppliers for each row execute function public.zukait_accountant_immutable();
create trigger supplier_event_immutable before update or delete on zukait_suppliers.events for each row execute function public.zukait_accountant_immutable();
create trigger supplier_source_immutable before update or delete on zukait_suppliers.source_links for each row execute function public.zukait_accountant_immutable();
create trigger supplier_identity_no_truncate before truncate on zukait_suppliers.suppliers for each statement execute function public.zukait_accountant_immutable();
create trigger supplier_event_no_truncate before truncate on zukait_suppliers.events for each statement execute function public.zukait_accountant_immutable();
create trigger supplier_source_no_truncate before truncate on zukait_suppliers.source_links for each statement execute function public.zukait_accountant_immutable();
create function public.zukait_supplier_command(p_actor text,p_session_hash text,p_request uuid,p_fingerprint text,p_expected bigint,p_operation text,p_entity uuid,p_device text,p_payload jsonb,p_reason text) returns jsonb language plpgsql security invoker set search_path=pg_catalog as $$
declare cfg zukait_suppliers.control;staff_role text;receipt public.workshop_accountant_commands;rev bigint;before_value jsonb;after_value jsonb;result jsonb;
begin
 -- Same global journal lock as ordinary Accountant posting: one request namespace.
 perform pg_advisory_xact_lock(hashtext('zukait_accountant_journal'));
 select * into cfg from zukait_suppliers.control where singleton for update;
 if not coalesce(cfg.enabled,false) then raise exception 'supplier_disabled';end if;
 select role into staff_role from public.staff_credentials where user_id=p_actor and active and not must_change for share;
 if staff_role is null or staff_role not in('Manager','Accountant') or not(cfg.roles ? staff_role) then raise exception 'supplier_forbidden';end if;
 if p_session_hash is null or p_session_hash !~ '^[0-9a-f]{64}$' then raise exception 'invalid_session';end if;
 perform 1 from public.staff_sessions where user_id=p_actor and token_hash=p_session_hash and revoked_at is null for share;
 if not found then raise exception 'invalid_session';end if;
 if p_request is null or p_entity is null or p_fingerprint is null or p_fingerprint !~ '^[0-9a-f]{64}$' or p_device is null or length(p_device) not between 1 and 128 or p_device<>trim(p_device) or p_device~'[[:cntrl:]]' or p_reason is null or length(p_reason) not between 3 and 1000 or p_reason<>trim(p_reason) or p_reason~'[[:cntrl:]]' or p_payload is null or jsonb_typeof(p_payload)<>'object' or octet_length(p_payload::text)>4096 then raise exception 'invalid_supplier_command';end if;
 select * into receipt from public.workshop_accountant_commands where request_id=p_request;
 if found then
  if receipt.actor_id<>p_actor or receipt.fingerprint<>p_fingerprint or receipt.result->>'supplierOperation' is distinct from p_operation or receipt.result->>'supplierId' is distinct from p_entity::text then raise exception 'request_conflict';end if;
  return receipt.result||'{"duplicate":true}'::jsonb;
 end if;
 select revision into rev from zukait_suppliers.control where singleton for update;
 if p_expected is null or p_expected<>rev then raise exception 'supplier_revision_conflict';end if;
 select jsonb_build_object('name',name,'active',active) into before_value from zukait_suppliers.current_suppliers where id=p_entity;
 if p_operation in('SUPPLIER_CREATE','SUPPLIER_UPDATE') then
  if exists(select 1 from jsonb_object_keys(p_payload) k where k not in('name','active')) or jsonb_typeof(p_payload->'name') is distinct from 'string' or jsonb_typeof(p_payload->'active') is distinct from 'boolean' or length(p_payload->>'name') not between 1 and 200 or p_payload->>'name'<>trim(p_payload->>'name') or p_payload->>'name'~'[[:cntrl:]]' then raise exception 'invalid_supplier_command';end if;
  if p_operation='SUPPLIER_CREATE' then
   if exists(select 1 from zukait_suppliers.suppliers where id=p_entity) then raise exception 'supplier_exists';end if;
   insert into zukait_suppliers.suppliers(id) values(p_entity);
  elsif before_value is null then raise exception 'supplier_not_found';
  elsif before_value=p_payload then raise exception 'supplier_no_change';end if;
  after_value:=p_payload;
 elsif p_operation='SUPPLIER_SOURCE_BIND' then
  if before_value is null then raise exception 'supplier_not_found';end if;
  if not (before_value->>'active')::boolean then raise exception 'supplier_inactive';end if;
  if exists(select 1 from jsonb_object_keys(p_payload) k where k not in('sourceType','sourceId')) or jsonb_typeof(p_payload->'sourceType') is distinct from 'string' or p_payload->>'sourceType' not in('PAINT_ORDER','SPARE_PART_LINE','CONSUMABLE_PURCHASE','VENDOR_BILL') or jsonb_typeof(p_payload->'sourceId') is distinct from 'string' or length(p_payload->>'sourceId') not between 1 and 128 or p_payload->>'sourceId'<>trim(p_payload->>'sourceId') or p_payload->>'sourceId'~'[[:cntrl:]]' then raise exception 'invalid_supplier_command';end if;
  if exists(select 1 from zukait_suppliers.source_links where source_type=p_payload->>'sourceType' and source_id=p_payload->>'sourceId') then raise exception 'supplier_source_already_bound';end if;
  before_value:=null;after_value:=p_payload||jsonb_build_object('supplierId',p_entity);
 else raise exception 'invalid_supplier_command';end if;
 rev:=rev+1;result:=jsonb_build_object('ok',true,'supplierId',p_entity,'supplierOperation',p_operation,'requestId',p_request,'revision',rev);
 insert into public.workshop_accountant_commands(request_id,actor_id,fingerprint,result) values(p_request,p_actor,p_fingerprint,result);
 if p_operation='SUPPLIER_SOURCE_BIND' then insert into zukait_suppliers.source_links values(p_payload->>'sourceType',p_payload->>'sourceId',p_entity,p_request);end if;
 insert into zukait_suppliers.events(request_id,supplier_id,revision,operation,actor_id,device_id,reason,before_state,after_state) values(p_request,p_entity,rev,p_operation,p_actor,p_device,p_reason,before_value,after_value);
 update zukait_suppliers.control set revision=rev where singleton;
 return result;
end $$;
revoke all on function public.zukait_supplier_command(text,text,uuid,text,bigint,text,uuid,text,jsonb,text) from public,anon,authenticated;
grant execute on function public.zukait_supplier_command(text,text,uuid,text,bigint,text,uuid,text,jsonb,text) to service_role;
