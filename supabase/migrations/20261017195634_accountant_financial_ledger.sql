-- QA/isolated development only until the coordinated production release is approved.
begin;
alter table public.staff_credentials drop constraint if exists staff_credentials_role_check;
alter table public.staff_credentials add constraint staff_credentials_role_check check(role in ('Employee','Supervisor','Manager','Purchaser','Receptionist','Accountant'));
alter table public.staff_credentials add column if not exists login_id text;
create unique index if not exists staff_login_id_unique on public.staff_credentials(upper(login_id)) where login_id is not null;
alter table public.staff_credentials add constraint staff_login_format check(login_id is null or login_id ~ '^[A-Z0-9_-]{1,40}$');

-- One login namespace across immutable IDs and renamed Accountant login aliases.
create function public.zukait_staff_login_unique() returns trigger language plpgsql security invoker set search_path=public as $$begin
 perform pg_advisory_xact_lock(hashtext('zukait_staff_login_namespace'));
 if tg_op='UPDATE' and old.role='Accountant' and new.user_id<>old.user_id then raise exception 'accountant_identity_immutable';end if;
 if exists(select 1 from public.staff_credentials c where c.user_id<>new.user_id and (upper(c.user_id)=upper(new.login_id) or upper(c.login_id)=upper(new.user_id) or (new.login_id is not null and upper(c.login_id)=upper(new.login_id)))) then raise exception 'login_id_exists';end if;return new;
end$$;
create trigger staff_login_namespace before insert or update of user_id,login_id on public.staff_credentials for each row execute function public.zukait_staff_login_unique();
revoke all on function public.zukait_staff_login_unique() from public,anon,authenticated;grant execute on function public.zukait_staff_login_unique() to service_role;

create table public.workshop_accountant_commands(request_id uuid primary key,actor_id text not null,fingerprint text not null,result jsonb not null,created_at timestamptz not null default now());
create table public.workshop_accountant_account_audit(id bigint generated always as identity primary key,request_id uuid not null unique,actor_id text not null,target_id text not null,operation text not null,old_value jsonb,new_value jsonb,reason text not null,created_at timestamptz not null default now());
create table public.workshop_accounting_entries(
 id uuid primary key,sequence_no bigint generated always as identity unique,request_id uuid not null,actor_id text not null,
 kind text not null check(kind in ('CASH_IN','CASH_OUT','REVERSAL','COST_ADJUSTMENT')),
 job_card text,transaction_date date not null,amount numeric(18,3),payment_method text,payee text,category text,reference text,remarks text,
 reverses_id uuid unique references public.workshop_accounting_entries(id),replaces_id uuid references public.workshop_accounting_entries(id),
 old_value numeric(18,3),new_value numeric(18,3),record_id text,reason text not null,created_at timestamptz not null default now(),
 check((kind in ('CASH_IN','CASH_OUT') and amount>0 and payment_method in ('CASH','CARD','BANK','CHEQUE')) or (kind='REVERSAL' and reverses_id is not null) or (kind='COST_ADJUSTMENT' and old_value>=0 and new_value>=0 and category in ('consumables','paint','parts','labour')))
);
create index accounting_entries_job on public.workshop_accounting_entries(job_card,sequence_no);
create index accounting_entries_month on public.workshop_accounting_entries(transaction_date,kind);
create index accountant_audit_target on public.workshop_accountant_account_audit(target_id,id);
alter table public.workshop_accountant_commands enable row level security;
alter table public.workshop_accountant_account_audit enable row level security;
alter table public.workshop_accounting_entries enable row level security;
revoke all on public.workshop_accountant_commands,public.workshop_accountant_account_audit,public.workshop_accounting_entries from public,anon,authenticated;
grant select,insert on public.workshop_accountant_commands,public.workshop_accountant_account_audit,public.workshop_accounting_entries to service_role;
grant usage,select on sequence public.workshop_accountant_account_audit_id_seq,public.workshop_accounting_entries_sequence_no_seq to service_role;

