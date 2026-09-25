-- Architecture V2 canonical Job Card projection.
-- Repository migration only; do not apply to production before controlled V2 backend rollout.
begin;
create table if not exists public.workshop_v2_jobcards (
 job_card text primary key,
 registration text not null default '',
 vehicle_make text not null default '',
 vehicle_model text not null default '',
 vehicle_year integer,
 workflow_stage text not null default 'CREATED',
 status text not null default 'OPEN',
 created_at timestamptz not null default now(),
 updated_at timestamptz not null default now(),
 completed_at timestamptz,
 revision bigint not null default 0,
 last_event_id text
);
create index if not exists workshop_v2_jobcards_updated_idx on public.workshop_v2_jobcards(updated_at desc);
create index if not exists workshop_v2_jobcards_registration_idx on public.workshop_v2_jobcards(registration);
create index if not exists workshop_v2_jobcards_status_idx on public.workshop_v2_jobcards(status,updated_at desc);
alter table public.workshop_v2_jobcards enable row level security;
revoke all on public.workshop_v2_jobcards from public,anon,authenticated;
grant select,insert,update on public.workshop_v2_jobcards to service_role;

create or replace function public.zukait_v2_jobcard_page(p_query text default null,p_before timestamptz default null,p_limit integer default 100,p_status text default null)
returns table(job_card text,registration text,vehicle_make text,vehicle_model text,vehicle_year integer,workflow_stage text,status text,created_at timestamptz,updated_at timestamptz,completed_at timestamptz,revision bigint)
language sql stable security invoker set search_path=public as $$
 select j.job_card,j.registration,j.vehicle_make,j.vehicle_model,j.vehicle_year,j.workflow_stage,j.status,j.created_at,j.updated_at,j.completed_at,j.revision
 from public.workshop_v2_jobcards j
 where (p_before is null or j.updated_at<p_before)
 and (nullif(trim(coalesce(p_status,'')),'') is null or j.status=upper(trim(p_status)))
 and (nullif(trim(coalesce(p_query,'')),'') is null or j.job_card ilike '%'||trim(p_query)||'%' or j.registration ilike '%'||trim(p_query)||'%')
 order by j.updated_at desc limit greatest(1,least(coalesce(p_limit,100),500));
$$;
revoke all on function public.zukait_v2_jobcard_page(text,timestamptz,integer,text) from public,anon,authenticated;
grant execute on function public.zukait_v2_jobcard_page(text,timestamptz,integer,text) to service_role;
create or replace function public.zukait_v2_wip_page(p_before timestamptz default null,p_limit integer default 100,p_stage text default null,p_risk text default null)
returns table(job_card text,registration text,vehicle_make text,vehicle_model text,workflow_stage text,status text,created_at timestamptz,updated_at timestamptz,age_days integer,risk text)
language sql stable security invoker set search_path=public as $$
 select j.job_card,j.registration,j.vehicle_make,j.vehicle_model,j.workflow_stage,j.status,j.created_at,j.updated_at,
        greatest(0,floor(extract(epoch from (now()-j.created_at))/86400)::integer) age_days,
        case when now()-j.created_at>=interval '30 days' then 'OVERDUE'
             when now()-j.created_at>=interval '25 days' then 'WARNING' else 'NORMAL' end risk
 from public.workshop_v2_jobcards j
 where j.completed_at is null and j.status not in ('DELIVERED','CLOSED','CANCELLED')
   and (p_before is null or j.updated_at<p_before)
   and (nullif(trim(coalesce(p_stage,'')),'') is null or j.workflow_stage=upper(trim(p_stage)))
   and (nullif(trim(coalesce(p_risk,'')),'') is null or
        upper(trim(p_risk))=case when now()-j.created_at>=interval '30 days' then 'OVERDUE' when now()-j.created_at>=interval '25 days' then 'WARNING' else 'NORMAL' end)
 order by j.updated_at desc limit greatest(1,least(coalesce(p_limit,100),500));
$$;
revoke all on function public.zukait_v2_wip_page(timestamptz,integer,text,text) from public,anon,authenticated;
grant execute on function public.zukait_v2_wip_page(timestamptz,integer,text,text) to service_role;

create or replace function public.zukait_v2_upsert_jobcard(
 p_job_card text,p_registration text default '',p_vehicle_make text default '',p_vehicle_model text default '',p_vehicle_year integer default null,
 p_workflow_stage text default 'CREATED',p_status text default 'OPEN',p_revision bigint default 0,p_event_id text default null,p_completed_at timestamptz default null
)
returns public.workshop_v2_jobcards
language plpgsql security invoker set search_path=public as $$
declare outrow public.workshop_v2_jobcards;
begin
 if nullif(trim(coalesce(p_job_card,'')),'') is null then raise exception 'job_card_required'; end if;
 insert into public.workshop_v2_jobcards(job_card,registration,vehicle_make,vehicle_model,vehicle_year,workflow_stage,status,revision,last_event_id,completed_at)
 values(trim(p_job_card),coalesce(p_registration,''),coalesce(p_vehicle_make,''),coalesce(p_vehicle_model,''),p_vehicle_year,upper(coalesce(p_workflow_stage,'CREATED')),upper(coalesce(p_status,'OPEN')),greatest(coalesce(p_revision,0),0),p_event_id,p_completed_at)
 on conflict(job_card) do update set
  registration=excluded.registration,vehicle_make=excluded.vehicle_make,vehicle_model=excluded.vehicle_model,vehicle_year=excluded.vehicle_year,
  workflow_stage=excluded.workflow_stage,status=excluded.status,updated_at=now(),completed_at=excluded.completed_at,revision=excluded.revision,last_event_id=excluded.last_event_id
 where excluded.revision>workshop_v2_jobcards.revision
    and (excluded.last_event_id is null or workshop_v2_jobcards.last_event_id is distinct from excluded.last_event_id)
 returning * into outrow;
 if outrow.job_card is null then
   select * into outrow from public.workshop_v2_jobcards where job_card=trim(p_job_card);
   if outrow.last_event_id is distinct from p_event_id and coalesce(p_revision,0)<=outrow.revision then
     raise exception 'stale_jobcard_revision';
   end if;
 end if;
 return outrow;
end;$$;
revoke all on function public.zukait_v2_upsert_jobcard(text,text,text,text,integer,text,text,bigint,text,timestamptz) from public,anon,authenticated;
grant execute on function public.zukait_v2_upsert_jobcard(text,text,text,text,integer,text,text,bigint,text,timestamptz) to service_role;

commit;
