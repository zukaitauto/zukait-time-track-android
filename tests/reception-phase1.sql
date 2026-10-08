-- Run after the migration in one transaction and ROLLBACK. No live staff/state changes.
do $$
declare
  mgr text; sup text; emp text; ins bigint; a jsonb; b jsonb; cmd jsonb; rc text;
  before_state jsonb; before_revision bigint; n bigint;
begin
  select user_id into mgr from staff_credentials where role='Manager' and active limit 1;
  select user_id into sup from staff_credentials where role='Supervisor' and active limit 1;
  select user_id into emp from staff_credentials where role='Employee' and active limit 1;
  select id into ins from workshop_insurance_companies where active limit 1;
  if mgr is null or sup is null or emp is null then raise exception 'test actors unavailable'; end if;
  select data,revision into before_state,before_revision from workshop_state where id='main';
  if has_function_privilege('anon','zukait_reception_command(text,jsonb)','execute') or has_function_privilege('authenticated','zukait_reception_command(text,jsonb)','execute') then raise exception 'RPC exposed'; end if;
  if has_table_privilege('anon','workshop_receptions','select') or has_table_privilege('authenticated','workshop_receptions','update') then raise exception 'table exposed'; end if;
  if (zukait_reception_command(emp,'{"operation":"CAPABILITIES"}')->>'allowed')::boolean then raise exception 'employee unexpectedly designated'; end if;
  begin
    perform zukait_reception_command(emp,'{"operation":"LIST"}');raise exception 'unauthorized read accepted';
  exception when others then if sqlerrm<>'reception_forbidden' then raise; end if; end;
  cmd:=jsonb_build_object('operation','CREATE','request_id',gen_random_uuid(),'insurance_id',ins,'details',jsonb_build_object('make','Toyota','model','Camry'));
  a:=zukait_reception_command(sup,cmd);rc:=a->'record'->>'rc_no';
  if rc<>'RC0001' then raise exception 'unexpected initial RC: %',rc; end if;
  if a->'record'->>'job_card' is not null or a->'record'->>'location'<>'VIW' then raise exception 'create fabricated JC/location'; end if;
  b:=zukait_reception_command(sup,cmd);
  if b->>'duplicate'<>'true' or b->'record'->>'rc_no'<>rc then raise exception 'retry duplicated RC'; end if;
  begin perform zukait_reception_command(mgr,cmd);raise exception 'cross actor request replay accepted';
  exception when others then if sqlerrm<>'reception_request_conflict' then raise; end if;end;
  begin perform zukait_reception_command(sup,cmd||jsonb_build_object('details',jsonb_build_object('make','Nissan','model','Altima')));raise exception 'changed payload retry accepted';
  exception when others then if sqlerrm<>'reception_request_conflict' then raise; end if;end;
  begin perform zukait_reception_command(sup,cmd||jsonb_build_object('request_id',gen_random_uuid(),'details','{"make":"Toyota","model":""}'::jsonb));raise exception 'missing model accepted';
  exception when others then if sqlerrm<>'reception_vehicle_required' then raise; end if;end;
  begin perform zukait_reception_command(sup,cmd||jsonb_build_object('request_id',gen_random_uuid(),'details','{"make":"Toyota","model":"Camry","photo":"data:secret"}'::jsonb));raise exception 'photos accepted';
  exception when others then if sqlerrm<>'reception_invalid_fields' then raise; end if;end;
  a:=zukait_reception_command(sup,jsonb_build_object('operation','EDIT','rc_no',rc,'expected_revision',1,'request_id',gen_random_uuid(),'insurance_id',ins,'details','{"make":"Toyota","model":"Camry","tools":["jack"],"fuel":"","vin":"abc","registration":"abc123"}'::jsonb));
  if a->'record'->'details'->>'vin'<>'ABC' or a->'record'->'details'->'tools'<>'["jack"]'::jsonb then raise exception 'normalization/tools mismatch'; end if;
  begin perform zukait_reception_command(sup,jsonb_build_object('operation','MOVE','rc_no',rc,'expected_revision',1,'request_id',gen_random_uuid(),'location','VWC','reason','Wait for approval'));raise exception 'stale edit accepted';
  exception when others then if sqlerrm<>'reception_stale_revision' then raise; end if;end;
  a:=zukait_reception_command(sup,jsonb_build_object('operation','MOVE','rc_no',rc,'expected_revision',2,'request_id',gen_random_uuid(),'location','VWC','reason','Wait for approval','expected_return_date',current_date+3));
  if a->'record'->>'location'<>'VWC' or a->'record'->>'outcome' is not null then raise exception 'VWC closed case'; end if;
  a:=zukait_reception_command(sup,jsonb_build_object('operation','MOVE','rc_no',rc,'expected_revision',3,'request_id',gen_random_uuid(),'location','VIW','reason','Customer returned'));
  if a->'record'->>'location'<>'VIW' then raise exception 'return failed'; end if;
  begin perform zukait_reception_command(sup,jsonb_build_object('operation','CLOSE','rc_no',rc,'expected_revision',4,'request_id',gen_random_uuid(),'outcome','CTL','reason','Insurance decision'));raise exception 'CTL without handover accepted';
  exception when others then if sqlerrm<>'reception_handover_required' then raise; end if;end;
  a:=zukait_reception_command(mgr,jsonb_build_object('operation','MOVE','rc_no',rc,'expected_revision',4,'request_id',gen_random_uuid(),'location','VWC','reason','Insurance takes vehicle'));
  a:=zukait_reception_command(mgr,jsonb_build_object('operation','CLOSE','rc_no',rc,'expected_revision',5,'request_id',gen_random_uuid(),'outcome','CTL','reason','Constructive total loss','handover_to','Insurance representative'));
  if a->'record'->>'outcome'<>'CTL' or a->'record'->>'closed_at' is null then raise exception 'CTL not closed'; end if;
  begin perform zukait_reception_command(sup,jsonb_build_object('operation','MOVE','rc_no',rc,'expected_revision',6,'request_id',gen_random_uuid(),'location','VIW','reason','Invalid reopening'));raise exception 'closed case moved';
  exception when others then if sqlerrm<>'reception_case_closed' then raise; end if;end;
  b:=zukait_reception_command(sup,jsonb_build_object('operation','GET','rc_no',rc));
  if jsonb_array_length(b->'movements')<>4 or jsonb_array_length(b->'audit')<>6 then raise exception 'history missing'; end if;
  b:=zukait_reception_command(sup,'{"operation":"LIST","search":"ABC123","filter":"CTL"}');
  if jsonb_array_length(b->'rows')<>1 then raise exception 'search/filter failed'; end if;
  begin perform zukait_reception_command(sup,jsonb_build_object('operation','ACCESS','request_id',gen_random_uuid(),'user_id',emp,'active',true));raise exception 'Supervisor granted access';
  exception when others then if sqlerrm<>'reception_manager_required' then raise; end if;end;
  perform zukait_reception_command(mgr,jsonb_build_object('operation','ACCESS','request_id',gen_random_uuid(),'user_id',emp,'active',true));
  b:=zukait_reception_command(emp,'{"operation":"LIST"}');
  if not (b->>'ok')::boolean then raise exception 'designated staff denied'; end if;
  perform zukait_reception_command(mgr,jsonb_build_object('operation','ACCESS','request_id',gen_random_uuid(),'user_id',emp,'active',false));
  begin perform zukait_reception_command(emp,'{"operation":"LIST"}');raise exception 'revoked designation accepted';
  exception when others then if sqlerrm<>'reception_forbidden' then raise; end if;end;
  -- Cash Loss and Cancelled do not create a JC, delivery or income entry.
  foreach cmd in array array['{"outcome":"CASH_LOSS"}'::jsonb,'{"outcome":"CANCELLED"}'::jsonb] loop
    a:=zukait_reception_command(sup,jsonb_build_object('operation','CREATE','request_id',gen_random_uuid(),'insurance_id',ins,'details','{"make":"Nissan","model":"Altima"}'::jsonb));rc:=a->'record'->>'rc_no';
    perform zukait_reception_command(sup,jsonb_build_object('operation','MOVE','rc_no',rc,'expected_revision',1,'request_id',gen_random_uuid(),'location','VWC','reason','Customer takes vehicle'));
    a:=zukait_reception_command(sup,jsonb_build_object('operation','CLOSE','rc_no',rc,'expected_revision',2,'request_id',gen_random_uuid(),'reason','No repair','handover_to','Customer')||cmd);
    if a->'record'->>'job_card' is not null then raise exception 'outcome fabricated JC'; end if;
  end loop;
  -- Simulated future Phase 2 link: observations remain Manager-editable;
  -- shared identity changes fail closed until atomic JC linkage is implemented.
  a:=zukait_reception_command(mgr,jsonb_build_object('operation','CREATE','request_id',gen_random_uuid(),'insurance_id',ins,'details','{"make":"Toyota","model":"Corolla"}'::jsonb));rc:=a->'record'->>'rc_no';
  update workshop_receptions set approval_status='APPROVED',job_card='TEST-ONLY-LINK' where rc_no=rc;
  cmd:=jsonb_build_object('operation','EDIT','rc_no',rc,'expected_revision',1,'request_id',gen_random_uuid(),'insurance_id',ins,'details',a->'record'->'details'||'{"remarks":"Manager correction"}'::jsonb);
  begin perform zukait_reception_command(sup,cmd);raise exception 'Supervisor edited linked checklist';
  exception when others then if sqlerrm<>'reception_manager_required' then raise; end if;end;
  a:=zukait_reception_command(mgr,cmd);
  begin perform zukait_reception_command(mgr,cmd||jsonb_build_object('request_id',gen_random_uuid(),'expected_revision',2,'details',a->'record'->'details'||'{"make":"Honda"}'::jsonb));raise exception 'linked identity drift accepted';
  exception when others then if sqlerrm<>'reception_linked_identity_requires_phase2' then raise; end if;end;
  begin perform zukait_reception_command(mgr,jsonb_build_object('operation','CLOSE','rc_no',rc,'expected_revision',2,'request_id',gen_random_uuid(),'outcome','CANCELLED','reason','Customer refuses'));raise exception 'linked JC cancelled without dependency review';
  exception when others then if sqlerrm<>'reception_job_cancellation_requires_phase2' then raise; end if;end;
  if exists(select 1 from workshop_state where id='main' and (data<>before_state or revision<>before_revision)) then raise exception 'existing workflows changed'; end if;
  -- Ensure numbering beyond 9999 grows rather than truncates/reuses identifiers.
  perform setval('workshop_reception_no_seq',9999);
  a:=zukait_reception_command(mgr,jsonb_build_object('operation','CREATE','request_id',gen_random_uuid(),'insurance_id',ins,'details','{"make":"Toyota","model":"Camry"}'::jsonb));
  if a->'record'->>'rc_no'<>'RC10000' then raise exception 'RC number overflow'; end if;
  raise notice 'reception Phase 1 SQL tests passed';
end $$;
