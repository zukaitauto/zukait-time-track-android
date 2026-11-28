\set ON_ERROR_STOP on
-- Disposable CI database only. Minimal staff schema matches verified QA column types.
create role anon nologin;
create role authenticated nologin;
create role service_role nologin bypassrls;
create table public.staff_credentials(user_id text primary key,role text not null,active boolean not null,must_change boolean not null);
create table public.staff_sessions(token_hash text primary key,user_id text not null references public.staff_credentials(user_id),revoked_at timestamptz);
grant usage on schema public to service_role,anon,authenticated;
grant select,update on public.staff_credentials,public.staff_sessions to service_role;
insert into public.staff_credentials values('manager','Manager',true,false),('employee','Employee',true,false),('locked','Manager',true,true),('inactive','Manager',false,false),('manager2','Manager',true,false);
insert into public.staff_sessions values(repeat('a',64),'manager',null),(repeat('b',64),'employee',null),(repeat('c',64),'locked',null),(repeat('d',64),'inactive',null),(repeat('e',64),'manager2',now()),(repeat('f',64),'manager2',null);
\ir ../docs/vehicle-index-storage-review.sql
do $$
begin
 if has_function_privilege('anon','public.zukait_vehicle_index_approve(text,text,bigint,text,text,text,text,text)','EXECUTE')
 or has_function_privilege('authenticated','public.zukait_vehicle_index_approve(text,text,bigint,text,text,text,text,text)','EXECUTE')
 or has_table_privilege('authenticated','public.zukait_vehicle_index_entries','INSERT')
 or has_table_privilege('anon','public.zukait_vehicle_index_audit','SELECT')
 or has_table_privilege('service_role','public.zukait_vehicle_index_audit','UPDATE')
 or has_table_privilege('service_role','public.zukait_vehicle_index_audit','DELETE') then raise exception 'unexpected grant';end if;
 if exists(select 1 from pg_class where relname in ('zukait_vehicle_index_meta','zukait_vehicle_index_entries','zukait_vehicle_index_audit') and not relrowsecurity) then raise exception 'RLS absent';end if;
end $$;
set role service_role;
do $$
declare r jsonb;
begin
 r:=public.zukait_vehicle_index_approve(repeat('a',64),'uninitialized',1,'ADD_MAKE','Toyota',null,null,'Missing make');
 if r->>'code' is distinct from 'catalogue_not_initialized' then raise exception 'uninitialized: %',r;end if;
end $$;
reset role;
insert into public.zukait_vehicle_index_meta(id,version) values(true,1);
insert into public.zukait_vehicle_index_entries(id,kind,name,scope,name_key) values('make:nissan','ADD_MAKE','Nissan','@makes','nissan'),('make:toyota','ADD_MAKE','Toyota','@makes','toyota');
insert into public.zukait_vehicle_index_entries(id,kind,name,scope,name_key,make_id) values('model:patrol','ADD_MODEL','Patrol','make:nissan','patrol'),('model:corolla','ADD_MODEL','Corolla','make:toyota','corolla');
set role service_role;
do $$
declare r jsonb; prior jsonb; token text; expected text;
begin
 for token,expected in select * from (values (repeat('b',64),'manager_required'),(repeat('c',64),'invalid_session'),(repeat('d',64),'invalid_session'),(repeat('e',64),'invalid_session'),(repeat('0',64),'invalid_session')) as t(token,expected) loop
  r:=public.zukait_vehicle_index_approve(token,'unauthorized',1,'ADD_MAKE','Lexus',null,null,'Missing make');
  if r->>'code' is distinct from expected then raise exception 'access guard: % expected %',r,expected;end if;
 end loop;
 r:=public.zukait_vehicle_index_approve(repeat('a',64),'wrong-model',1,'MODEL_ALIAS','Petrol','make:toyota','model:patrol','Correct spelling');
 if r->>'code' is distinct from 'unknown_target' then raise exception 'cross-brand guard: %',r;end if;
 r:=public.zukait_vehicle_index_approve(repeat('a',64),'duplicate',1,'ADD_MAKE','ＮＩＳＳＡＮ',null,null,'Duplicate name');
 if r->>'code' is distinct from 'name_exists' then raise exception 'NFKC collision: %',r;end if;
 prior:=public.zukait_vehicle_index_approve(repeat('a',64),'alias-1',1,'MODEL_ALIAS','Petrol','make:nissan','model:patrol','Correct spelling');
 if prior->>'ok' is distinct from 'true' or prior->>'version' is distinct from '2' then raise exception 'approval: %',prior;end if;
 r:=public.zukait_vehicle_index_approve(repeat('a',64),'alias-1',1,'MODEL_ALIAS','Petrol','make:nissan','model:patrol','Correct spelling');
 if r is distinct from prior then raise exception 'retry differs: %',r;end if;
 r:=public.zukait_vehicle_index_approve(repeat('f',64),'alias-1',1,'MODEL_ALIAS','Petrol','make:nissan','model:patrol','Correct spelling');
 if r->>'code' is distinct from 'request_id_conflict' then raise exception 'actor replay: %',r;end if;
 r:=public.zukait_vehicle_index_approve(repeat('a',64),'stale',1,'ADD_MAKE','Lexus',null,null,'Missing make');
 if r->>'code' is distinct from 'catalogue_changed' then raise exception 'stale version: %',r;end if;
 r:=public.zukait_vehicle_index_approve(repeat('a',64),'alias-collision',2,'ADD_MODEL','PETROL','make:nissan',null,'Collision test');
 if r->>'code' is distinct from 'name_exists' then raise exception 'alias collision: %',r;end if;
 r:=public.zukait_vehicle_index_approve(repeat('a',64),'new-brand',2,'ADD_MAKE','Lexus',null,null,'Missing make');
 if r->>'version' is distinct from '3' then raise exception 'new make: %',r;end if;
 if (select count(*) from public.zukait_vehicle_index_audit)<>2 or (select version from public.zukait_vehicle_index_meta)<>3 then raise exception 'audit or revision mismatch';end if;
end $$;
reset role;
update public.staff_sessions set revoked_at=now() where token_hash=repeat('a',64);
set role service_role;
do $$
declare r jsonb;
begin
 r:=public.zukait_vehicle_index_approve(repeat('a',64),'alias-1',1,'MODEL_ALIAS','Petrol','make:nissan','model:patrol','Correct spelling');
 if r->>'code' is distinct from 'invalid_session' then raise exception 'revoked retry: %',r;end if;
end $$;
reset role;
select 'vehicle catalogue SQL authorization, NFKC collision, scope, version, idempotency, audit and revocation tests passed' as result;
