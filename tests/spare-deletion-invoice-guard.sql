-- Rollback-only: deletion wins after API prevalidation; late financial events fail.
begin;
do $$
declare pid text:='AUDIT-'||gen_random_uuid()::text; typ text; expected text;
begin
  insert into public.workshop_v2_events(event_id,entity_id,event_type,revision,server_time,payload)
  values(pid||'-list',pid,'SPARE_PART_LISTED',1,clock_timestamp(),
    jsonb_build_object('partId',pid,'listNo',pid,'jobCard',pid,'name','Delete race fixture','qty',1));
  insert into public.workshop_v2_events(event_id,entity_id,event_type,revision,server_time,payload)
  values(pid||'-delete',pid,'SPARE_PART_ITEM_EDITED',2,clock_timestamp(),
    jsonb_build_object('partId',pid,'after',jsonb_build_object('deletedAt',clock_timestamp())));
  foreach typ in array array['SPARE_PART_FINAL_PRICE_RECORDED','SPARE_PART_ARRIVAL_ACCEPTED'] loop
    expected:=case when typ='SPARE_PART_FINAL_PRICE_RECORDED' then 'spare_final_price_not_eligible' else 'spare_arrival_acceptance_not_eligible' end;
    begin
      insert into public.workshop_v2_events(event_id,entity_id,event_type,revision,server_time,payload)
      values(pid||typ,pid,typ,3,clock_timestamp(),jsonb_build_object('partId',pid,'finalPrice',25));
      raise exception 'late event unexpectedly accepted: %',typ;
    exception when others then
      if sqlerrm<>expected then raise; end if;
    end;
  end loop;
  if exists(select 1 from public.workshop_v2_spare_part_state where part_id=pid) then raise exception 'deleted projection revived'; end if;
  if exists(select 1 from public.workshop_v2_events where entity_id=pid and event_type in ('SPARE_PART_FINAL_PRICE_RECORDED','SPARE_PART_ARRIVAL_ACCEPTED')) then raise exception 'late event persisted'; end if;
end $$;
select 'deleted_part_rejects_late_invoice_and_acceptance' as check_result;
rollback;
