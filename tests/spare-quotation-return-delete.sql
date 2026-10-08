begin;
do $$
declare pid text:='AUDIT-'||gen_random_uuid()::text;
begin
 insert into public.workshop_v2_events(event_id,entity_id,event_type,revision,server_time,payload)
 values(pid||'-list',pid,'SPARE_PART_LISTED',1,clock_timestamp(),jsonb_build_object('partId',pid,'listNo',pid,'jobCard',pid,'name','Quotation fixture','qty',1));
 insert into public.workshop_v2_events(event_id,entity_id,event_type,revision,server_time,payload)
 values(pid||'-return',pid,'SPARE_PART_STATUS_CHANGED',2,clock_timestamp(),jsonb_build_object('partId',pid,'from','LISTED','to','RETURNED','returnedQty',0));
 begin
 insert into public.workshop_v2_events(event_id,entity_id,event_type,revision,server_time,payload)
 values(pid||'-returned-quote',pid,'SPARE_PART_COMMERCIAL_UPDATED',1,clock_timestamp(),jsonb_build_object('partId',pid,'quoteAmount',25));
 raise exception 'returned quotation accepted';
 exception when others then if sqlerrm<>'stale_spare_part_status' then raise; end if; end;
 insert into public.workshop_v2_events(event_id,entity_id,event_type,revision,server_time,payload)
 values(pid||'-re-enquire',pid,'SPARE_PART_STATUS_CHANGED',3,clock_timestamp(),jsonb_build_object('partId',pid,'from','RETURNED','to','ENQUIRY'));
 insert into public.workshop_v2_events(event_id,entity_id,event_type,revision,server_time,payload)
 values(pid||'-fresh-quote',pid,'SPARE_PART_COMMERCIAL_UPDATED',1,clock_timestamp(),jsonb_build_object('partId',pid,'quoteAmount',25));
 insert into public.workshop_v2_events(event_id,entity_id,event_type,revision,server_time,payload)
 values(pid||'-delete',pid,'SPARE_PART_ITEM_EDITED',1,clock_timestamp(),jsonb_build_object('partId',pid,'after',jsonb_build_object('deletedAt',clock_timestamp())));
 begin
 insert into public.workshop_v2_events(event_id,entity_id,event_type,revision,server_time,payload)
 values(pid||'-deleted-quote',pid,'SPARE_PART_COMMERCIAL_UPDATED',2,clock_timestamp(),jsonb_build_object('partId',pid,'quoteAmount',30));
 raise exception 'deleted quotation accepted';
 exception when others then if sqlerrm<>'stale_spare_part_status' then raise; end if; end;
end $$;
select 'returned_and_deleted_quotes_rejected_reenquiry_quote_accepted' as check_result;
rollback;
