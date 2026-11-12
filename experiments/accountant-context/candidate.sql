-- NOT APPLIED TO PRODUCTION. No change to functions, records or permissions.
-- Matches the context function's exact existing event filter and ordering.
create index workshop_v2_events_accountant_order_idx
 on public.workshop_v2_events(server_time,event_id)
 where event_type like 'SPARE_PART_%';
