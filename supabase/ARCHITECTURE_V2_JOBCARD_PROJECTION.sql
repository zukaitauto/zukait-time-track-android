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
commit;