create function public.zukait_accountant_immutable() returns trigger language plpgsql set search_path=public as $$begin raise exception 'accountant_append_only';end$$;
create trigger accounting_no_mutation before update or delete on public.workshop_accounting_entries for each row execute function public.zukait_accountant_immutable();
create trigger accountant_audit_no_mutation before update or delete on public.workshop_accountant_account_audit for each row execute function public.zukait_accountant_immutable();
create trigger accountant_receipt_no_mutation before update or delete on public.workshop_accountant_commands for each row execute function public.zukait_accountant_immutable();

create function public.zukait_accountant_context(p_actor_id text) returns jsonb language plpgsql security invoker set search_path=public as $$
declare staff public.staff_credentials%rowtype;outcome jsonb;
begin
 select * into staff from public.staff_credentials where user_id=p_actor_id and active;
 if not found or staff.role not in ('Manager','Accountant') or staff.must_change then raise exception 'accountant_forbidden';end if;
 -- One statement supplies a consistent view of the snapshot, journal and source events.
 select jsonb_build_object('state',w.data,'revision',w.revision,
 'finance_revision',coalesce((select max(sequence_no) from public.workshop_accounting_entries),0),
 'entries',coalesce((select jsonb_agg(to_jsonb(e) order by sequence_no) from public.workshop_accounting_entries e),'[]'::jsonb),
 'events',coalesce((select jsonb_agg(jsonb_build_object('event_id',e.event_id,'entity_id',e.entity_id,'event_type',e.event_type,'revision',e.revision,'server_time',e.server_time,'payload',e.payload) order by e.server_time,e.event_id) from public.workshop_v2_events e where e.event_type like 'SPARE_PART_%'),'[]'::jsonb)) into outcome from public.workshop_state w where w.id='main';
 if outcome is null then raise exception 'snapshot_unavailable';end if;return outcome;
end$$;

create function public.zukait_accountant_post(p_actor_id text,p_request_id uuid,p_fingerprint text,p_command jsonb) returns jsonb language plpgsql security invoker set search_path=public as $$
declare staff public.staff_credentials%rowtype;receipt public.workshop_accountant_commands%rowtype;source public.workshop_accounting_entries%rowtype; snap public.workshop_state%rowtype;
 op text:=p_command->>'operation';entry_id uuid:=p_request_id;result jsonb;finance_rev bigint;cmd_job text:=nullif(upper(trim(p_command->>'job_card')),'');amt numeric;old_n numeric;new_n numeric;txdate date;
