-- V377 staged ONLY. Manager correction/unlink of reconciled JC mapping.
-- Never modify the original checklist, direct Job Card or workshop financial/session records.
begin;
create table if not exists public.workshop_reception_existing_job_link_audit (
 id bigint generated always as identity primary key,
 request_id uuid not null unique,
 rc_no text not null references public.workshop_receptions(rc_no),
 previous_job_card text not null,
 replacement_job_card text,
 operation text not null check(operation in ('CORRECT_EXISTING_JOB_LINK','UNLINK_EXISTING_JOB')),
 manager_id text not null references public.staff_credentials(user_id),
 reason text not null check(length(btrim(reason)) between 1 and 2000),
 changed_at timestamptz not null default now()
);
alter table public.workshop_reception_existing_job_link_audit enable row level security;
revoke all on public.workshop_reception_existing_job_link_audit from public,anon,authenticated,service_role;
grant select,insert on public.workshop_reception_existing_job_link_audit to service_role;
-- SECURITY INVOKER correction RPC deletes only the mapping row under Manager authorization.
-- The staging migration granted SELECT/INSERT but omitted DELETE on this table.
grant delete on public.workshop_reception_existing_job_links to service_role;

create or replace function public.zukait_reception_correct_existing_job_link(p_actor_id text,p_command jsonb)
returns jsonb language plpgsql security invoker set search_path=public,pg_temp as $reception_correction$
declare
 v_role text; v_op text:=p_command->>'operation'; v_rc text:=p_command->>'rc_no';
 v_old text:=upper(btrim(coalesce(p_command->>'previous_job_card','')));
 v_new text:=upper(btrim(coalesce(p_command->>'job_card','')));
 v_reason text:=btrim(coalesce(p_command->>'reason',''));
 v_req uuid; v_link public.workshop_reception_existing_job_links%rowtype;
 v_audit public.workshop_reception_existing_job_link_audit%rowtype;
 v_result jsonb; v_checklist public.workshop_receptions%rowtype;
begin
 select role into v_role from public.staff_credentials where user_id=p_actor_id and active;
 if v_role is distinct from 'Manager' then raise exception 'reception_manager_required'; end if;
 if v_op not in ('CORRECT_EXISTING_JOB_LINK','UNLINK_EXISTING_JOB') or
    exists(select 1 from jsonb_object_keys(p_command) k where k not in
    ('operation','rc_no','previous_job_card','job_card','reason','request_id','confirmed','expected_revision'))
 then raise exception 'reception_invalid_fields'; end if;
 if p_command->>'confirmed'<>'true' or length(v_reason) not between 1 and 2000
 then raise exception 'reception_link_confirmation_required'; end if;
 if coalesce(p_command->>'request_id','') !~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
 then raise exception 'reception_request_required'; end if;
 v_req:=(p_command->>'request_id')::uuid;
 if v_op='CORRECT_EXISTING_JOB_LINK' and (v_new !~ '^[A-Z0-9][A-Z0-9/-]{0,39}$' or v_new=v_old)
 then raise exception 'reception_link_invalid_input'; end if;
 perform pg_advisory_xact_lock(hashtextextended('reception-link-correction:'||v_rc,0));
 select * into v_audit from public.workshop_reception_existing_job_link_audit where request_id=v_req;
 if found then
   if v_audit.rc_no<>v_rc or v_audit.manager_id<>p_actor_id or v_audit.operation<>v_op or
      v_audit.previous_job_card<>v_old or coalesce(v_audit.replacement_job_card,'')<>case when v_op='UNLINK_EXISTING_JOB' then '' else v_new end
   then raise exception 'reception_request_conflict'; end if;
   return jsonb_build_object('ok',true,'rc_no',v_rc,'job_card',v_audit.replacement_job_card,'duplicate',true);
 end if;
 select * into v_checklist from public.workshop_receptions where rc_no=v_rc for update;
 if not found then raise exception 'reception_not_found'; end if;
 if coalesce(p_command->>'expected_revision','') !~ '^[0-9]+$' or
    v_checklist.revision<>(p_command->>'expected_revision')::bigint
 then raise exception 'reception_stale_revision'; end if;
 select * into v_link from public.workshop_reception_existing_job_links where rc_no=v_rc for update;
 if not found or v_link.job_card<>v_old then raise exception 'reception_link_conflict'; end if;
 -- Delete and replace within the same transaction; failure in the existing link RPC
 -- rolls back the deletion and the audit. Only the independent mapping is changed.
 delete from public.workshop_reception_existing_job_links where rc_no=v_rc;
 if v_op='CORRECT_EXISTING_JOB_LINK' then
   v_result:=public.zukait_reception_link_existing_job(p_actor_id,jsonb_build_object(
     'operation','LINK_EXISTING_JOB','rc_no',v_rc,'job_card',v_new,
     'expected_revision',p_command->>'expected_revision','request_id',v_req,
     'reason',v_reason,'confirmed',true));
 end if;
 insert into public.workshop_reception_existing_job_link_audit
 (request_id,rc_no,previous_job_card,replacement_job_card,operation,manager_id,reason)
 values(v_req,v_rc,v_old,case when v_op='UNLINK_EXISTING_JOB' then null else v_new end,
        v_op,p_actor_id,v_reason);
 return jsonb_build_object('ok',true,'rc_no',v_rc,'job_card',
    case when v_op='UNLINK_EXISTING_JOB' then null else v_new end);
end; $reception_correction$;
revoke all on function public.zukait_reception_correct_existing_job_link(text,jsonb) from public,anon,authenticated,service_role;
grant execute on function public.zukait_reception_correct_existing_job_link(text,jsonb) to service_role;
commit;
