-- ZUKAIT Mechanical Consumables: one final issue for up to 20 material/brand lines.
-- STAGED ONLY; DO NOT APPLY TO PRODUCTION. Requires stock compact foundation.
-- No workshop_state reads/writes, copied catalog names, or duplicated JC snapshots.
-- All rows and receipt are written in ONE PostgreSQL transaction.
create table if not exists public.zukait_stock_mechanical_issues (
 id bigint generated always as identity primary key,
 job_card text not null check(length(job_card) between 1 and 36),
 issue_kind text not null check(issue_kind in ('issued','additional')),
 actor_id text not null,
 request_id text not null unique,
 issued_at timestamptz not null default now()
);
create index if not exists zukait_stock_mech_jc_idx
  on public.zukait_stock_mechanical_issues(job_card,id desc);

create table if not exists public.zukait_stock_mechanical_lines (
 id bigint generated always as identity primary key,
 issue_id bigint not null references public.zukait_stock_mechanical_issues(id),
 material_id text not null,
 brand_id text not null,
 unit text not null check(unit in ('Liter','kg','Piece')),
 quantity numeric(18,4) not null check(quantity>0),
 locked_unit_cost numeric(20,8) not null check(locked_unit_cost>=0),
 locked_cost numeric(20,8) not null check(locked_cost>=0),
 returned_qty numeric(18,4) not null default 0 check(returned_qty>=0 and returned_qty<=quantity),
 return_credit numeric(20,8) not null default 0 check(return_credit>=0)
);
create index if not exists zukait_stock_mech_line_issue_idx
  on public.zukait_stock_mechanical_lines(issue_id,id);

alter table public.zukait_stock_mechanical_issues enable row level security;
alter table public.zukait_stock_mechanical_lines enable row level security;
revoke all on public.zukait_stock_mechanical_issues from public,anon,authenticated;
revoke all on public.zukait_stock_mechanical_lines from public,anon,authenticated;
grant select,insert,update,delete on public.zukait_stock_mechanical_issues to service_role;
grant select,insert,update,delete on public.zukait_stock_mechanical_lines to service_role;
grant usage,select on sequence public.zukait_stock_mechanical_issues_id_seq to service_role;
grant usage,select on sequence public.zukait_stock_mechanical_lines_id_seq to service_role;

create or replace function public.zukait_stock_mechanical_issue(
 p_session_hash text,p_request_id text,p_data jsonb
) returns jsonb
language plpgsql security invoker set search_path=''
as $mech$
declare
 v_actor text;
 v_role text;
 v_department text;
 v_jc text := upper(trim(coalesce(p_data->>'jobCard','')));
 v_kind text := coalesce(p_data->>'kind','issued');
 v_payload jsonb := p_data->'lines';
 v_fp text;
 v_receipt public.zukait_stock_request_receipts%rowtype;
 v_item public.zukait_stock_balances%rowtype;
 v_line record;
 v_issue_id bigint;
 v_qty numeric;
 v_price numeric;
 v_cost numeric;
 v_total numeric := 0;
 v_index int := 0;
 v_response jsonb;
