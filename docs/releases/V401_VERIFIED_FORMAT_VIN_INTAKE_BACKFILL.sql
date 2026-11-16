-- ZUKAIT V401: bounded, additive historical VIN intake registration.
-- Does not overwrite existing Reception, Job Card, customer, insurance or history data.
-- Only saved 17-character VINs with allowed ISO VIN characters, no plate-only linking.
-- Leave unverified/blank VINs provisional; no invented matching or global backfill.
BEGIN;
SET LOCAL lock_timeout = '3s';
SET LOCAL statement_timeout = '30s';
DO $v401$
DECLARE r record;
BEGIN
  IF EXISTS (
    SELECT vin
    FROM (
      SELECT upper(regexp_replace(coalesce(details->>'vin',''),'[[:space:]]','','g')) AS vin
      FROM public.workshop_receptions
    ) v
    WHERE vin ~ '^[A-HJ-NPR-Z0-9]{17}$'
    GROUP BY vin HAVING count(*)>1
  ) THEN RAISE EXCEPTION 'v401_historical_vin_not_unique_review_required'; END IF;
  FOR r IN
    SELECT c.rc_no, c.received_at, c.details,
      coalesce(c.details->>'registration',c.details->>'regNo',c.details->>'reg') AS reg,
      upper(regexp_replace(coalesce(c.details->>'vin',''),'[[:space:]]','','g')) AS vin
    FROM public.workshop_receptions c
    WHERE upper(regexp_replace(coalesce(c.details->>'vin',''),'[[:space:]]','','g'))
         ~ '^[A-HJ-NPR-Z0-9]{17}$'
      AND NOT EXISTS (
        SELECT 1 FROM zukait_vehicle.vehicle_visits h
        WHERE h.source_kind='RECEPTION' AND h.source_id=c.rc_no
      )
    ORDER BY c.rc_no
    LIMIT 50
  LOOP
    PERFORM zukait_vehicle.record_physical_visit(
      'RECEPTION',r.rc_no,r.reg,
      coalesce(r.details->>'make',r.details->>'vehicleMake'),
      coalesce(r.details->>'model',r.details->>'vehicleModel'),
      CASE WHEN coalesce(r.details->>'year','')~'^[0-9]{4}$'
        THEN (r.details->>'year')::integer ELSE NULL END,
      r.vin,NULL,r.received_at
    );
  END LOOP;
END $v401$;
COMMIT;