begin
 perform pg_advisory_xact_lock(hashtext('zukait_accountant_journal'));
 select * into staff from public.staff_credentials where user_id=p_actor_id and active for share;
 if not found or staff.role not in ('Manager','Accountant') or staff.must_change then raise exception 'accountant_forbidden';end if;
 select * into receipt from public.workshop_accountant_commands where request_id=p_request_id;
 if found then if receipt.actor_id<>p_actor_id or receipt.fingerprint<>p_fingerprint then raise exception 'request_conflict';end if;return receipt.result;end if;
 if op not in ('POST','CORRECT','REVERSE','ADJUST_COST','CORRECT_INVOICE') or length(trim(coalesce(p_command->>'reason','')))<3 or length(p_command->>'reason')>2000 then raise exception 'invalid_financial_command';end if;
 select * into snap from public.workshop_state where id='main' for update;
 select coalesce(max(sequence_no),0) into finance_rev from public.workshop_accounting_entries;
 if (p_command->>'expected_finance_revision') is null or (p_command->>'expected_finance_revision')::bigint<>finance_rev or (p_command->>'expected_snapshot_revision') is null or (p_command->>'expected_snapshot_revision')::bigint<>snap.revision then raise exception 'financial_conflict';end if;
 if cmd_job is not null and (cmd_job='ID001' or not exists(select 1 from jsonb_array_elements(coalesce(snap.data->'jobs','[]')) j where upper(j->>'no')=cmd_job and coalesce(j->>'deleted','false')<>'true')) then raise exception 'job_not_found';end if;
 txdate:=(p_command->>'transaction_date')::date;
 if txdate is null or txdate<date '1900-01-01' or txdate>(now() at time zone 'Asia/Muscat')::date then raise exception 'invalid_transaction_date';end if;
 if op in ('CORRECT','REVERSE') then
  select * into source from public.workshop_accounting_entries where id=(p_command->>'entry_id')::uuid for update;
  if not found or source.kind not in ('CASH_IN','CASH_OUT') or exists(select 1 from public.workshop_accounting_entries where reverses_id=source.id) then raise exception 'entry_not_correctable';end if;
  insert into public.workshop_accounting_entries(id,request_id,actor_id,kind,job_card,transaction_date,reverses_id,old_value,new_value,reason,record_id)
  values(gen_random_uuid(),p_request_id,p_actor_id,'REVERSAL',source.job_card,txdate,source.id,source.amount,0,p_command->>'reason',source.id::text);
 end if;
 if op in ('POST','CORRECT') then
  amt:=(p_command->>'amount')::numeric;
  if amt is null or amt<=0 or amt>1000000 or round(amt,3)<>amt or p_command->>'kind' not in ('CASH_IN','CASH_OUT') or p_command->>'payment_method' not in ('CASH','CARD','BANK','CHEQUE') or length(trim(coalesce(p_command->>'payee','')))=0 or length(coalesce(p_command->>'payee',''))>200 or length(coalesce(p_command->>'reference',''))>200 or length(coalesce(p_command->>'remarks',''))>2000 or length(coalesce(p_command->>'category',''))>100 then raise exception 'invalid_cash_entry';end if;
  if op='CORRECT' and p_command->>'kind'<>source.kind then raise exception 'cash_direction_change_forbidden';end if;
  if p_command->>'kind'='CASH_OUT' and length(trim(coalesce(p_command->>'category','')))=0 then raise exception 'expense_category_required';end if;
  if nullif(trim(p_command->>'reference'),'') is not null and exists(select 1 from public.workshop_accounting_entries e where e.kind=p_command->>'kind' and e.payment_method=p_command->>'payment_method' and lower(e.reference)=lower(trim(p_command->>'reference')) and e.id<>coalesce(source.id,'00000000-0000-0000-0000-000000000000'::uuid) and not exists(select 1 from public.workshop_accounting_entries r where r.reverses_id=e.id)) then raise exception 'duplicate_payment_reference';end if;
  insert into public.workshop_accounting_entries(id,request_id,actor_id,kind,job_card,transaction_date,amount,payment_method,payee,category,reference,remarks,replaces_id,old_value,new_value,reason)
  values(entry_id,p_request_id,p_actor_id,p_command->>'kind',cmd_job,txdate,amt,p_command->>'payment_method',trim(p_command->>'payee'),p_command->>'category',nullif(trim(p_command->>'reference'),''),p_command->>'remarks',source.id,source.amount,amt,p_command->>'reason');
 elsif op='ADJUST_COST' then
  old_n:=(p_command->>'old_value')::numeric;new_n:=(p_command->>'new_value')::numeric;
  if cmd_job is null or p_command->>'category' not in ('consumables','paint','parts','labour') or old_n is null or new_n is null or old_n<0 or new_n<0 or new_n>1000000 or round(old_n,3)<>old_n or round(new_n,3)<>new_n then raise exception 'invalid_cost_adjustment';end if;
  insert into public.workshop_accounting_entries(id,request_id,actor_id,kind,job_card,transaction_date,category,old_value,new_value,record_id,reason) values(entry_id,p_request_id,p_actor_id,'COST_ADJUSTMENT',cmd_job,txdate,p_command->>'category',old_n,new_n,cmd_job||':'||(p_command->>'category'),p_command->>'reason');
 elsif op='CORRECT_INVOICE' then
  if cmd_job is null then raise exception 'job_required';end if;new_n:=(p_command->>'new_value')::numeric;
  if new_n is null or new_n<0 or new_n>1000000 or round(new_n,3)<>new_n then raise exception 'invalid_invoice_amount';end if;
  -- Accountant is allowed only this financial mutation, never QC, delivery or work edits.
  declare j jsonb;idx integer;audit jsonb;begin
   select value,ordinality::integer-1 into j,idx from jsonb_array_elements(snap.data->'jobs') with ordinality where upper(value->>'no')=cmd_job;
   if j->>'finalInvoiceAmount' is null or nullif(j->>'invoiceDate','') is null then raise exception 'verified_invoice_required';end if;
   old_n:=(j->>'finalInvoiceAmount')::numeric;
   if old_n<>(p_command->>'old_value')::numeric then raise exception 'financial_conflict';end if;
   audit:=jsonb_build_object('operation','ACCOUNTANT_INVOICE_CORRECTION','by',p_actor_id,'name',staff.display_name,'at',floor(extract(epoch from now())*1000),'from',old_n,'to',new_n,'reason',p_command->>'reason','request_id',p_request_id);
   j:=j||jsonb_build_object('finalInvoiceAmount',new_n,'amount',new_n,'financialAudit',coalesce(j->'financialAudit','[]')||jsonb_build_array(audit),'qcWorkflow',coalesce(j->'qcWorkflow','{}')||jsonb_build_object('revision',coalesce((j#>>'{qcWorkflow,revision}')::integer,0)+1));
   -- Keep existing invoice-linked insurance LPO amount authoritative; this is not a cash receipt.
   if upper(j->>'jobType')='INSURANCE' and j->'insuranceLpo' is not null and j->'insuranceLpo'<>'null'::jsonb then
    j:=jsonb_set(j,'{insuranceLpo}',(j->'insuranceLpo')||jsonb_build_object('amount',new_n,'revision',coalesce((j#>>'{insuranceLpo,revision}')::integer,0)+1,'history',coalesce(j#>'{insuranceLpo,history}','[]')||jsonb_build_array(audit)));
   end if;
   update public.workshop_state set data=jsonb_set(snap.data,array['jobs',idx::text],j),revision=revision+1,updated_at=now(),updated_by=p_actor_id where id='main';
  end;
 end if;
 select jsonb_build_object('ok',true,'request_id',p_request_id,'entry_id',case when op in ('POST','CORRECT','ADJUST_COST') then entry_id else null end,'finance_revision',coalesce((select max(sequence_no) from public.workshop_accounting_entries),0),'snapshot_revision',(select revision from public.workshop_state where id='main')) into result;
 insert into public.workshop_accountant_commands values(p_request_id,p_actor_id,p_fingerprint,result,now());return result;
end$$;

create function public.zukait_manager_accountants(p_actor_id text,p_request_id uuid,p_fingerprint text,p_command jsonb) returns jsonb language plpgsql security invoker set search_path=public as $$
declare actor public.staff_credentials%rowtype;target public.staff_credentials%rowtype;receipt public.workshop_accountant_commands%rowtype;op text:=p_command->>'operation';id text:=p_command->>'target_id';login text:=upper(trim(p_command->>'login_id'));old_public jsonb;new_public jsonb;result jsonb;
begin
 perform pg_advisory_xact_lock(hashtext('zukait_accountant_accounts'));
 select * into actor from public.staff_credentials where user_id=p_actor_id and active for share;
 if not found or actor.role<>'Manager' or actor.must_change then raise exception 'manager_required';end if;
 if op='LIST' then return jsonb_build_object('ok',true,'accounts',coalesce((select jsonb_agg(jsonb_build_object('id',user_id,'login_id',coalesce(login_id,user_id),'name',display_name,'active',active,'must_change',must_change,'updated_at',updated_at) order by user_id) from public.staff_credentials where role='Accountant'),'[]'),'audit',coalesce((select jsonb_agg(to_jsonb(a) order by a.id desc) from (select aa.* from public.workshop_accountant_account_audit aa order by aa.id desc limit 200 offset least(1000000,greatest(0,coalesce((p_command->>'audit_offset')::integer,0)))) a),'[]'));end if;
 if op not in ('CREATE','RESET','RENAME','ACTIVE') or length(trim(coalesce(p_command->>'reason','')))<3 then raise exception 'invalid_account_command';end if;
 select * into receipt from public.workshop_accountant_commands where request_id=p_request_id;
 if found then if receipt.actor_id<>p_actor_id or receipt.fingerprint<>p_fingerprint then raise exception 'request_conflict';end if;return receipt.result;end if;
 if id is null or id!~'^[A-Z0-9_-]{1,40}$' then raise exception 'invalid_login_id';end if;
 select * into target from public.staff_credentials where user_id=id for update;
 if op='CREATE' then
  if found then raise exception 'login_id_exists';end if;
  if login is null then login:=id;end if;
 else
  if not found or target.role<>'Accountant' then raise exception 'accountant_not_found';end if;
  old_public:=jsonb_build_object('login_id',coalesce(target.login_id,target.user_id),'active',target.active,'must_change',target.must_change);
 end if;
 if op in ('CREATE','RENAME') then
  if login is null or login!~'^[A-Z0-9_-]{1,40}$' then raise exception 'invalid_login_id';end if;
  if exists(select 1 from public.staff_credentials c where (upper(c.user_id)=login or upper(c.login_id)=login) and (op='CREATE' or c.user_id<>id)) then raise exception 'login_id_exists';end if;
 end if;
 if op in ('CREATE','RESET') and (nullif(p_command->>'password_hash','') is null or nullif(p_command->>'password_salt','') is null or (p_command->>'password_iterations')::integer<210000) then raise exception 'invalid_password_fields';end if;
 if op='CREATE' then
  insert into public.staff_credentials(user_id,login_id,display_name,role,department,password_hash,password_salt,password_iterations,active,must_change,failed_attempts) values(id,login,p_command->>'name','Accountant','Accounts',p_command->>'password_hash',p_command->>'password_salt',(p_command->>'password_iterations')::integer,true,true,0);
 elsif op='RESET' then
  update public.staff_credentials set password_hash=p_command->>'password_hash',password_salt=p_command->>'password_salt',password_iterations=(p_command->>'password_iterations')::integer,must_change=true,failed_attempts=0,locked_until=null,updated_at=now() where user_id=id;
 elsif op='RENAME' then
  update public.staff_credentials set login_id=login,updated_at=now() where user_id=id;
 elsif op='ACTIVE' then
  if jsonb_typeof(p_command->'active') is distinct from 'boolean' then raise exception 'invalid_active_flag';end if;
  update public.staff_credentials set active=(p_command->>'active')::boolean,updated_at=now() where user_id=id;
 end if;
 update public.staff_sessions set revoked_at=now() where user_id=id and revoked_at is null;
 select jsonb_build_object('login_id',coalesce(login_id,user_id),'active',active,'must_change',must_change) into new_public from public.staff_credentials where user_id=id;
 insert into public.workshop_accountant_account_audit(request_id,actor_id,target_id,operation,old_value,new_value,reason) values(p_request_id,p_actor_id,id,op,old_public,new_public,p_command->>'reason');
 result:=jsonb_build_object('ok',true,'id',id,'account',new_public);insert into public.workshop_accountant_commands values(p_request_id,p_actor_id,p_fingerprint,result,now());return result;
end$$;
revoke all on function public.zukait_accountant_immutable(),public.zukait_accountant_context(text),public.zukait_accountant_post(text,uuid,text,jsonb),public.zukait_manager_accountants(text,uuid,text,jsonb) from public,anon,authenticated;
grant execute on function public.zukait_accountant_immutable(),public.zukait_accountant_context(text),public.zukait_accountant_post(text,uuid,text,jsonb),public.zukait_manager_accountants(text,uuid,text,jsonb) to service_role;
commit;
