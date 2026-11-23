-- ZUKAIT Vehicle Master, isolated QA only.
-- The customer/contact role is per-visit metadata, NOT vehicle ownership.
-- Uses existing QA Reception rows and rolls back all writes.
begin;
do $qa$
declare
 rc text; creator_id text; manager_id text;
 answer jsonb; audits integer;
begin
 select rc_no,created_by into rc,creator_id
 from public.workshop_receptions
 where created_by='ZQA_RC_V305_RECEPTION'
 order by sequence_no desc limit 1;
 select user_id into manager_id
 from public.staff_credentials where role='Manager' and active=true limit 1;
 if rc is null or manager_id is null then raise exception 'missing_qa_fixture';end if;

 answer:=public.zukait_vehicle_record_customer_role(rc,creator_id,'CLAIM_CONTACT');
 if answer->>'ok'<>'true' then raise exception 'initial_record_failed_%',answer;end if;
 answer:=public.zukait_vehicle_record_customer_role(rc,creator_id,'REPRESENTATIVE');
 if answer->>'code'<>'manager_role_correction_required'
 then raise exception 'unauthorized_correction_accepted_%',answer;end if;
 answer:=public.zukait_vehicle_record_customer_role(rc,manager_id,'REPRESENTATIVE');
 if answer->>'ok'<>'true' then raise exception 'manager_correction_failed_%',answer;end if;
 select count(*) into audits from zukait_vehicle.visit_customer_role_audit where rc_no=rc;
 if audits<>2 then raise exception 'expected_2_audits_found_%',audits;end if;
 if (select customer_role from zukait_vehicle.visit_customer_roles where rc_no=rc)<>'REPRESENTATIVE'
 then raise exception 'updated_role_missing';end if;
 if exists(select 1 from information_schema.columns
           where table_schema='public' and table_name='workshop_receptions'
             and column_name='customer_role')
 then raise exception 'legacy_reception_schema_was_modified';end if;
end $qa$;
rollback;
