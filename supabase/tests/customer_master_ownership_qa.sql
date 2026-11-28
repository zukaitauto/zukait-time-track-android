-- Disposable QA transaction only.
do $qa$
declare mgr text; v uuid; provisional uuid; c1 uuid; c2 uuid; first_id uuid; second_id uuid;
 req uuid:=gen_random_uuid(); start_day date:=(now() at time zone 'Asia/Muscat')::date-3; x jsonb;
begin
 select user_id into mgr from public.staff_credentials where active and role='Manager' limit 1;
 if mgr is null then raise exception 'missing manager QA fixture';end if;
 insert into zukait_customer.customers(display_name,mobile,created_by) values('QA Shared Name','99000000',mgr) returning id into c1;
 insert into zukait_customer.customers(display_name,mobile,created_by) values('QA Shared Name','99000000',mgr) returning id into c2;
 insert into zukait_vehicle.physical_vehicles(vin_key,identity_status,make,model) values('QATEST'||replace(gen_random_uuid()::text,'-',''),'VIN_VERIFIED','QA','Fixture') returning id into v;
 insert into zukait_vehicle.physical_vehicles(identity_status,make,model) values('PROVISIONAL','QA','Unverified') returning id into provisional;
 x:=public.zukait_customer_profile_search(mgr,'QA Shared Name',0);
 if jsonb_array_length(x->'rows')<>2 then raise exception 'same-name profiles merged';end if;
 begin perform public.zukait_customer_confirm_ownership(mgr,provisional,c1,null,start_day,gen_random_uuid(),'QA');raise exception 'provisional ownership allowed';exception when raise_exception then if sqlerrm<>'customer_master_vehicle_vin_required' then raise;end if;end;
 begin perform public.zukait_customer_confirm_ownership('unknown',v,c1,null,start_day,gen_random_uuid(),'QA');raise exception 'unauthorized ownership allowed';exception when raise_exception then if sqlerrm<>'customer_master_manager_required' then raise;end if;end;
 x:=public.zukait_customer_confirm_ownership(mgr,v,c1,null,start_day,gen_random_uuid(),'QA first owner');first_id:=(x->>'period_id')::uuid;
 x:=public.zukait_customer_confirm_ownership(mgr,v,c2,first_id,start_day+1,req,'QA sale');second_id:=(x->>'period_id')::uuid;
 x:=public.zukait_customer_confirm_ownership(mgr,v,c2,first_id,start_day+1,req,'QA sale');
 if x->>'duplicate'<>'true' or (x->>'period_id')::uuid<>second_id then raise exception 'ownership retry failed';end if;
 if not exists(select 1 from zukait_vehicle.ownership_periods where id=first_id and valid_until=start_day and customer_reference=c1::text) or
 not exists(select 1 from zukait_vehicle.ownership_periods where id=second_id and valid_until is null and customer_reference=c2::text) then raise exception 'ownership chronology failed';end if;
 begin perform public.zukait_customer_confirm_ownership(mgr,v,c1,first_id,start_day+2,gen_random_uuid(),'QA stale');raise exception 'stale transfer allowed';exception when raise_exception then if sqlerrm<>'customer_master_ownership_changed' then raise;end if;end;
 if has_function_privilege('anon','public.zukait_customer_confirm_ownership(text,uuid,uuid,uuid,date,uuid,text)','execute') or has_function_privilege('authenticated','public.zukait_customer_profile_search(text,text,integer)','execute') then raise exception 'public exposure';end if;
end $qa$;
