-- STAGED ONLY — compact, read-only Mechanical Job Card consumables cost.
-- Requires CONSUMABLES_STOCK_COMPACT_FOUNDATION.sql, _MECHANICAL_BATCH.sql,
-- and _MECHANICAL_RETURN.sql. DO NOT DEPLOY TO PRODUCTION.
-- Read only indexed issue lines; NEVER workshop_state or workshop history.
-- Totals are calculated across ALL issue lines for one JC, independent of
-- the 20 most recent detail lines shown in the current page.
create or replace function public.zukait_stock_mechanical_job_totals(
 p_session_hash text,p_job_card text,p_page integer default 0
) returns jsonb language plpgsql security invoker set search_path=''
as $tot$
declare
 v_actor text;
 v_role text;
 v_jc text:=upper(trim(coalesce(p_job_card,'')));
 v_gross numeric(20,8):=0;
 v_returned numeric(20,8):=0;
 v_net numeric(20,8):=0;
 v_count integer:=0;
 v_return_count integer:=0;
 v_details jsonb:='[]'::jsonb;
 v_more boolean:=false;
begin
 if p_page is null or p_page<0 or p_page>49 then
   raise exception 'INVALID_TOTALS_PAGE' using errcode='22023';end if;
 if v_jc='' or length(v_jc)>36 or v_jc !~ '^[A-Z0-9_. -]+$' then
   raise exception 'INVALID_MECHANICAL_JOB' using errcode='22023';end if;
 select sc.user_id::text,sc.role into v_actor,v_role
 from public.staff_sessions ss
 join public.staff_credentials sc on sc.user_id=ss.user_id
 where ss.token_hash=p_session_hash and ss.revoked_at is null
   and sc.active=true and coalesce(sc.must_change,false)=false;
 if v_actor is null or v_role not in ('Manager','Mechanical Supervisor') then
   raise exception 'MECHANICAL_STOCK_FORBIDDEN' using errcode='42501';end if;
 if not exists (
   select 1 from zukait_mechanical.checklists c where upper(c.job_card)=v_jc
 ) and not exists (
   select 1 from zukait_mechanical.intake_jobs c where upper(c.job_card)=v_jc
 ) then raise exception 'MECHANICAL_JOB_NOT_FOUND' using errcode='22023';end if;

 -- Full totals: include every issue line, not only current display page.
 select coalesce(sum(l.locked_cost),0),coalesce(sum(l.return_credit),0),
        count(*)::integer
 into v_gross,v_returned,v_count
 from public.zukait_stock_mechanical_issues i
 join public.zukait_stock_mechanical_lines l on l.issue_id=i.id
 where i.job_card=v_jc;
 v_net:=v_gross-v_returned;
 if v_net<0 then raise exception 'STOCK_VALUATION_CONFLICT' using errcode='23514';end if;
 select count(*)::integer into v_return_count
 from public.zukait_stock_mechanical_issues i
 join public.zukait_stock_mechanical_lines l on l.issue_id=i.id
 join public.zukait_stock_mechanical_returns r on r.line_id=l.id
 where i.job_card=v_jc;

 with current_page as (
   select l.id,l.material_id,l.brand_id,l.unit,
          l.quantity,l.returned_qty,l.locked_cost,l.return_credit,
          i.id as issue_id,i.issue_kind,i.issued_at,
          m.display_name material_name,b.display_name brand_name
   from public.zukait_stock_mechanical_issues i
   join public.zukait_stock_mechanical_lines l on l.issue_id=i.id
   join public.zukait_stock_material_keys m on m.material_id=l.material_id
   join public.zukait_stock_brand_keys b on b.brand_id=l.brand_id
   where i.job_card=v_jc
   order by l.id desc limit 21 offset p_page*20
 ), numbered as (
   select row_number() over() rn,x.* from current_page x
 )
 select coalesce(pg_catalog.jsonb_agg(
   pg_catalog.jsonb_build_object(
     'lineId',x.id,'issueId',x.issue_id,'kind',x.issue_kind,
     'name',x.material_name,'brand',x.brand_name,'unit',x.unit,
     'issuedQty',x.quantity,'returnedQty',x.returned_qty,
     'netQty',x.quantity-x.returned_qty,'grossCost',x.locked_cost,
     'returnCredit',x.return_credit,'netCost',x.locked_cost-x.return_credit,
     'issuedAt',x.issued_at
   ) order by x.rn) filter(where x.rn<=20),'[]'::jsonb),
   count(*)>20
 into v_details,v_more from numbered x;

 return pg_catalog.jsonb_build_object(
   'jobCard',v_jc,'grossCost',v_gross,'returnCredit',v_returned,
   'netCost',v_net,'lineCount',v_count,'returnCount',v_return_count,
   'items',v_details,'page',p_page,'hasMore',v_more,'readOnly',true);
end $tot$;
revoke all on function public.zukait_stock_mechanical_job_totals(text,text,integer)
 from public,anon,authenticated;
grant execute on function public.zukait_stock_mechanical_job_totals(text,text,integer)
 to service_role;
