-- STAGED ONLY: Mechanical Return Materials. Requires the compact foundation
-- and CONSUMABLES_STOCK_MECHANICAL_BATCH.sql. DO NOT APPLY TO PRODUCTION.
-- Return is a new audited transaction. NEVER overwrite original issue, brand,
-- locked issue price, or a Job Card. One row, one balance lock, one receipt.
create table if not exists public.zukait_stock_mechanical_returns(
  id bigint generated always as identity primary key,
  line_id bigint not null references public.zukait_stock_mechanical_lines(id),
  request_id text not null unique,
  actor_id text not null,
  quantity numeric(18,4) not null check(quantity>0),
  credit numeric(20,8) not null check(credit>=0),
  reason text not null check(length(reason) between 5 and 180),
  returned_at timestamptz not null default now()
);
create index if not exists zukait_stock_mech_returns_line_idx
  on public.zukait_stock_mechanical_returns(line_id,id);
alter table public.zukait_stock_mechanical_returns enable row level security;
revoke all on public.zukait_stock_mechanical_returns from public,anon,authenticated;
grant select,insert,update,delete on public.zukait_stock_mechanical_returns to service_role;
grant usage,select on sequence public.zukait_stock_mechanical_returns_id_seq to service_role;

-- One bounded read for the selected Mechanical Job Card; never loads entire
-- workshop state, prices or purchase history. Paging only among issued lines.
create or replace function public.zukait_stock_mechanical_returnable(
 p_session_hash text,p_job_card text,p_page integer default 0
) returns jsonb language plpgsql security invoker set search_path=''
as $read$
declare
 v_actor text;
 v_role text;
 v_jc text:=upper(trim(coalesce(p_job_card,'')));
 v_rows jsonb;
 v_more boolean;
begin
 if p_page is null or p_page<0 or p_page>49 then
   raise exception 'INVALID_RETURN_PAGE' using errcode='22023';end if;
 if v_jc='' or length(v_jc)>36 or v_jc !~ '^[A-Z0-9_. -]+$' then
   raise exception 'INVALID_MECHANICAL_JOB' using errcode='22023';end if;
 select sc.user_id::text,sc.role into v_actor,v_role
 from public.staff_sessions ss
 join public.staff_credentials sc on sc.user_id=ss.user_id
 where ss.token_hash=p_session_hash and ss.revoked_at is null
   and sc.active=true and coalesce(sc.must_change,false)=false;
 if v_actor is null or v_role not in ('Manager','Mechanical Supervisor') then
   raise exception 'MECHANICAL_STOCK_FORBIDDEN' using errcode='42501';end if;
 with recent as (
   select l.id,l.material_id,l.brand_id,l.unit,l.quantity,l.returned_qty,
     l.locked_unit_cost,l.locked_cost,l.return_credit,
     m.display_name as material_name,b.display_name as brand_name,
     i.job_card,i.issued_at,i.id as issue_id
   from public.zukait_stock_mechanical_issues i
   join public.zukait_stock_mechanical_lines l on l.issue_id=i.id
   join public.zukait_stock_material_keys m on m.material_id=l.material_id
   join public.zukait_stock_brand_keys b on b.brand_id=l.brand_id
   where i.job_card=v_jc and l.returned_qty<l.quantity
   order by l.id desc limit 21 offset p_page*20
 ), numbered as (
   select row_number() over() rn,x.* from recent x
 )
 select coalesce(pg_catalog.jsonb_agg(
   pg_catalog.jsonb_build_object(
     'lineId',x.id,'issueId',x.issue_id,'jobCard',x.job_card,
     'materialId',x.material_id,'brandId',x.brand_id,
     'name',x.material_name,'brand',x.brand_name,'unit',x.unit,
     'issuedQty',x.quantity,'returnedQty',x.returned_qty,
     'availableToReturn',x.quantity-x.returned_qty,
     'issuedAt',x.issued_at
   ) order by x.rn) filter(where x.rn<=20),'[]'::jsonb),
   count(*)>20
 into v_rows,v_more from numbered x;
 return pg_catalog.jsonb_build_object('items',v_rows,'page',p_page,'hasMore',v_more);
end $read$;
revoke all on function public.zukait_stock_mechanical_returnable(text,text,integer)
 from public,anon,authenticated;
grant execute on function public.zukait_stock_mechanical_returnable(text,text,integer)
 to service_role;

create or replace function public.zukait_stock_mechanical_return(
 p_session_hash text,p_request_id text,p_data jsonb
) returns jsonb language plpgsql security invoker set search_path=''
as $ret$
declare
 v_actor text;
 v_role text;
 v_line public.zukait_stock_mechanical_lines%rowtype;
 v_issue public.zukait_stock_mechanical_issues%rowtype;
 v_balance public.zukait_stock_balances%rowtype;
 v_receipt public.zukait_stock_request_receipts%rowtype;
 v_line_id bigint;
 v_qty numeric;
 v_rem numeric;
 v_credit numeric;
 v_fp text;
 v_reason text:=trim(coalesce(p_data->>'reason',''));
 v_return_id bigint;
 v_result jsonb;
