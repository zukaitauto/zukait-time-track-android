begin;
-- Pending Phase 2: depends on all six preceding pending migrations.
create table public.workshop_reception_job_cancellations(
 rc_no text primary key references public.workshop_receptions(rc_no),job_card text not null unique,
 cancellation_date date not null,reason text not null check(length(trim(reason)) between 1 and 2000),
 actor_id text not null references public.staff_credentials(user_id),actor_name text not null,
 identity_snapshot jsonb not null,job_snapshot jsonb not null,review_snapshot jsonb not null,
 recorded_at timestamptz not null default now(),request_id uuid not null unique
);
alter table public.workshop_reception_job_cancellations enable row level security;
revoke all on public.workshop_reception_job_cancellations from public,anon,authenticated,service_role;
grant select,insert on public.workshop_reception_job_cancellations to service_role;

-- Keep Phase 1 linkage/approval constraints intact. Cancellation is a separate
-- immutable Job Card outcome, presented on linked Reception reads.
create function public.zukait_reception_cancel_rc_guard()
returns trigger language plpgsql security invoker set search_path=public as $$
declare c public.workshop_reception_job_cancellations;
begin
 select * into c from public.workshop_reception_job_cancellations where rc_no=new.rc_no;
 if found and new.job_card is distinct from c.job_card then raise exception 'reception_cancellation_history_protected';end if;
 return new;
end;$$;
create trigger aa_reception_cancel_rc before insert or update on public.workshop_receptions for each row execute function public.zukait_reception_cancel_rc_guard();

create function public.zukait_reception_cancellation_review(p_job text,p_data jsonb)
returns jsonb language plpgsql stable security invoker set search_path=public as $$
declare j jsonb;a jsonb;s jsonb;parts jsonb;work jsonb;pa jsonb;events text;review jsonb;
begin
 select e into j from jsonb_array_elements(coalesce(p_data->'jobs','[]')) e where e->>'no'=p_job;
 select coalesce(jsonb_agg(e order by e->>'id'),'[]') into a from jsonb_array_elements(coalesce(p_data->'assign','[]')) e where e->>'job'=p_job;
 select coalesce(jsonb_agg(e order by e->>'id'),'[]') into s from jsonb_array_elements(coalesce(p_data->'sessions','[]')) e where e->>'job'=p_job or e->>'preliminaryLinkedJob'=p_job;
 select coalesce(jsonb_agg(to_jsonb(p) order by part_id),'[]') into parts from public.workshop_v2_spare_part_state p where job_card=p_job;
 select coalesce(jsonb_agg(to_jsonb(w) order by session_id),'[]') into work from public.workshop_v2_work_sessions w where job_card=p_job;
 select coalesce(jsonb_agg(to_jsonb(x) order by assignment_id),'[]') into pa from public.workshop_v2_assignments x where job_card=p_job;
 -- Includes commercial events which may not advance the operational part revision.
 select md5(coalesce(jsonb_agg(to_jsonb(e) order by event_id),'[]')::text) into events from public.workshop_v2_events e where payload->>'jobCard'=p_job and event_type like 'SPARE_PART%';
 review:=jsonb_build_object('job_card',p_job,'assignments',a,'sessions',s,'parts',parts,
  'active_assignments',(select count(*) from jsonb_array_elements(a) e where coalesce(e->>'cancelled','false')<>'true' and coalesce(e->>'completed','false')<>'true'),
  'active_sessions',(select count(*) from jsonb_array_elements(s) e where coalesce(e->>'cancelled','false')<>'true' and coalesce(e->>'end','0') in ('0','')),
  'projected_active_sessions',(select count(*) from jsonb_array_elements(work) e where e->>'status' in ('ACTIVE','PAUSED')),
  'unresolved_projected_assignments',(select count(*) from jsonb_array_elements(pa) e where e->>'status' not in ('COMPLETED','FINISHED','CANCELLED','CANCELED') and not exists(select 1 from jsonb_array_elements(a) x where x->>'id'=e->>'assignment_id' and (x->>'completed'='true' or x->>'cancelled'='true'))),
  'outstanding_parts',(select count(*) from jsonb_array_elements(parts) e where e->>'status' not in ('FITTED','RETURNED','UNAVAILABLE','CANCELLED','DELETED','CUSTOMER_SETTLEMENT')));
 return review||jsonb_build_object('fingerprint',md5(jsonb_build_array(j,a,s,parts,work,pa,events)::text));
