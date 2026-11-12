-- NOT APPLIED TO PRODUCTION. Function-only candidate; unchanged invoker/owner/ACL.
create or replace function public.zukait_accountant_context(p_actor_id text) returns jsonb language plpgsql security invoker set search_path=public as $$
declare staff public.staff_credentials%rowtype;outcome jsonb;
begin
 select * into staff from public.staff_credentials where user_id=p_actor_id and active;
 if not found or staff.role not in ('Manager','Accountant') or staff.must_change then raise exception 'accountant_forbidden';end if;
 -- Order source tuples before constructing large JSON values. Each sorted
 -- subquery feeds its aggregate directly, without intervening joins/reordering.
 -- One statement supplies a consistent view of the snapshot, journal and source events.
 select jsonb_build_object('state',w.data,'revision',w.revision,
 'finance_revision',coalesce((select max(sequence_no) from public.workshop_accounting_entries),0),
 'entries',coalesce((select jsonb_agg(to_jsonb(e)) from (select * from public.workshop_accounting_entries order by sequence_no) e),'[]'::jsonb),
 'events',coalesce((select jsonb_agg(jsonb_build_object('event_id',e.event_id,'entity_id',e.entity_id,'event_type',e.event_type,'revision',e.revision,'server_time',e.server_time,'payload',e.payload)) from (select event_id,entity_id,event_type,revision,server_time,payload from public.workshop_v2_events where event_type like 'SPARE_PART_%' order by server_time,event_id) e),'[]'::jsonb)) into outcome from public.workshop_state w where w.id='main';
 if outcome is null then raise exception 'snapshot_unavailable';end if;return outcome;
end$$;
