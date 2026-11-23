-- Explicit fixture numbers only; run in the same BEGIN/ROLLBACK as tests.
do $$declare m text;ins bigint;r text:='RC-QA-CREATE-'||gen_random_uuid();j text:='JCQA'||upper(replace(gen_random_uuid()::text,'-',''));eid text:=gen_random_uuid()::text;eno text:='Zi-QA-CANCEL-'||gen_random_uuid();qid uuid:=gen_random_uuid();q jsonb;p jsonb;ident jsonb;begin
 select user_id into m from staff_credentials where active and role='Manager' limit 1;select id into ins from workshop_insurance_companies where active limit 1;
 p:=jsonb_build_object('id',gen_random_uuid(),'name','Front bumper','part_no','B1','qty',1);
 q:=jsonb_build_object('id',eid,'estimateNo',eno,'makeModel','Toyota Camry','registration','','jobCard','');ident:=zukait_reception_identity('{"make":"Toyota","model":"Camry"}',ins);
 insert into workshop_receptions(rc_no,sequence_no,insurance_id,details,location,approval_status,created_by,updated_by) values(r,-91001,ins,'{"make":"Toyota","model":"Camry"}','VWC','APPROVED',m,m);
 insert into workshop_reception_preliminary_parts(rc_no,items,updated_by) values(r,jsonb_build_array(p),m);
 insert into workshop_reception_estimates(id,rc_no,estimate_id,estimate_no,snapshot,identity_snapshot,linked_by) values(qid,r,eid,eno,q,ident,m);
 insert into workshop_reception_approvals(rc_no,quotation_id,reference,approval_date,approved_amount,approved_parts,parts_snapshot,estimate_snapshot,identity_snapshot,actor_id,reason) values(r,qid,'QA',current_date,1,jsonb_build_array(p),jsonb_build_array(p),q,ident,m,'QA fixture');
 update workshop_state set data=jsonb_set(data,'{estimates}',coalesce(data->'estimates','[]')||jsonb_build_array(q)) where id='main';
 insert into workshop_v2_spare_part_list_numbers(list_no,sequence_no,job_card,client_key,created_by) values('PL-QA-'||gen_random_uuid(),-92001,j,gen_random_uuid(),m);
 perform zukait_reception_command(m,jsonb_build_object('operation','CREATE_JOB','request_id',gen_random_uuid(),'rc_no',r,'expected_revision',1,'job_card',j,'reason','QA fixture'));
end;$$;
