begin;
drop index if exists public.workshop_v2_spare_part_list_numbers_client_key_uidx;
alter table public.workshop_v2_spare_part_list_numbers drop constraint if exists workshop_v2_spare_part_list_numbers_job_card_key;
alter table public.workshop_v2_spare_part_list_numbers add constraint workshop_v2_spare_part_list_numbers_job_card_key unique(job_card);

create or replace function public.zukait_v2_allocate_spare_part_list(p_job_card text,p_actor_id text,p_client_key text)
returns table(list_no text,job_card text,status text,created_at timestamptz,created_by text)
language plpgsql security invoker set search_path=public as $$
declare v_job text:=nullif(upper(trim(coalesce(p_job_card,''))),'');v_key text:=nullif(trim(coalesce(p_client_key,'')),'');v_seq bigint;
begin
 if v_job is null then raise exception 'job_card_required'; end if;
 if v_key is null then raise exception 'client_key_required'; end if;
 return query select l.list_no,l.job_card,l.status,l.created_at,l.created_by from public.workshop_v2_spare_part_list_numbers l where l.job_card=v_job;
 if found then return; end if;
 v_seq:=nextval('public.workshop_v2_spare_part_list_no_seq');
 insert into public.workshop_v2_spare_part_list_numbers(list_no,sequence_no,job_card,client_key,created_by)
 values('PL'||lpad(v_seq::text,3,'0'),v_seq,v_job,v_key,nullif(trim(coalesce(p_actor_id,'')),''));
 return query select l.list_no,l.job_card,l.status,l.created_at,l.created_by from public.workshop_v2_spare_part_list_numbers l where l.job_card=v_job;
exception when unique_violation then
 return query select l.list_no,l.job_card,l.status,l.created_at,l.created_by from public.workshop_v2_spare_part_list_numbers l where l.job_card=v_job;
end;$$;
revoke all on function public.zukait_v2_allocate_spare_part_list(text,text,text) from public,anon,authenticated;
grant execute on function public.zukait_v2_allocate_spare_part_list(text,text,text) to service_role;
commit;