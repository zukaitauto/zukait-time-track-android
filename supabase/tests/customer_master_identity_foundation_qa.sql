-- Run only inside a disposable QA transaction after staging the schema.

do $test$
declare actor text; rc text; n text; m text; req uuid:=gen_random_uuid(); a jsonb;b jsonb;
begin
 select user_id into actor from public.staff_credentials where active and role='Manager' limit 1;
 select rc_no,trim(details->>'customer'),trim(coalesce(details->>'contact','')) into rc,n,m from public.workshop_receptions where length(trim(coalesce(details->>'customer',''))) between 1 and 200 and length(trim(coalesce(details->>'contact','')))<=80 limit 1;
 if actor is null or rc is null then raise exception 'missing QA fixture'; end if;
 if has_function_privilege('anon','public.zukait_customer_confirm_visit(text,text,text,text,text,uuid,uuid,text)','execute') or has_function_privilege('authenticated','public.zukait_customer_confirm_visit(text,text,text,text,text,uuid,uuid,text)','execute') then raise exception 'public execute leakage';end if;
 begin perform public.zukait_customer_confirm_visit('not-a-staff-user','RECEPTION',rc,n,m,null,req,'QA');raise exception 'unauthorized allowed';exception when raise_exception then if sqlerrm<>'customer_master_manager_required' then raise;end if;end;
 begin perform public.zukait_customer_confirm_visit(actor,'RECEPTION',rc,n||' changed',m,null,req,'QA');raise exception 'stale contact allowed';exception when raise_exception then if sqlerrm<>'customer_master_contact_changed' then raise;end if;end;
 a:=public.zukait_customer_confirm_visit(actor,'RECEPTION',rc,n,m,null,req,'QA confirmed contact');
 b:=public.zukait_customer_confirm_visit(actor,'RECEPTION',rc,n,m,null,req,'QA confirmed contact');
 if a->>'customer_id' is distinct from b->>'customer_id' or b->>'duplicate'<>'true' then raise exception 'replay failure'; end if;
 if (select count(*) from zukait_customer.customers)<>1 or (select count(*) from zukait_customer.visit_links)<>1 then raise exception 'duplicate rows';end if;
 begin perform public.zukait_customer_confirm_visit(actor,'RECEPTION',rc,n,m,null,gen_random_uuid(),'QA duplicate');raise exception 'duplicate visit allowed';exception when raise_exception then if sqlerrm<>'customer_master_visit_already_linked' then raise;end if;end;
 if not exists(select 1 from public.workshop_receptions where rc_no=rc and trim(details->>'customer')=n and trim(coalesce(details->>'contact',''))=m) then raise exception 'source changed';end if;
end $test$;
