-- ISOLATED QUALIFICATION DRAFT ONLY. Not deployed; requires exact-source approval.
-- No business table writes or version-counter triggers. Primary PostgreSQL only.
begin;
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
commit;