end;$$;

alter function public.zukait_reception_command(text,jsonb) rename to zukait_reception_additional_command;
create function public.zukait_reception_command(p_actor_id text,p_command jsonb)
returns jsonb language plpgsql security invoker set search_path=public,pg_temp as $$
declare op text:=p_command->>'operation';r public.workshop_receptions;cached public.workshop_reception_commands;
 actor public.staff_credentials;request uuid;day date;reason text:=trim(coalesce(p_command->>'reason',''));s public.workshop_state;
 j jsonb;review jsonb;result jsonb;c public.workshop_reception_job_cancellations;
begin
 if op is distinct from 'CANCEL_JOB' then
  result:=public.zukait_reception_additional_command(p_actor_id,p_command);
  if op='LIST' then
   if p_command->>'filter'='CANCELLED' then
    result:=result||jsonb_build_object('rows',(select coalesce(jsonb_agg(x.row order by x.seq desc),'[]') from (
     select rs.sequence_no seq,to_jsonb(rs)||jsonb_build_object('insurance_company',i.name)||case when cs.rc_no is null then '{}'::jsonb else jsonb_build_object('outcome','CANCELLED','closed_at',cs.recorded_at) end row
     from public.workshop_receptions rs join public.workshop_insurance_companies i on i.id=rs.insurance_id left join public.workshop_reception_job_cancellations cs on cs.rc_no=rs.rc_no
     where (rs.outcome='CANCELLED' or cs.rc_no is not null) and (nullif(p_command->>'before_sequence','') is null or rs.sequence_no<(p_command->>'before_sequence')::bigint)
     and (trim(coalesce(p_command->>'search',''))='' or strpos(lower(concat_ws(' ',rs.rc_no,rs.details->>'registration',rs.details->>'customer',rs.details->>'vin',i.name)),lower(trim(p_command->>'search')))>0)
     order by rs.sequence_no desc limit 100) x));
   else
    result:=result||jsonb_build_object('rows',(select coalesce(jsonb_agg(e||case when cs.rc_no is null then '{}'::jsonb else jsonb_build_object('outcome','CANCELLED','closed_at',cs.recorded_at) end order by n),'[]') from jsonb_array_elements(result->'rows') with ordinality a(e,n) left join public.workshop_reception_job_cancellations cs on cs.rc_no=e->>'rc_no'));
   end if;
  end if;
  if op='GET' then
   select * into r from public.workshop_receptions where rc_no=p_command->>'rc_no';
   select * into actor from public.staff_credentials where user_id=p_actor_id and active;
   select data into s.data from public.workshop_state where id='main';
   review:=public.zukait_reception_cancellation_review(r.job_card,s.data);
   select * into c from public.workshop_reception_job_cancellations where rc_no=r.rc_no;
   select e into j from jsonb_array_elements(coalesce(s.data->'jobs','[]')) e where e->>'no'=r.job_card;
   if c.rc_no is not null then result:=result||jsonb_build_object('record',result->'record'||jsonb_build_object('outcome','CANCELLED','closed_at',c.recorded_at));end if;
   return result||jsonb_build_object('cancellation',jsonb_build_object('can_review',actor.role='Manager' and r.job_card is not null and r.outcome is null and public.zukait_reception_open_job(j),
    'review',case when actor.role='Manager' and r.job_card is not null then review else null end,'history',case when c.rc_no is null then null else to_jsonb(c)-'job_snapshot'-'review_snapshot' end));
  end if;
  return result;
 end if;
 select * into actor from public.staff_credentials where user_id=p_actor_id and active;
 if actor.user_id is null or actor.role<>'Manager' then raise exception 'reception_manager_required';end if;
 if length(p_command::text)>10000 or exists(select 1 from jsonb_object_keys(p_command) k where k not in ('operation','rc_no','expected_revision','request_id','job_card','cancellation_date','reason','review_fingerprint','review_acknowledged')) then raise exception 'reception_invalid_fields';end if;
 if coalesce(p_command->>'request_id','') !~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' then raise exception 'reception_request_required';end if;
 request:=(p_command->>'request_id')::uuid;
 perform pg_advisory_xact_lock(hashtextextended(request::text,0));
 select * into cached from public.workshop_reception_commands where request_id=request;
 if found then
  if cached.actor_id<>p_actor_id or cached.command<>p_command then raise exception 'reception_request_conflict';end if;
  return cached.result||'{"duplicate":true}'::jsonb;
 end if;
 select * into r from public.workshop_receptions where rc_no=p_command->>'rc_no' for update;
 if not found then raise exception 'reception_not_found';end if;
 if coalesce(p_command->>'expected_revision','') !~ '^[0-9]+$' or (p_command->>'expected_revision')::numeric<>r.revision then raise exception 'reception_stale_revision';end if;
 if r.outcome is not null or exists(select 1 from public.workshop_reception_job_cancellations where rc_no=r.rc_no) then raise exception 'reception_case_closed';end if;
 if r.job_card is null or p_command->>'job_card' is distinct from r.job_card then raise exception 'reception_cancellation_identity_required';end if;
 if jsonb_typeof(p_command->'reason') is distinct from 'string' or length(reason) not between 1 and 2000 then raise exception 'reception_reason_required';end if;
 if coalesce(p_command->>'cancellation_date','') !~ '^[0-9]{4}-[0-9]{2}-[0-9]{2}$' then raise exception 'reception_invalid_cancellation_date';end if;
 begin day:=(p_command->>'cancellation_date')::date;exception when datetime_field_overflow or invalid_datetime_format then raise exception 'reception_invalid_cancellation_date';end;
 if day>(now() at time zone 'Asia/Muscat')::date then raise exception 'reception_invalid_cancellation_date';end if;
 -- RC -> shared state -> projections. Job events also take this state lock.
 select * into s from public.workshop_state where id='main' for update;
 if (select count(*) from jsonb_array_elements(coalesce(s.data->'jobs','[]')) e where e->>'no'=r.job_card)<>1 then raise exception 'reception_linked_job_required';end if;
 select e into j from jsonb_array_elements(s.data->'jobs') e where e->>'no'=r.job_card;
 if not public.zukait_reception_open_job(j) or j->>'receptionNo' is distinct from r.rc_no then raise exception 'reception_cancellation_job_closed';end if;
 if j->>'createdAt' ~ '^[0-9]+$' and day<(to_timestamp((j->>'createdAt')::numeric/1000) at time zone 'Asia/Muscat')::date then raise exception 'reception_invalid_cancellation_date';end if;
 review:=public.zukait_reception_cancellation_review(r.job_card,s.data);
 if (review->>'active_assignments')::int>0 or (review->>'active_sessions')::int>0 or (review->>'projected_active_sessions')::int>0 or (review->>'unresolved_projected_assignments')::int>0 then raise exception 'reception_cancellation_active_work';end if;
 if p_command->'review_acknowledged' is distinct from 'true'::jsonb or p_command->>'review_fingerprint' is distinct from review->>'fingerprint' then raise exception 'reception_cancellation_review_changed';end if;
 insert into public.workshop_reception_job_cancellations(rc_no,job_card,cancellation_date,reason,actor_id,actor_name,identity_snapshot,job_snapshot,review_snapshot,request_id)
 values(r.rc_no,r.job_card,day,reason,p_actor_id,actor.display_name,public.zukait_reception_identity(r.details,r.insurance_id),j,review,request) returning * into c;
 insert into public.workshop_state_history(revision,data,updated_at,updated_by) values(s.revision,s.data,s.updated_at,s.updated_by) on conflict(revision) do nothing;
 update public.workshop_state set data=s.data,revision=s.revision+1,updated_at=now(),updated_by=p_actor_id where id='main';
 update public.workshop_v2_jobcards set status='CANCELLED',workflow_stage='CANCELLED',updated_at=now() where job_card=r.job_card;
 update public.workshop_receptions set decision=jsonb_build_object('reason',reason,'cancellation_date',day,'by',p_actor_id,'at',now(),'job_card',r.job_card),revision=revision+1,updated_at=now(),updated_by=p_actor_id where rc_no=r.rc_no;
 insert into public.workshop_reception_audit(rc_no,operation,actor_id,before_data,after_data,reason) values(r.rc_no,op,p_actor_id,to_jsonb(r),to_jsonb(c),reason);
 select * into r from public.workshop_receptions where rc_no=r.rc_no;
 result:=jsonb_build_object('ok',true,'record',to_jsonb(r)||jsonb_build_object('outcome','CANCELLED','closed_at',c.recorded_at),'cancellation',to_jsonb(c)-'job_snapshot'-'review_snapshot','server_revision',s.revision+1);
 insert into public.workshop_reception_commands(request_id,actor_id,command,result) values(request,p_actor_id,p_command,result);
 return result;
