-- Legacy jobs may predate the jobType field. Correct their classification only
-- through the existing Manager/reason/revision-bound immutable audit pathway.
-- New insurance intake, ordinary snapshot saves and insurer approval stay guarded.
begin;
set local lock_timeout='5s';
set local statement_timeout='30s';

create or replace function public.zukait_manager_classification_valid(p_job text,p_before jsonb,p_after jsonb,p_revision bigint)
returns boolean language sql stable security invoker set search_path=public as $$
 select p_before is not null and upper(trim(coalesce(p_before->>'jobType',''))) in ('','CASH','CREDIT')
 and upper(p_after->>'jobType')='INSURANCE' and exists(
 select 1 from public.workshop_job_classification_audit a join public.staff_credentials u on u.user_id=a.actor_id
 where a.job_card=p_job and a.expected_revision=p_revision and a.transaction_id=txid_current()
 and u.active and u.role='Manager' and a.before_data=p_before
 and a.after_identity=public.zukait_classification_identity(p_after));
$$;

create or replace function public.zukait_linked_classification_valid(p_job text,p_id bigint)
returns boolean language sql stable security invoker set search_path=public as $$
 select exists(select 1 from public.workshop_job_classification_audit where id=p_id and job_card=p_job
 and upper(trim(coalesce(before_data->>'jobType',''))) in ('','CASH','CREDIT')
 and upper(after_data->>'jobType')='INSURANCE');
$$;

-- Preserve every other part of the live full-edit implementation and its ACL.
-- Fail closed if its expected audited correction branch has changed.
do $patch$
declare definition text; previous text:=$old$upper(coalesce(previous_job->>'jobType','')) in ('CASH','CREDIT')$old$;
 replacement text:=$new$upper(trim(coalesce(previous_job->>'jobType',''))) in ('','CASH','CREDIT')$new$;
begin
 definition:=pg_get_functiondef('public.zukait_manager_full_job_edit(bigint,jsonb,text,text,text,jsonb)'::regprocedure);
 if position('workshop_job_classification_audit' in definition)=0 or position('previous_job is null' in definition)=0 then
  raise exception 'manager_classification_definition_requires_review';
 end if;
 if position(replacement in definition)>0 then return;end if;
 if position(previous in definition)=0 then raise exception 'manager_classification_definition_requires_review';end if;
 execute replace(definition,previous,replacement);
end;
$patch$;
commit;
