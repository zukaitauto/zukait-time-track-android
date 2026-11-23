-- Disposable, inactive read candidate. No generated/applied migration.
alter table zukait_suppliers.control add column read_enabled boolean not null default false;
create function public.zukait_supplier_read(p_actor text,p_session_hash text,p_kind text,p_supplier uuid default null,p_after_id uuid default null,p_source_type text default null,p_source_id text default null) returns jsonb language plpgsql security invoker set search_path=pg_catalog as $$
declare cfg zukait_suppliers.control;staff_role text;rows jsonb;source jsonb;matched integer;ws jsonb;ws_rev bigint;linked jsonb;selected jsonb;
begin
 select * into cfg from zukait_suppliers.control where singleton for share;
 if not coalesce(cfg.enabled and cfg.read_enabled,false) then raise exception 'supplier_read_disabled';end if;
 select role into staff_role from public.staff_credentials where user_id=p_actor and active and not must_change for share;
 if staff_role is null or staff_role not in('Accountant','Manager') or not(cfg.roles ? staff_role) then raise exception 'supplier_forbidden';end if;
 if p_session_hash is null or p_session_hash !~ '^[0-9a-f]{64}$' then raise exception 'invalid_session';end if;
 perform 1 from public.staff_sessions where user_id=p_actor and token_hash=p_session_hash and revoked_at is null for share;
 if not found then raise exception 'invalid_session';end if;
 if p_kind='list' then
  if p_supplier is not null or p_source_type is not null or p_source_id is not null then raise exception 'invalid_supplier_read';end if;
  select coalesce(jsonb_agg(jsonb_build_object('id',id,'name',name,'active',active) order by id),'[]') into rows from(select * from zukait_suppliers.current_suppliers where p_after_id is null or id>p_after_id order by id limit 51)s;
  return jsonb_build_object('ok',true,'revision',cfg.revision,'suppliers',case when jsonb_array_length(rows)>50 then rows-50 else rows end,'nextAfter',case when jsonb_array_length(rows)>50 then rows->49->>'id' else null end);
 elsif p_kind='detail' then
  if p_supplier is null or p_after_id is not null or p_source_type is not null or p_source_id is not null then raise exception 'invalid_supplier_read';end if;
  select jsonb_build_object('id',id,'name',name,'active',active) into selected from zukait_suppliers.current_suppliers where id=p_supplier;
  if selected is null then raise exception 'supplier_not_found';end if;
  return jsonb_build_object('ok',true,'revision',cfg.revision,'supplier',selected);
 elsif p_kind='links' then
  if p_supplier is null or p_after_id is not null or (p_source_type is null)<>(p_source_id is null) then raise exception 'invalid_supplier_read';end if;
  if not exists(select 1 from zukait_suppliers.current_suppliers where id=p_supplier) then raise exception 'supplier_not_found';end if;
  if p_source_type is not null and (p_source_type not in('PAINT_ORDER','SPARE_PART_LINE','CONSUMABLE_PURCHASE','VENDOR_BILL') or length(p_source_id) not between 1 and 128) then raise exception 'invalid_supplier_read';end if;
  select coalesce(jsonb_agg(jsonb_build_object('type',source_type,'id',source_id) order by source_type,source_id),'[]') into rows from(select * from zukait_suppliers.source_links where supplier_id=p_supplier and (p_source_type is null or (source_type,source_id)>(p_source_type,p_source_id)) order by source_type,source_id limit 51)s;
  return jsonb_build_object('ok',true,'revision',cfg.revision,'supplierId',p_supplier,'links',case when jsonb_array_length(rows)>50 then rows-50 else rows end,'nextAfter',case when jsonb_array_length(rows)>50 then rows->49 else null end);
 elsif p_kind='source' then
  if p_supplier is not null or p_after_id is not null or p_source_type is null or p_source_id is null or length(p_source_id) not between 1 and 128 or p_source_id<>trim(p_source_id) or p_source_id~'[[:cntrl:]]' then raise exception 'invalid_supplier_read';end if;
  if p_source_type='PAINT_ORDER' then
   select revision,data->'paintPurchasing'->'orders' into ws_rev,ws from public.workshop_state where id='main';
   if ws_rev is null or (ws is not null and jsonb_typeof(ws)<>'array') then raise exception 'supplier_source_review';end if;
   if coalesce(jsonb_array_length(ws),0)>10000 then raise exception 'supplier_source_limit';end if;
   select count(*),jsonb_agg(jsonb_build_object('id',o->'id','jobCard',o->'jobCard','reference',o->'poNumber','status',o->'status','voided',o->'voided','nilPurchase',o->'nilPaintPurchase','receivedAt',o->'receivedAt','locked',o->'locked','supplierLabel',coalesce(nullif(o->>'supplier',''),nullif(o->>'supplierName',''),o->>'vendor'))) into matched,rows from(select o from jsonb_array_elements(coalesce(ws,'[]')) o where o->>'id'=p_source_id limit 2)x;
   if matched=0 then raise exception 'supplier_source_missing';elsif matched<>1 then raise exception 'supplier_source_review';end if;source:=rows->0;
  elsif p_source_type='SPARE_PART_LINE' then
   select jsonb_build_object('id',part_id,'jobCard',job_card,'reference',list_no,'status',status,'orderedQuantity',ordered_qty,'receivedQuantity',received_qty,'revision',revision,'eventId',last_event_id) into source from public.workshop_v2_spare_part_state where part_id=p_source_id;
   if source is null then raise exception 'supplier_source_missing';end if;
  else raise exception 'supplier_source_unsupported';end if;
  if octet_length(source::text)>4096 then raise exception 'supplier_source_limit';end if;
  select jsonb_build_object('id',s.id,'name',s.name,'active',s.active) into linked from zukait_suppliers.source_links l join zukait_suppliers.current_suppliers s on s.id=l.supplier_id where l.source_type=p_source_type and l.source_id=p_source_id;
  return jsonb_build_object('ok',true,'revision',cfg.revision,'sourceType',p_source_type,'sourceId',p_source_id,'source',source,'workshopRevision',ws_rev,'mappedSupplier',linked);
 else raise exception 'invalid_supplier_read';end if;
end $$;
revoke all on function public.zukait_supplier_read(text,text,text,uuid,uuid,text,text) from public,anon,authenticated;
grant execute on function public.zukait_supplier_read(text,text,text,uuid,uuid,text,text) to service_role;
create index supplier_links_page on zukait_suppliers.source_links(supplier_id,source_type,source_id);
