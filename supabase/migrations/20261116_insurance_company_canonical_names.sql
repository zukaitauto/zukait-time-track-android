-- Canonical ZUKAIT insurer labels: preserve stable primary/foreign keys and all historical records.
-- Existing SAICO (ID 6) is the same insurer as DAMANA. Do not delete/reassign that ID.
BEGIN;
DO $migration$
BEGIN
 IF EXISTS (SELECT 1 FROM public.workshop_insurance_companies WHERE id=6 AND name='SAICO') THEN
   IF EXISTS (SELECT 1 FROM public.workshop_insurance_companies WHERE name='DAMANA-Saudi Arabian Insurance' AND id<>6)
      THEN RAISE EXCEPTION 'DAMANA name is already allocated to a different ID; review manually'; END IF;
   UPDATE public.workshop_insurance_companies SET name='DAMANA-Saudi Arabian Insurance' WHERE id=6 AND name='SAICO';
 ELSIF NOT EXISTS (SELECT 1 FROM public.workshop_insurance_companies WHERE id=6 AND name='DAMANA-Saudi Arabian Insurance') THEN
   RAISE EXCEPTION 'Expected SAICO (ID 6) missing; inspect company master before changing';
 END IF;
 IF NOT EXISTS (SELECT 1 FROM public.workshop_insurance_companies WHERE name='Orange Card') THEN
   INSERT INTO public.workshop_insurance_companies(name,active)
   VALUES ('Orange Card',true);
 END IF;
 -- Oman Qatar Insurance and Orient Insurance are already present: retain their IDs.
END;
$migration$;
COMMIT;
