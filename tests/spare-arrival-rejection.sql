begin;
do $$
declare pid text:='AUDIT-'||gen_random_uuid()::text; s text; q numeric;
begin
insert into public.workshop_v2_events(event_id,entity_id,event_type,revision,server_time,payload) values(pid||'-list',pid,'SPARE_PART_LISTED',1,clock_timestamp(),jsonb_build_object('partId',pid,'listNo',pid,'jobCard',pid,'name','Arrival rejection fixture','qty',3));
insert into public.workshop_v2_events(event_id,entity_id,event_type,revision,server_time,payload) values(pid||'-received',pid,'SPARE_PART_STATUS_CHANGED',2,clock_timestamp(),jsonb_build_object('partId',pid,'from','LISTED','to','RECEIVED','receivedQty',3));
insert into public.workshop_v2_events(event_id,entity_id,event_type,revision,server_time,payload) values(pid||'-reject',pid,'SPARE_PART_STATUS_CHANGED',3,clock_timestamp(),jsonb_build_object('partId',pid,'from','RECEIVED','to','ORDERED','reason','Not physically received','targetRole','Purchaser'));
select status,received_qty into s,q from public.workshop_v2_spare_part_state where part_id=pid;
if s<>'ORDERED' or q<>0 then raise exception 'rejection projection incorrect'; end if;
begin
insert into public.workshop_v2_events(event_id,entity_id,event_type,revision,server_time,payload) values(pid||'-stale-confirm',pid,'SPARE_PART_STATUS_CHANGED',3,clock_timestamp(),jsonb_build_object('partId',pid,'from','RECEIVED','to','SUPERVISOR_VERIFIED'));
raise exception 'stale confirmation accepted';
exception when others then if sqlerrm<>'stale_spare_part_status' then raise; end if; end;
insert into public.workshop_v2_events(event_id,entity_id,event_type,revision,server_time,payload) values(pid||'-receive-again',pid,'SPARE_PART_STATUS_CHANGED',4,clock_timestamp(),jsonb_build_object('partId',pid,'from','ORDERED','to','RECEIVED','receivedQty',3));
insert into public.workshop_v2_events(event_id,entity_id,event_type,revision,server_time,payload) values(pid||'-confirm',pid,'SPARE_PART_STATUS_CHANGED',5,clock_timestamp(),jsonb_build_object('partId',pid,'from','RECEIVED','to','SUPERVISOR_VERIFIED'));
begin
insert into public.workshop_v2_events(event_id,entity_id,event_type,revision,server_time,payload) values(pid||'-stale-reject',pid,'SPARE_PART_STATUS_CHANGED',6,clock_timestamp(),jsonb_build_object('partId',pid,'from','RECEIVED','to','ORDERED','reason','Stale reject'));
raise exception 'stale rejection accepted';
exception when others then if sqlerrm<>'stale_spare_part_status' then raise; end if; end;
end $$;
rollback;