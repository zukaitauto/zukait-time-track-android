-- V427 staged customer visit directory. No identity merges, historical writes,
-- full workshop_state reads or customer contact exposure to public API roles.
-- A visit contact is not a confirmed owner or a permanent customer identity.
begin;
create or replace function public.zukait_customer_visit_search(
 p_source text,p_query text,p_page integer default 0
) returns jsonb
language plpgsql stable security invoker
set search_path=pg_catalog,public
as $$
declare q text:=lower(trim(coalesce(p_query,''))); digits text;
 result jsonb;
begin
 if p_source not in ('checklists','direct-jobs') or p_source is null or length(q) not between 3 and 80
  or p_page is null or p_page not between 0 and 100 then
  raise exception 'customer_master_invalid_search';
 end if;
 digits:=regexp_replace(q,'[^0-9]','','g');
 if p_source='checklists' then
  with found as (
   select rc_no, job_card, coalesce(details->>'customer','') customer,
          coalesce(details->>'contact','') mobile,
          concat_ws(' ',nullif(details->>'make',''),nullif(details->>'model',''),nullif(details->>'year','')) vehicle,
          details->>'registration' registration, sequence_no
   from public.workshop_receptions
   where strpos(lower(coalesce(details->>'customer','')),q)>0
     or (q ~ '^[0-9+() .-]+$' and length(digits)>=7 and
         strpos(regexp_replace(coalesce(details->>'contact',''),'[^0-9]','','g'),digits)>0)
   order by sequence_no desc,rc_no desc limit 26 offset p_page*25
  ), page as (select * from found order by sequence_no desc,rc_no desc limit 25)
  select jsonb_build_object('rows',coalesce((select jsonb_agg(to_jsonb(page)-'sequence_no' order by sequence_no desc,rc_no desc) from page),'[]'::jsonb),
   'has_more',(select count(*)>25 from found)) into result;
 else
  with found as (
   select job_card,coalesce(nullif(identity->>'customer',''),identity->>'customerName','') customer,
    coalesce(nullif(identity->>'mobile',''),identity->>'customerMobile','') mobile,
    coalesce(nullif(identity->>'vehicle',''),concat_ws(' ',nullif(coalesce(identity->>'make',identity->>'brand'),''),nullif(identity->>'model',''),nullif(coalesce(identity->>'year',identity->>'vehicleYear'),''))) vehicle,
    coalesce(identity->>'reg',identity->>'registration') registration
   from public.workshop_direct_job_identity
   where strpos(lower(coalesce(nullif(identity->>'customer',''),identity->>'customerName','')),q)>0
    or (q ~ '^[0-9+() .-]+$' and length(digits)>=7 and
     strpos(regexp_replace(coalesce(nullif(identity->>'mobile',''),identity->>'customerMobile',''),'[^0-9]','','g'),digits)>0)
   order by job_card desc limit 26 offset p_page*25
  ), page as (select * from found order by job_card desc limit 25)
  select jsonb_build_object('rows',coalesce((select jsonb_agg(to_jsonb(page) order by job_card desc) from page),'[]'::jsonb),
   'has_more',(select count(*)>25 from found)) into result;
 end if;
 return result;
end $$;
revoke all on function public.zukait_customer_visit_search(text,text,integer) from public,anon,authenticated;
grant execute on function public.zukait_customer_visit_search(text,text,integer) to service_role;
commit;
