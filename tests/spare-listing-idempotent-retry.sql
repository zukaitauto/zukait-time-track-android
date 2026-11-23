begin;
do $$
declare pid text:='AUDIT-'||gen_random_uuid()::text; result record; payload jsonb;
begin
 payload:=jsonb_build_object('partId',pid,'listNo',pid,'jobCard',pid,'name','Retry fixture','qty',1);
 select * into result from public.zukait_v2_commit_event(pid||'-list',pid,'','','SPARE_PART_LISTED',null,1,payload);
 if not result.inserted then raise exception 'first listing was not inserted'; end if;
 insert into public.workshop_v2_events(event_id,entity_id,event_type,revision,server_time,payload)
 values(pid||'-receive',pid,'SPARE_PART_STATUS_CHANGED',2,clock_timestamp(),jsonb_build_object('partId',pid,'from','LISTED','to','RECEIVED','receivedQty',1));
 insert into public.workshop_v2_events(event_id,entity_id,event_type,revision,server_time,payload)
 values(pid||'-verify',pid,'SPARE_PART_STATUS_CHANGED',3,clock_timestamp(),jsonb_build_object('partId',pid,'from','RECEIVED','to','SUPERVISOR_VERIFIED'));
 select * into result from public.zukait_v2_commit_event(pid||'-list',pid,'','','SPARE_PART_LISTED',null,1,payload);
 if result.inserted then raise exception 'retry inserted another listing'; end if;
 if not exists(select 1 from public.workshop_v2_spare_part_state where part_id=pid and status='SUPERVISOR_VERIFIED' and received_qty=1) then raise exception 'retry changed receipt state'; end if;
 if (select count(*) from public.workshop_v2_events where entity_id=pid and event_type='SPARE_PART_LISTED')<>1 then raise exception 'duplicate listing history'; end if;
end $$;
select 'exact_rpc_retry_is_idempotent_and_preserves_verified_receipt' as check_result;
rollback;
