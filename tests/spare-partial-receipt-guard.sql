-- Rollback-only receipt quantities and stale transition checks.
begin;
do $$
declare pid text:='AUDIT-'||gen_random_uuid()::text;
begin
 insert into public.workshop_v2_events(event_id,entity_id,event_type,revision,server_time,payload)
 values(pid||'-list',pid,'SPARE_PART_LISTED',1,clock_timestamp(),jsonb_build_object('partId',pid,'listNo',pid,'jobCard',pid,'name','Receipt fixture','qty',3));
 insert into public.workshop_v2_events(event_id,entity_id,event_type,revision,server_time,payload)
 values(pid||'-partial',pid,'SPARE_PART_STATUS_CHANGED',2,clock_timestamp(),jsonb_build_object('partId',pid,'from','LISTED','to','RECEIVED','receivedQty',1));
 begin
 insert into public.workshop_v2_events(event_id,entity_id,event_type,revision,server_time,payload)
 values(pid||'-early-verify',pid,'SPARE_PART_STATUS_CHANGED',3,clock_timestamp(),jsonb_build_object('partId',pid,'from','RECEIVED','to','SUPERVISOR_VERIFIED'));
 raise exception 'partial receipt was verified';
 exception when others then if sqlerrm<>'spare_receipt_incomplete' then raise; end if; end;
 insert into public.workshop_v2_events(event_id,entity_id,event_type,revision,server_time,payload)
 values(pid||'-second-batch',pid,'SPARE_PART_STATUS_CHANGED',3,clock_timestamp(),jsonb_build_object('partId',pid,'from','RECEIVED','to','RECEIVED','receivedQty',2));
 begin
 insert into public.workshop_v2_events(event_id,entity_id,event_type,revision,server_time,payload)
 values(pid||'-stale-batch',pid,'SPARE_PART_STATUS_CHANGED',3,clock_timestamp(),jsonb_build_object('partId',pid,'from','RECEIVED','to','RECEIVED','receivedQty',2));
 raise exception 'stale receipt was accepted';
 exception when others then if sqlerrm<>'stale_spare_part_status' then raise; end if; end;
 begin
 insert into public.workshop_v2_events(event_id,entity_id,event_type,revision,server_time,payload)
 values(pid||'-excess',pid,'SPARE_PART_STATUS_CHANGED',4,clock_timestamp(),jsonb_build_object('partId',pid,'from','RECEIVED','to','RECEIVED','receivedQty',4));
 raise exception 'excess receipt was accepted';
 exception when others then if sqlerrm<>'spare_received_quantity_exceeds_ordered' then raise; end if; end;
 insert into public.workshop_v2_events(event_id,entity_id,event_type,revision,server_time,payload)
 values(pid||'-last-batch',pid,'SPARE_PART_STATUS_CHANGED',4,clock_timestamp(),jsonb_build_object('partId',pid,'from','RECEIVED','to','RECEIVED','receivedQty',3));
 insert into public.workshop_v2_events(event_id,entity_id,event_type,revision,server_time,payload)
 values(pid||'-verify',pid,'SPARE_PART_STATUS_CHANGED',5,clock_timestamp(),jsonb_build_object('partId',pid,'from','RECEIVED','to','SUPERVISOR_VERIFIED'));
 if not exists(select 1 from public.workshop_v2_spare_part_state where part_id=pid and received_qty=3 and status='SUPERVISOR_VERIFIED') then raise exception 'full receipt verification failed'; end if;
end $$;
select 'partial_and_excess_rejected_stale_batch_rejected_full_receipt_verified' as check_result;
rollback;
