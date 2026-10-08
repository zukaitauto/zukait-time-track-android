begin;
do $$
declare pid text:='AUDIT-'||gen_random_uuid()::text;
begin
 insert into public.workshop_v2_events(event_id,entity_id,event_type,revision,server_time,payload)
 values(pid||'-list',pid,'SPARE_PART_LISTED',1,clock_timestamp(),jsonb_build_object('partId',pid,'listNo',pid,'jobCard',pid,'name','Repeat fixture','qty',1));
 insert into public.workshop_v2_events(event_id,entity_id,event_type,revision,server_time,payload)
 values(pid||'-receive',pid,'SPARE_PART_STATUS_CHANGED',2,clock_timestamp(),jsonb_build_object('partId',pid,'from','LISTED','to','RECEIVED','receivedQty',1));
 insert into public.workshop_v2_events(event_id,entity_id,event_type,revision,server_time,payload)
 values(pid||'-verify',pid,'SPARE_PART_STATUS_CHANGED',3,clock_timestamp(),jsonb_build_object('partId',pid,'from','RECEIVED','to','SUPERVISOR_VERIFIED'));
 begin
 insert into public.workshop_v2_events(event_id,entity_id,event_type,revision,server_time,payload)
 values(pid||'-relist',pid,'SPARE_PART_LISTED',2,clock_timestamp(),jsonb_build_object('partId',pid,'listNo',pid,'jobCard',pid,'name','Repeat fixture','qty',1));
 raise exception 'existing part was relisted';
 exception when others then if sqlerrm<>'duplicate_active_spare_part' then raise; end if; end;
 if not exists(select 1 from public.workshop_v2_spare_part_state where part_id=pid and status='SUPERVISOR_VERIFIED' and received_qty=1) then raise exception 'relist reset existing state'; end if;
end $$;
select 'repeated_listing_rejected_existing_receipt_state_preserved' as check_result;
rollback;