begin
 if p_request_id is null or length(p_request_id) not between 1 and 120
    or p_request_id !~ '^[a-zA-Z0-9_.:-]+$' then
    raise exception 'REQUEST_ID_REQUIRED' using errcode='22023';end if;
 if p_data is null or jsonb_typeof(p_data)<>'object' or octet_length(p_data::text)>600
    then raise exception 'INVALID_STOCK_PAYLOAD' using errcode='22023';end if;
 if coalesce(p_data->>'lineId','') !~ '^[1-9][0-9]{0,17}$' then
    raise exception 'INVALID_RETURN_LINE' using errcode='22023';end if;
 if coalesce(p_data->>'quantity','') !~ '^[0-9]+([.][0-9]+)?$' then
    raise exception 'INVALID_RETURN_QUANTITY' using errcode='22023';end if;
 if length(v_reason) not between 5 and 180 then
    raise exception 'RETURN_REASON_REQUIRED' using errcode='22023';end if;
 v_line_id:=(p_data->>'lineId')::bigint;
 v_qty:=(p_data->>'quantity')::numeric;
 if v_qty<=0 or pg_catalog.round(v_qty,4)<>v_qty then
    raise exception 'INVALID_RETURN_QUANTITY' using errcode='22023';end if;

 select sc.user_id::text,sc.role into v_actor,v_role
 from public.staff_sessions ss
 join public.staff_credentials sc on sc.user_id=ss.user_id
 where ss.token_hash=p_session_hash and ss.revoked_at is null
   and sc.active=true and coalesce(sc.must_change,false)=false;
 if v_actor is null or v_role not in ('Manager','Mechanical Supervisor') then
    raise exception 'MECHANICAL_STOCK_FORBIDDEN' using errcode='42501';end if;

 -- Identical request replays return identical receipt. Different payload or
 -- actor with same request id is an error, not an additional credit.
 perform pg_catalog.pg_advisory_xact_lock(
   pg_catalog.hashtextextended('zukait-stock:'||p_request_id,0));
 v_fp:=pg_catalog.md5('MECHANICAL_RETURN:'||p_data::text);
 select * into v_receipt from public.zukait_stock_request_receipts
 where request_id=p_request_id;
 if found then
   if v_receipt.action<>'MECHANICAL_RETURN' or v_receipt.actor_id<>v_actor
       or v_receipt.fingerprint<>v_fp then
     raise exception 'REQUEST_ID_CONFLICT' using errcode='23505';end if;
   return v_receipt.result;
 end if;

 -- Serialises two competing returns against the same original issue line.
 select * into v_line from public.zukait_stock_mechanical_lines
 where id=v_line_id for update;
 if not found then raise exception 'MECHANICAL_LINE_NOT_FOUND' using errcode='22023';end if;
 select * into v_issue from public.zukait_stock_mechanical_issues
 where id=v_line.issue_id;
 if not found then raise exception 'MECHANICAL_LINE_NOT_FOUND' using errcode='22023';end if;
 if upper(trim(coalesce(p_data->>'jobCard',''))) is distinct from v_issue.job_card then
   raise exception 'MECHANICAL_LINE_NOT_FOUND' using errcode='22023';end if;
 v_rem:=v_line.quantity-v_line.returned_qty;
 if v_rem<=0 or v_qty>v_rem then
   raise exception 'RETURN_EXCEEDS_ISSUED' using errcode='23514';end if;
 if v_line.unit='Piece' and pg_catalog.trunc(v_qty)<>v_qty then
   raise exception 'PIECE_WHOLE_REQUIRED' using errcode='22023';end if;

 select * into v_balance from public.zukait_stock_balances
 where material_id=v_line.material_id and brand_id=v_line.brand_id for update;
 if not found or v_balance.unit<>v_line.unit then
   raise exception 'STOCK_UNIT_CONFLICT' using errcode='23514';end if;
 -- The last partial return gets the remaining original cost. This caps
 -- accumulated return credit exactly at the original final issue cost.
 v_credit:=case when v_qty=v_rem
   then v_line.locked_cost-v_line.return_credit
   else least(v_line.locked_cost-v_line.return_credit,
              pg_catalog.round(v_qty*v_line.locked_unit_cost,8)) end;
 if v_credit<0 then raise exception 'STOCK_VALUATION_CONFLICT' using errcode='23514';end if;
 update public.zukait_stock_balances
 set physical=physical+v_qty,stock_value=stock_value+v_credit,updated_at=now()
 where material_id=v_line.material_id and brand_id=v_line.brand_id;
 update public.zukait_stock_mechanical_lines
 set returned_qty=returned_qty+v_qty,return_credit=return_credit+v_credit
 where id=v_line_id;
 insert into public.zukait_stock_mechanical_returns(
  line_id,request_id,actor_id,quantity,credit,reason)
 values(v_line_id,p_request_id,v_actor,v_qty,v_credit,v_reason)
 returning id into v_return_id;
 insert into public.zukait_stock_movements(
   material_id,brand_id,action,physical_delta,reserved_delta,cost_delta,
   job_card,actor_id,request_id,note)
 values(v_line.material_id,v_line.brand_id,'MECHANICAL_RETURN',
   v_qty,0,v_credit,v_issue.job_card,v_actor,
   'mechreturn:'||pg_catalog.md5(p_request_id),
   'Return issue line '||v_line_id||': '||v_reason);
 v_result:=pg_catalog.jsonb_build_object(
   'returnId',v_return_id,'lineId',v_line_id,'jobCard',v_issue.job_card,
   'quantity',v_qty,'credit',v_credit,
   'remaining',v_rem-v_qty,'final',true);
 insert into public.zukait_stock_request_receipts(
   request_id,actor_id,action,fingerprint,result)
 values(p_request_id,v_actor,'MECHANICAL_RETURN',v_fp,v_result);
 return v_result;
end $ret$;
revoke all on function public.zukait_stock_mechanical_return(text,text,jsonb)
 from public,anon,authenticated;
grant execute on function public.zukait_stock_mechanical_return(text,text,jsonb)
 to service_role;
