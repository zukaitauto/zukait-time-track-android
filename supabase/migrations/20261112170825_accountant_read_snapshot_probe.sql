-- Owner-approved inactive staging on pjknotnjkufadqavcmii.
-- Qualified source: 0c59b456bc09d7a3eebd76e40bdb003ff3f23495.
-- No business table writes or version-counter triggers. Primary PostgreSQL only.
begin;
set local lock_timeout='3s';
set local statement_timeout='15s';
do $preflight$
begin
 if to_regprocedure('public.zukait_accountant_read_snapshot(text)') is not null then raise exception 'accountant_probe_already_exists';end if;
 if md5(pg_get_functiondef('public.zukait_accountant_context(text)'::regprocedure)) <> '5cb0e04223f9f3e517ece00eb11fa8a3' then raise exception 'accountant_context_baseline_changed';end if;
end $preflight$;
create function public.zukait_accountant_read_snapshot(p_actor_id text)
returns jsonb language plpgsql stable security invoker set search_path=pg_catalog,public as $$
declare staff public.staff_credentials%rowtype;
begin
 select * into staff from public.staff_credentials where user_id=p_actor_id and active;
 if not found or staff.role not in ('Manager','Accountant') or staff.must_change then raise exception 'accountant_forbidden';end if;
 return jsonb_build_object('actor_id',staff.user_id,'role',staff.role,
 'database',(select oid::text from pg_database where datname=current_database()),
 'instance',extract(epoch from pg_postmaster_start_time())::text,
 'snapshot',pg_current_snapshot()::text);
end $$;
revoke all on function public.zukait_accountant_read_snapshot(text) from public,anon,authenticated;
grant execute on function public.zukait_accountant_read_snapshot(text) to service_role;
do $verify$
declare f record;
begin
 select p.*,r.rolname as owner_name into f from pg_proc p join pg_roles r on r.oid=p.proowner where p.oid='public.zukait_accountant_read_snapshot(text)'::regprocedure;
 if f.owner_name <> 'postgres' or f.prosecdef or f.provolatile <> 's' then raise exception 'accountant_probe_security_mismatch';end if;
 if has_function_privilege('anon',f.oid,'execute') or has_function_privilege('authenticated',f.oid,'execute') or not has_function_privilege('service_role',f.oid,'execute') then raise exception 'accountant_probe_permission_mismatch';end if;
end $verify$;
commit;
