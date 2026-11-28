-- Staged Customer Master foundation. Not installed in production.
-- Explicit confirmed visit linkage only; never merge by phone, name, VIN or plate.
-- No triggers or writes to existing Checklist, Job Card or ownership records.
begin;
create schema zukait_customer;
revoke all on schema zukait_customer from public,anon,authenticated;
grant usage on schema zukait_customer to service_role;
create table zukait_customer.customers (
 id uuid primary key default gen_random_uuid(),
 display_name text not null check(length(trim(display_name)) between 1 and 200),
 mobile text not null default '' check(length(mobile)<=80),
 created_by text not null,
 created_at timestamptz not null default now()
);
create table zukait_customer.visit_links (
 source_kind text not null check(source_kind in ('RECEPTION','DIRECT_JOB')),
 source_id text not null,
 customer_id uuid not null references zukait_customer.customers(id),
 contact_name_snapshot text not null,
 contact_mobile_snapshot text not null,
 confirmed_by text not null,
 confirmed_at timestamptz not null default now(),
 reason text not null check(length(trim(reason)) between 1 and 500),
 request_id uuid not null unique,
 requested_customer_id uuid,
 primary key(source_kind,source_id)
);
create index customer_visit_history on zukait_customer.visit_links(customer_id,confirmed_at desc);
alter table zukait_customer.customers enable row level security;
alter table zukait_customer.visit_links enable row level security;
revoke all on all tables in schema zukait_customer from public,anon,authenticated;
grant select,insert on zukait_customer.customers,zukait_customer.visit_links to service_role;
create or replace function public.zukait_customer_confirm_visit(
 p_actor text,p_source_kind text,p_source_id text,p_expected_name text,p_expected_mobile text,
 p_customer_id uuid,p_request_id uuid,p_reason text
) returns jsonb language plpgsql security invoker
set search_path=pg_catalog,public,zukait_customer as $$
declare n text; m text; existing zukait_customer.visit_links; cid uuid;
begin
 if not exists(select 1 from public.staff_credentials where user_id=p_actor and active and role='Manager') then
  raise exception 'customer_master_manager_required';
 end if;
 if p_source_kind is null or p_source_kind not in ('RECEPTION','DIRECT_JOB')
  or length(trim(coalesce(p_source_id,''))) not between 1 and 80 or p_request_id is null
  or length(trim(coalesce(p_reason,''))) not between 1 and 500 then
  raise exception 'customer_master_invalid_confirmation';
 end if;
 perform pg_advisory_xact_lock(hashtextextended('customer-request:'||p_request_id::text,0));
 perform pg_advisory_xact_lock(hashtextextended('customer-visit:'||p_source_kind||':'||p_source_id,0));
 select * into existing from zukait_customer.visit_links where request_id=p_request_id;
 if found then
  if existing.source_kind<>p_source_kind or existing.source_id<>p_source_id
    or existing.confirmed_by<>p_actor or existing.contact_name_snapshot is distinct from p_expected_name
    or existing.contact_mobile_snapshot is distinct from p_expected_mobile
    or existing.reason<>trim(p_reason) or existing.requested_customer_id is distinct from p_customer_id
    then raise exception 'customer_master_request_conflict'; end if;
  return jsonb_build_object('ok',true,'customer_id',existing.customer_id,'duplicate',true);
 end if;
 if exists(select 1 from zukait_customer.visit_links where source_kind=p_source_kind and source_id=p_source_id) then
  raise exception 'customer_master_visit_already_linked';
 end if;
 if p_source_kind='RECEPTION' then
  select trim(coalesce(details->>'customer','')),trim(coalesce(details->>'contact','')) into n,m
    from public.workshop_receptions where rc_no=p_source_id;
 else
  select trim(coalesce(nullif(identity->>'customer',''),identity->>'customerName','')),
   trim(coalesce(nullif(identity->>'mobile',''),identity->>'customerMobile','')) into n,m
    from public.workshop_direct_job_identity where job_card=p_source_id;
 end if;
 if not found or length(coalesce(n,'')) not between 1 and 200 or length(coalesce(m,''))>80 then
  raise exception 'customer_master_contact_unavailable';
 end if;
 if n is distinct from p_expected_name or m is distinct from p_expected_mobile then
  raise exception 'customer_master_contact_changed';
 end if;
 if p_customer_id is null then
  insert into zukait_customer.customers(display_name,mobile,created_by) values(n,m,p_actor) returning id into cid;
 else
  select id into cid from zukait_customer.customers where id=p_customer_id;
  if not found then raise exception 'customer_master_unknown_customer'; end if;
 end if;
 insert into zukait_customer.visit_links(source_kind,source_id,customer_id,contact_name_snapshot,contact_mobile_snapshot,confirmed_by,reason,request_id,requested_customer_id)
 values(p_source_kind,p_source_id,cid,n,m,p_actor,trim(p_reason),p_request_id,p_customer_id);
 return jsonb_build_object('ok',true,'customer_id',cid,'duplicate',false);
end $$;
revoke all on function public.zukait_customer_confirm_visit(text,text,text,text,text,uuid,uuid,text) from public,anon,authenticated;
grant execute on function public.zukait_customer_confirm_visit(text,text,text,text,text,uuid,uuid,text) to service_role;
commit;