end;$$;

create function public.zukait_reception_cancel_state_guard()
returns trigger language plpgsql security invoker set search_path=public as $$
declare r public.workshop_receptions;c public.workshop_reception_job_cancellations;j jsonb;k text;before_rows jsonb;after_rows jsonb;
begin
 if new.id<>'main' then return new;end if;
 for r in select * from public.workshop_receptions where job_card is not null loop
  select e into j from jsonb_array_elements(coalesce(new.data->'jobs','[]')) e where e->>'no'=r.job_card;
  select * into c from public.workshop_reception_job_cancellations where rc_no=r.rc_no;
  if c.rc_no is null then
   if lower(coalesce(j->>'cancelled','false')) not in ('false','0','') or upper(trim(coalesce(j->>'status',''))) in ('CANCELLED','CANCELED') or upper(trim(coalesce(j->>'workflowStage','')))='CANCELLED' then raise exception 'reception_cancellation_command_required';end if;
  else
   if lower(coalesce(j->>'delivered','false')) not in ('false','0','') or lower(coalesce(j->>'deleted','false')) not in ('false','0','') or lower(coalesce(j->>'archived','false')) not in ('false','0','') then raise exception 'reception_cancelled_job_delivery_forbidden';end if;
   if tg_op='UPDATE' then
    if exists(select 1 from jsonb_array_elements(old.data->'jobs') x where x->>'no'=r.job_card and (x->'qcWorkflow' is distinct from j->'qcWorkflow' or x->'completedAt' is distinct from j->'completedAt')) then raise exception 'reception_cancelled_work_history_protected';end if;
    foreach k in array array['assign','sessions'] loop
     select coalesce(jsonb_agg(e order by e->>'id'),'[]') into before_rows from jsonb_array_elements(coalesce(old.data->k,'[]')) e where e->>'job'=r.job_card or (k='sessions' and e->>'preliminaryLinkedJob'=r.job_card);
     select coalesce(jsonb_agg(e order by e->>'id'),'[]') into after_rows from jsonb_array_elements(coalesce(new.data->k,'[]')) e where e->>'job'=r.job_card or (k='sessions' and e->>'preliminaryLinkedJob'=r.job_card);
     if before_rows is distinct from after_rows then raise exception 'reception_cancelled_work_history_protected';end if;
    end loop;
   end if;
   new.data:=jsonb_set(new.data,'{jobs}',(select jsonb_agg(case when e->>'no'=r.job_card then e||jsonb_build_object('status','Cancelled','workflowStage','CANCELLED','cancelled',true,'cancellationDate',c.cancellation_date,'cancelReason',c.reason,'cancelledBy',c.actor_id,'cancelledByName',c.actor_name,'cancelledAt',floor(extract(epoch from c.recorded_at)*1000)) else e end order by n) from jsonb_array_elements(new.data->'jobs') with ordinality a(e,n)));
  end if;
 end loop;
 return new;