begin
 if p_session_hash is null or p_session_hash='' then
   raise exception 'STOCK_FORBIDDEN' using errcode='42501';end if;
 if p_request_id is null or length(trim(p_request_id))<1 or length(p_request_id)>120
    or p_request_id !~ '^[a-zA-Z0-9_.:-]+$' then
    raise exception 'REQUEST_ID_REQUIRED' using errcode='22023';end if;
 if p_data is null or jsonb_typeof(p_data)<>'object' or octet_length(p_data::text)>2048
    then raise exception 'INVALID_STOCK_PAYLOAD' using errcode='22023';end if;
 if v_kind not in ('issued','additional') then
    raise exception 'INVALID_ISSUE_KIND' using errcode='22023';end if;
 if v_jc='' or length(v_jc)>36 or v_jc !~ '^[A-Z0-9_. -]+$' then
    raise exception 'INVALID_MECHANICAL_JOB' using errcode='22023';end if;
 if jsonb_typeof(v_payload) is distinct from 'array'
    or jsonb_array_length(v_payload) not between 1 and 20 then
    raise exception 'INVALID_ISSUE_LINES' using errcode='22023';end if;

 -- Re-read current staff session and department within this stock transaction.
 select sc.user_id,sc.role,sc.department into v_actor,v_role,v_department
 from public.staff_sessions ss
 join public.staff_credentials sc on ss.user_id=sc.user_id
 where ss.token_hash=p_session_hash and ss.revoked_at is null
   and sc.active=true and coalesce(sc.must_change,false)=false;
 if v_actor is null or v_role not in ('Manager','Mechanical Supervisor') then
    raise exception 'MECHANICAL_STOCK_FORBIDDEN' using errcode='42501';end if;
 -- No generic Bodyshop Supervisor can write Mechanical stock.

 -- One small authoritative Mechanical JC lookup; never load workshop_state.
 if not exists (
   select 1 from zukait_mechanical.checklists c where upper(c.job_card)=v_jc
 ) and not exists (
   select 1 from zukait_mechanical.intake_jobs c where upper(c.job_card)=v_jc
 ) then raise exception 'MECHANICAL_JOB_NOT_FOUND' using errcode='22023';end if;

 -- Same request can never write twice, even from two simultaneous phones.
 perform pg_catalog.pg_advisory_xact_lock(
   pg_catalog.hashtextextended('zukait-stock:'||p_request_id,0));
 v_fp := pg_catalog.md5('MECHANICAL_ISSUE:'||p_data::text);
 select * into v_receipt from public.zukait_stock_request_receipts
    where request_id=p_request_id;
 if found then
   if v_receipt.actor_id<>v_actor or v_receipt.action<>'MECHANICAL_ISSUE'
      or v_receipt.fingerprint<>v_fp then
      raise exception 'REQUEST_ID_CONFLICT' using errcode='23505';end if;
   return v_receipt.result;
 end if;

 -- Confirm unique (materialId,brandId) and valid numeric quantities BEFORE saving.
 if exists (
   select 1 from pg_catalog.jsonb_array_elements(v_payload) x
   where pg_catalog.jsonb_typeof(x)<>'object'
      or not (x ? 'materialId' and x ? 'brandId' and x ? 'quantity')
      or coalesce(x->>'quantity','') !~ '^[0-9]+([.][0-9]+)?$'
      or (x->>'quantity')::numeric<=0
      or pg_catalog.round((x->>'quantity')::numeric,4)<>(x->>'quantity')::numeric
      or coalesce(x->>'materialId','')=''
      or coalesce(x->>'brandId','')=''
 ) then raise exception 'INVALID_ISSUE_LINE' using errcode='22023';end if;
 if (select count(*) from pg_catalog.jsonb_array_elements(v_payload)) <>
    (select count(distinct x->>'materialId'||'|'||x->>'brandId')
      from pg_catalog.jsonb_array_elements(v_payload) x) then
   raise exception 'DUPLICATE_MATERIAL_BRAND' using errcode='22023';end if;

 -- Lock all selected balances in a deterministic order to avoid deadlocks.
 -- A competing purchase/issue/reservation for a brand sees updated stock.
 for v_line in
   select x->>'materialId' as material_id,
          x->>'brandId' as brand_id,
          (x->>'quantity')::numeric as qty
   from pg_catalog.jsonb_array_elements(v_payload) x
   order by 1,2
 loop
   select * into v_item from public.zukait_stock_balances
     where material_id=v_line.material_id and brand_id=v_line.brand_id
     for update;
   if not found then raise exception 'OPENING_STOCK_REQUIRED' using errcode='22023';end if;
   if not exists (select 1 from public.zukait_stock_material_keys m
      where m.material_id=v_line.material_id and m.active=true)
      or not exists (select 1 from public.zukait_stock_brand_keys b
      where b.brand_id=v_line.brand_id and b.active=true) then
      raise exception 'STOCK_MASTER_KEY_NOT_FOUND' using errcode='22023';end if;
   if v_item.unit='Piece' and trunc(v_line.qty)<>v_line.qty then
      raise exception 'PIECE_WHOLE_REQUIRED' using errcode='22023';end if;
   if v_line.qty>v_item.physical-v_item.reserved then
      raise exception 'INSUFFICIENT_STOCK' using errcode='23514';end if;
 end loop;

 insert into public.zukait_stock_mechanical_issues(job_card,issue_kind,actor_id,request_id)
   values(v_jc,v_kind,v_actor,p_request_id) returning id into v_issue_id;
 for v_line in
   select x->>'materialId' as material_id,
          x->>'brandId' as brand_id,
          (x->>'quantity')::numeric as qty
   from pg_catalog.jsonb_array_elements(v_payload) x
   order by 1,2
 loop
   select * into v_item from public.zukait_stock_balances
     where material_id=v_line.material_id and brand_id=v_line.brand_id for update;
   v_qty:=v_line.qty;
   v_price:=pg_catalog.round(v_item.stock_value/v_item.physical,8);
   v_cost:=pg_catalog.round(v_price*v_qty,8);
   update public.zukait_stock_balances set
      physical=physical-v_qty,
      stock_value=case when physical=v_qty then 0
           else greatest(0,stock_value-v_cost) end,
      updated_at=now()
     where material_id=v_line.material_id and brand_id=v_line.brand_id;
   insert into public.zukait_stock_mechanical_lines
      (issue_id,material_id,brand_id,unit,quantity,locked_unit_cost,locked_cost)
      values (v_issue_id,v_line.material_id,v_line.brand_id,v_item.unit,v_qty,v_price,v_cost);
   v_index:=v_index+1;
   insert into public.zukait_stock_movements
     (material_id,brand_id,action,physical_delta,reserved_delta,cost_delta,
      job_card,actor_id,request_id,note)
     values(v_line.material_id,v_line.brand_id,'MECHANICAL_ISSUE',-v_qty,0,-v_cost,
      v_jc,v_actor,'mech:'||pg_catalog.md5(p_request_id)||':'||v_index,'Final on issue');
   v_total:=v_total+v_cost;
 end loop;
 v_response:=pg_catalog.jsonb_build_object(
    'issueId',v_issue_id,'jobCard',v_jc,'lineCount',v_index,
    'totalCost',v_total,'final',true,'kind',v_kind);
 insert into public.zukait_stock_request_receipts
   (request_id,actor_id,action,fingerprint,result)
   values(p_request_id,v_actor,'MECHANICAL_ISSUE',v_fp,v_response);
 return v_response;
end
$mech$;
revoke all on function public.zukait_stock_mechanical_issue(text,text,jsonb)
  from public,anon,authenticated;
grant execute on function public.zukait_stock_mechanical_issue(text,text,jsonb)
  to service_role;
