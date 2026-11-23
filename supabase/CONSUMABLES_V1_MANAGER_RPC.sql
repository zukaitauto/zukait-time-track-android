-- Zukait Painting Consumables V1 Manager RPC security layer
-- Requires CONSUMABLES_V1_SECURE_FOUNDATION.sql.
-- Append-only manager actions; existing workshop_state remains untouched.

create or replace function public.zukait_require_manager()
returns void language plpgsql stable security invoker as $$
begin
 if auth.uid() is null or public.zukait_role() <> 'Manager' then raise exception 'MANAGER_ONLY' using errcode='42501'; end if;
end $$;

create or replace function public.zukait_consumables_set_price(
 p_material_id text,p_brand_id text,p_unit text,p_price numeric,p_effective_from date,p_reason text)
returns uuid language plpgsql security definer set search_path=public as $$
declare v_id uuid; v_reason text:=trim(coalesce(p_reason,''));
begin
 perform public.zukait_require_manager();
 if v_reason='' then raise exception 'REASON_REQUIRED'; end if;
 if p_price<0 then raise exception 'INVALID_PRICE'; end if;
 insert into public.consumables_prices(material_id,brand_id,unit,price_per_unit,effective_from,created_by)
 values(p_material_id,p_brand_id,p_unit,round(p_price,3),p_effective_from,auth.uid()) returning id into v_id;
 insert into public.consumables_audit(action,entity_type,entity_id,reason,after_data,changed_by)
 values('PRICE_CREATED','price',v_id::text,v_reason,jsonb_build_object('materialId',p_material_id,'brandId',p_brand_id,'unit',p_unit,'pricePerUnit',round(p_price,3),'effectiveFrom',p_effective_from),auth.uid());
 return v_id;
end $$;

create or replace function public.zukait_consumables_correct_price(
 p_price_id uuid,p_new_price numeric,p_reason text)
returns uuid language plpgsql security definer set search_path=public as $
declare v_reason text:=trim(coalesce(p_reason,'')); v_before jsonb; v_after jsonb;
begin
 perform public.zukait_require_manager();
 if v_reason='' then raise exception 'REASON_REQUIRED'; end if;
 if p_new_price is null or p_new_price<0 then raise exception 'INVALID_PRICE'; end if;
 select to_jsonb(p) into v_before from public.consumables_prices p where p.id=p_price_id and p.voided_at is null for update;
 if v_before is null then raise exception 'PRICE_NOT_FOUND'; end if;
 update public.consumables_prices set price_per_unit=round(p_new_price,3) where id=p_price_id;
 select to_jsonb(p) into v_after from public.consumables_prices p where p.id=p_price_id;
 insert into public.consumables_audit(action,entity_type,entity_id,reason,before_data,after_data,changed_by)
 values('PRICE_CORRECTED','price',p_price_id::text,v_reason,v_before,v_after,auth.uid());
 return p_price_id;
end $;

create or replace function public.zukait_consumables_manager_action(
 p_client_request_id text,p_action text,p_entity_id text,p_job_card text,p_before jsonb,p_after jsonb,p_reason text)
returns uuid language plpgsql security definer set search_path=public as $$
declare v_id uuid; v_reason text:=trim(coalesce(p_reason,'')); v_action text:=upper(trim(coalesce(p_action,'')));
begin
 perform public.zukait_require_manager();
 if v_reason='' then raise exception 'REASON_REQUIRED'; end if;
 if v_action not in ('CORRECTION','VOID','REOPEN') then raise exception 'INVALID_MANAGER_ACTION'; end if;
 if trim(coalesce(p_client_request_id,''))='' then raise exception 'CLIENT_REQUEST_ID_REQUIRED'; end if;
 if trim(coalesce(p_entity_id,''))='' then raise exception 'ENTITY_ID_REQUIRED'; end if;
 if trim(coalesce(p_job_card,''))='' then raise exception 'JOB_CARD_REQUIRED'; end if;
 if p_before is null then raise exception 'AUTHORITATIVE_BEFORE_REQUIRED'; end if;
 if v_action='CORRECTION' and p_after is null then raise exception 'CORRECTION_AFTER_REQUIRED'; end if;
 if v_action='VOID' and p_after is not null then raise exception 'VOID_AFTER_MUST_BE_NULL'; end if;
 if v_action='REOPEN' and (p_after is null or coalesce((p_after->>'managerReopen')::boolean,false) is not true) then raise exception 'REOPEN_MARKER_REQUIRED'; end if;
 select id into v_id from public.consumables_transactions where client_request_id=p_client_request_id;
 if found then return v_id; end if;
 insert into public.consumables_transactions(client_request_id,department,transaction_type,job_card,payload,created_by)
 values(p_client_request_id,'Painting',lower(v_action),upper(trim(p_job_card)),
   jsonb_build_object('entityId',p_entity_id,'before',coalesce(p_before,'null'::jsonb),'after',coalesce(p_after,'null'::jsonb),'reason',v_reason),auth.uid())
 returning id into v_id;
 insert into public.consumables_audit(action,entity_type,entity_id,job_card,reason,before_data,after_data,changed_by)
 values(v_action,'consumables',p_entity_id,upper(trim(p_job_card)),v_reason,p_before,p_after,auth.uid());
 return v_id;
end $$;

revoke all on function public.zukait_require_manager() from public,anon;
revoke all on function public.zukait_consumables_set_price(text,text,text,numeric,date,text) from public,anon;
revoke all on function public.zukait_consumables_correct_price(uuid,numeric,text) from public,anon;
revoke all on function public.zukait_consumables_manager_action(text,text,text,text,jsonb,jsonb,text) from public,anon;
grant execute on function public.zukait_require_manager() to authenticated;
grant execute on function public.zukait_consumables_set_price(text,text,text,numeric,date,text) to authenticated;
grant execute on function public.zukait_consumables_correct_price(uuid,numeric,text) to authenticated;
grant execute on function public.zukait_consumables_manager_action(text,text,text,text,jsonb,jsonb,text) to authenticated;

-- SECURITY DEFINER is intentionally narrow: every write RPC calls the Manager
-- guard first, requires a non-empty reason and action-shaped before/after data, and writes audit in the same DB transaction.
-- NOTE: authoritative entity-state validation still belongs in the future normalized backend wiring; this RPC is not yet deployed.
