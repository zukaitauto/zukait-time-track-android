-- Rollback-only integration test for the live Spare Parts event guard.
begin; do $$ declare pid text:='AUDIT-'||gen_random_uuid()::text; rejected boolean:=false; begin insert into public.workshop_v2_events(event_id,entity_id,event_type,revision,server_time,payload) values(pid||'-list',pid,'SPARE_PART_LISTED',1,clock_timestamp(),jsonb_build_object('partId',pid,'listNo',pid,'jobCard',pid)||'{"name":"Audit fixture","qty":1}'::jsonb);
insert into public.workshop_v2_events(event_id,entity_id,event_type,revision,server_time,payload) values(pid||'-receipt',pid,'SPARE_PART_STATUS_CHANGED',2,clock_timestamp(),jsonb_build_object('partId',pid,'listNo',pid,'jobCard',pid)||'{"from":"LISTED","to":"RECEIVED","receivedQty":1}'::jsonb);
insert into public.workshop_v2_events(event_id,entity_id,event_type,revision,server_time,payload) values(pid||'-verify',pid,'SPARE_PART_STATUS_CHANGED',3,clock_timestamp(),jsonb_build_object('partId',pid,'listNo',pid,'jobCard',pid)||'{"from":"RECEIVED","to":"SUPERVISOR_VERIFIED"}'::jsonb);
insert into public.workshop_v2_events(event_id,entity_id,event_type,revision,server_time,payload) values(pid||'-invoice',pid,'SPARE_PART_FINAL_PRICE_RECORDED',1,clock_timestamp(),jsonb_build_object('partId',pid,'listNo',pid,'jobCard',pid)||'{"finalPrice":25}'::jsonb); begin insert into public.workshop_v2_events(event_id,entity_id,event_type,revision,server_time,payload) values(pid||'-stale-return',pid,'SPARE_PART_STATUS_CHANGED',4,clock_timestamp(),jsonb_build_object('partId',pid,'listNo',pid,'jobCard',pid)||'{"from":"SUPERVISOR_VERIFIED","to":"RETURNED","returnedQty":1,"preReturnSnapshot":{"status":"SUPERVISOR_VERIFIED","receivedQty":1}}'::jsonb); exception when others then if sqlerrm='stale_spare_return_financial_snapshot' then rejected:=true; else raise; end if; end; if not rejected then raise exception 'audit_stale_return_not_rejected'; end if; insert into public.workshop_v2_events(event_id,entity_id,event_type,revision,server_time,payload) values(pid||'-fresh-return',pid,'SPARE_PART_STATUS_CHANGED',4,clock_timestamp(),jsonb_build_object('partId',pid,'listNo',pid,'jobCard',pid)||'{"from":"SUPERVISOR_VERIFIED","to":"RETURNED","returnedQty":1,"preReturnSnapshot":{"status":"SUPERVISOR_VERIFIED","receivedQty":1,"purchaseAmount":25,"purchaseAmountRevision":1}}'::jsonb); insert into public.workshop_v2_events(event_id,entity_id,event_type,revision,server_time,payload) values(pid||'-cancel-return',pid,'SPARE_PART_RETURN_CANCELLED',5,clock_timestamp(),jsonb_build_object('partId',pid,'listNo',pid,'jobCard',pid)||'{"after":{"status":"SUPERVISOR_VERIFIED","receivedQty":1,"purchaseAmount":25,"purchaseAmountRevision":1}}'::jsonb);
 insert into public.workshop_v2_events(event_id,entity_id,event_type,revision,server_time,payload)
 values(pid||'-new-invoice',pid,'SPARE_PART_FINAL_PRICE_RECORDED',2,clock_timestamp(),
 jsonb_build_object('partId',pid,'finalPrice',35));

 begin
 insert into public.workshop_v2_events(event_id,entity_id,event_type,revision,server_time,payload)
 values(pid||'-stale-correction',pid,'SPARE_PART_MANAGER_CORRECTED',1,clock_timestamp(),
 jsonb_build_object('partId',pid,'before',jsonb_build_object('status','SUPERVISOR_VERIFIED','purchaseAmount',25),
 'after',jsonb_build_object('status','SUPERVISOR_VERIFIED','purchaseAmount',26)));
 raise exception 'stale correction accepted';
 exception when others then if sqlerrm<>'stale_spare_manager_correction' then raise; end if; end;
 insert into public.workshop_v2_events(event_id,entity_id,event_type,revision,server_time,payload)
 values(pid||'-fresh-correction',pid,'SPARE_PART_MANAGER_CORRECTED',1,clock_timestamp(),
 jsonb_build_object('partId',pid,'before',jsonb_build_object('status','SUPERVISOR_VERIFIED','purchaseAmount',35),
 'after',jsonb_build_object('status','SUPERVISOR_VERIFIED','purchaseAmount',36)));
 end $$;
 select 'stale_correction_rejected_fresh_correction_accepted' as check_result;
 rollback;
