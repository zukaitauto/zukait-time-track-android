begin;
do $$
declare pid text:='AUDIT-'||gen_random_uuid()::text;
begin
 insert into public.workshop_v2_events(event_id,entity_id,event_type,revision,server_time,payload)
 values(pid||'-list',pid,'SPARE_PART_LISTED',1,clock_timestamp(),jsonb_build_object('partId',pid,'listNo',pid,'jobCard',pid,'name','Old bracket','qty',3));
 insert into public.workshop_v2_events(event_id,entity_id,event_type,revision,server_time,payload)
 values(pid||'-first',pid,'SPARE_PART_MANAGER_CORRECTED',1,clock_timestamp(),
 jsonb_build_object('partId',pid,'before',jsonb_build_object('status','LISTED','name','Old bracket','qty',3),
 'after',jsonb_build_object('status','LISTED','name','New bracket','qty',4)));
 begin
 insert into public.workshop_v2_events(event_id,entity_id,event_type,revision,server_time,payload)
 values(pid||'-stale',pid,'SPARE_PART_SUPERVISOR_CORRECTED',2,clock_timestamp(),
 jsonb_build_object('partId',pid,'before',jsonb_build_object('status','LISTED','name','Old bracket','qty',3),
 'after',jsonb_build_object('status','LISTED','name','Old bracket','qty',5)));
 raise exception 'stale identity correction accepted';
 exception when others then if sqlerrm<>'stale_spare_manager_correction' then raise; end if; end;
 insert into public.workshop_v2_events(event_id,entity_id,event_type,revision,server_time,payload)
 values(pid||'-fresh',pid,'SPARE_PART_SUPERVISOR_CORRECTED',2,clock_timestamp(),
 jsonb_build_object('partId',pid,'before',jsonb_build_object('status','LISTED','name','New bracket','qty',4),
 'after',jsonb_build_object('status','LISTED','name','New bracket','qty',5)));
 if not exists(select 1 from public.workshop_v2_spare_part_state where part_id=pid and part_name='New bracket' and ordered_qty=5) then raise exception 'fresh correction failed'; end if;
end $$;
select 'stale_identity_and_quantity_rejected_fresh_correction_accepted' as check_result;
rollback;
