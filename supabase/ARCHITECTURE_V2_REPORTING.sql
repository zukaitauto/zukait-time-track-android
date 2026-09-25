-- Architecture V2 bounded reporting read model.
-- Repository migration only; do not apply to production before controlled V2 backend rollout.
begin;
create or replace function public.zukait_v2_report_page(p_report text,p_before timestamptz default null,p_limit integer default 100,p_filters jsonb default '{}'::jsonb,p_before_id text default null)
returns table(event_id text,entity_id text,event_type text,actor_id text,sort_time timestamptz,revision bigint,payload jsonb)
language sql stable security invoker set search_path=public as $$
 with q as (select upper(coalesce(p_report,'')) report, nullif(trim(coalesce(p_filters->>'query','')),'') query),
 mapped as (
 select e.* from public.workshop_v2_events e,q
 where (p_before is null or e.server_time<p_before or (e.server_time=p_before and p_before_id is not null and e.event_id<p_before_id)) and (
  q.report='AUDIT' or
  (q.report='REPEAT' and e.event_type like 'REPEAT%') or
  (q.report='ID001' and e.event_type like 'ID001%') or
  (q.report='OVERTIME' and e.event_type like 'OVERTIME%') or
  (q.report='PARTS_DELAY' and (e.event_type like 'SPARE_PART%' or e.event_type='PARTS_DELAY')) or
  (q.report='CONSUMABLES_VARIANCE' and e.event_type like 'CONSUMABLE%') or
  (q.report='JOB_COST' and (e.event_type like 'JOB%' or e.event_type like 'WORK%')) or
  (q.report in ('WIP','CYCLE_TIME','EFFICIENCY','COMPLETION_TARGET') and e.event_type like 'JOB%') or
  (q.report='JOB_SEARCH' and q.query is not null and (e.entity_id ilike '%'||q.query||'%' or coalesce(e.payload->>'jobCard','') ilike '%'||q.query||'%' or coalesce(e.payload->>'registration','') ilike '%'||q.query||'%'))
 ))
 select e.event_id,e.entity_id,e.event_type,e.actor_id,e.server_time,e.revision,e.payload from mapped e order by e.server_time desc, e.event_id desc limit greatest(1,least(coalesce(p_limit,100),500));
$$;
revoke all on function public.zukait_v2_report_page(text,timestamptz,integer,jsonb,text) from public,anon,authenticated;
grant execute on function public.zukait_v2_report_page(text,timestamptz,integer,jsonb) to service_role;
commit;