end;$$;
create trigger ab_reception_cancel_state before insert or update of data on public.workshop_state for each row execute function public.zukait_reception_cancel_state_guard();

create function public.zukait_reception_cancel_projection_guard()
returns trigger language plpgsql security invoker set search_path=public as $$
begin
 if exists(select 1 from public.workshop_reception_job_cancellations where job_card=new.job_card) then
  new.status:='CANCELLED';new.workflow_stage:='CANCELLED';if tg_op='UPDATE' then new.completed_at:=old.completed_at;end if;
 elsif exists(select 1 from public.workshop_receptions where job_card=new.job_card) and (upper(new.status) in ('CANCELLED','CANCELED') or upper(new.workflow_stage)='CANCELLED') then raise exception 'reception_cancellation_command_required';end if;
 return new;
end;$$;
create trigger ab_reception_cancel_projection before insert or update on public.workshop_v2_jobcards for each row execute function public.zukait_reception_cancel_projection_guard();

create function public.zukait_reception_cancel_event_guard()
returns trigger language plpgsql security invoker set search_path=public as $$
declare job text:=coalesce(new.payload->>'jobCard',new.payload->>'job',new.entity_id);
begin
 if exists(select 1 from public.workshop_v2_events where event_id=new.event_id) then return new;end if;
 -- Existing event retries still use commit_event's exact payload conflict check.
 -- All new events for a linked job, including prices/parts, serialize review/commit.
 if exists(select 1 from public.workshop_receptions where job_card=job) then
  perform 1 from public.workshop_state where id='main' for update;
  if exists(select 1 from public.workshop_reception_job_cancellations where job_card=job) and new.event_type in ('JOB_CREATED','JOB_UPDATED','JOB_STAGE_CHANGED','JOB_COMPLETED','JOB_REOPENED','JOB_ASSIGNED','REPEAT_ASSIGNED','WORK_START','WORK_RESUME','ID001_PRELIMINARY_LINKED') then raise exception 'reception_cancelled_job_work_forbidden';end if;
 end if;
 return new;
