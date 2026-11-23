begin;
do $$
declare pid text:='AUDIT-'||gen_random_uuid()::text; payload jsonb;
begin
 payload:=jsonb_build_object('partId',pid,'listNo',pid,'jobCard',pid,'name','Reuse fixture','qty',1);
 insert into public.workshop_v2_events(event_id,entity_id,event_type,revision,server_time,payload)
 values(pid||'-list',pid,'SPARE_PART_LISTED',1,clock_timestamp(),payload);
 insert into public.workshop_v2_events(event_id,entity_id,event_type,revision,server_time,payload)
 values(pid||'-delete',pid,'SPARE_PART_ITEM_EDITED',1,clock_timestamp(),jsonb_build_object('partId',pid,'after',jsonb_build_object('deletedAt',clock_timestamp())));
 begin
 insert into public.workshop_v2_events(event_id,entity_id,event_type,revision,server_time,payload)
 values(pid||'-reused',pid,'SPARE_PART_LISTED',2,clock_timestamp(),payload);
 raise exception 'deleted part ID reused';
 exception when others then if sqlerrm<>'duplicate_active_spare_part' then raise; end if; end;
 if exists(select 1 from public.workshop_v2_spare_part_state where part_id=pid) then raise exception 'deleted part resurrected'; end if;
 insert into public.workshop_v2_events(event_id,entity_id,event_type,revision,server_time,payload)
 values(pid||'-new-id',pid||'-replacement','SPARE_PART_LISTED',1,clock_timestamp(),payload||jsonb_build_object('partId',pid||'-replacement'));
 if not exists(select 1 from public.workshop_v2_spare_part_state where part_id=pid||'-replacement') then raise exception 'new replacement ID rejected'; end if;
end $$;
select 'deleted_id_reuse_rejected_new_replacement_id_accepted' as check_result;
rollback;
