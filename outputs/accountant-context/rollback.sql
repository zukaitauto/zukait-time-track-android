-- REVIEW PACKET ONLY. NOT EXECUTED. Target: pjknotnjkufadqavcmii.
-- Separate exact-source production approval required. No business data writes.
begin;
set local lock_timeout='3s';
set local statement_timeout='30s';
do $guard$
declare f record;
begin
 select p.*,r.rolname as owner_name into f from pg_proc p join pg_roles r on r.oid=p.proowner where p.oid='public.zukait_accountant_context(text)'::regprocedure;
 if md5(pg_get_functiondef(f.oid)) <> 'ecb40a1fbf2a4929416960a1bca31786' then raise exception 'Context definition changed: review exact live source before applying';end if;
 if f.owner_name <> 'postgres' or f.prosecdef or f.proconfig <> array['search_path=public'] then raise exception 'Unexpected context owner/invoker/search_path';end if;
 if has_function_privilege('anon',f.oid,'execute') or has_function_privilege('authenticated',f.oid,'execute') or not has_function_privilege('service_role',f.oid,'execute') then raise exception 'Unexpected context permissions';end if;
end $guard$;
-- Existing function only, for isolated comparisons and rollback review.
create or replace function public.zukait_accountant_context(p_actor_id text) returns jsonb language plpgsql security invoker set search_path=public as $$
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

do $guard$
declare f record;
begin
 select p.*,r.rolname as owner_name into f from pg_proc p join pg_roles r on r.oid=p.proowner where p.oid='public.zukait_accountant_context(text)'::regprocedure;
 if md5(pg_get_functiondef(f.oid)) <> '5cb0e04223f9f3e517ece00eb11fa8a3' then raise exception 'Context definition changed: review exact live source before applying';end if;
 if f.owner_name <> 'postgres' or f.prosecdef or f.proconfig <> array['search_path=public'] then raise exception 'Unexpected context owner/invoker/search_path';end if;
 if has_function_privilege('anon',f.oid,'execute') or has_function_privilege('authenticated',f.oid,'execute') or not has_function_privilege('service_role',f.oid,'execute') then raise exception 'Unexpected context permissions';end if;
end $guard$;
commit;