end;$$;
create trigger aa_reception_cancel_event before insert on public.workshop_v2_events for each row execute function public.zukait_reception_cancel_event_guard();

create function public.zukait_reception_cancel_work_projection_guard()
returns trigger language plpgsql security invoker set search_path=public as $$
begin
 if tg_op='UPDATE' and exists(select 1 from public.workshop_reception_job_cancellations where job_card=old.job_card) then raise exception 'reception_cancelled_work_history_protected';end if;
 if exists(select 1 from public.workshop_receptions where job_card=new.job_card) then perform 1 from public.workshop_state where id='main' for update;end if;
 if exists(select 1 from public.workshop_reception_job_cancellations where job_card=new.job_card) then raise exception 'reception_cancelled_work_history_protected';end if;
 return new;
end;$$;
create trigger aa_reception_cancel_work before insert or update on public.workshop_v2_work_sessions for each row execute function public.zukait_reception_cancel_work_projection_guard();
create trigger aa_reception_cancel_assignment before insert or update on public.workshop_v2_assignments for each row execute function public.zukait_reception_cancel_work_projection_guard();

revoke all on function public.zukait_reception_command(text,jsonb),public.zukait_reception_cancellation_review(text,jsonb),public.zukait_reception_cancel_state_guard(),public.zukait_reception_cancel_projection_guard(),public.zukait_reception_cancel_event_guard(),public.zukait_reception_cancel_work_projection_guard(),public.zukait_reception_cancel_rc_guard() from public,anon,authenticated;
grant execute on function public.zukait_reception_command(text,jsonb),public.zukait_reception_cancellation_review(text,jsonb),public.zukait_reception_cancel_state_guard(),public.zukait_reception_cancel_projection_guard(),public.zukait_reception_cancel_event_guard(),public.zukait_reception_cancel_work_projection_guard(),public.zukait_reception_cancel_rc_guard() to service_role;
commit;
