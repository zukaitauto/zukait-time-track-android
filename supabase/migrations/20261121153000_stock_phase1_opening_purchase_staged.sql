-- ZUKAIT Stock Phase 1: isolated opening-stock and purchase ledger.
-- STAGED ONLY. Do not apply in production until QA, physical count and owner pilot approval.
-- Never modifies workshop_state or history. Does not support issuing/returns/adjustments.
BEGIN;

CREATE TABLE IF NOT EXISTS public.workshop_stock_balances (
  material_id text NOT NULL,
  brand_id text NOT NULL,
  unit text NOT NULL,
  physical numeric(18,4) NOT NULL DEFAULT 0 CHECK (physical >= 0),
  reserved numeric(18,4) NOT NULL DEFAULT 0 CHECK (reserved >= 0 AND reserved <= physical),
  stock_value numeric(18,3) NOT NULL DEFAULT 0 CHECK (stock_value >= 0),
  opening_at timestamptz,
  opening_by text,
  updated_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (material_id, brand_id)
);
CREATE TABLE IF NOT EXISTS public.workshop_stock_events (
  id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  client_request_id text NOT NULL UNIQUE,
  fingerprint text NOT NULL,
  kind text NOT NULL CHECK (kind IN ('OPENING','PURCHASE')),
  material_id text NOT NULL,
  brand_id text NOT NULL,
  unit text NOT NULL,
  quantity numeric(18,4) NOT NULL CHECK (quantity >= 0),
  total_cost numeric(18,3) NOT NULL CHECK (total_cost >= 0),
  unit_cost numeric(18,6) NOT NULL CHECK (unit_cost >= 0),
  physical_after numeric(18,4) NOT NULL CHECK (physical_after >= 0),
  stock_value_after numeric(18,3) NOT NULL CHECK (stock_value_after >= 0),
  actor_id text NOT NULL,
  note text NOT NULL CHECK (length(btrim(note)) >= 5),
  receipt jsonb NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  FOREIGN KEY (material_id,brand_id)
    REFERENCES public.workshop_stock_balances(material_id,brand_id)
);
CREATE INDEX IF NOT EXISTS workshop_stock_events_item_time
ON public.workshop_stock_events(material_id,brand_id,id DESC);

ALTER TABLE public.workshop_stock_balances ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.workshop_stock_events ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.workshop_stock_balances,public.workshop_stock_events
  FROM PUBLIC,anon,authenticated;
REVOKE ALL ON SEQUENCE public.workshop_stock_events_id_seq FROM PUBLIC,anon,authenticated;
GRANT SELECT,INSERT,UPDATE ON public.workshop_stock_balances TO service_role;
GRANT SELECT,INSERT ON public.workshop_stock_events TO service_role;
GRANT USAGE,SELECT ON SEQUENCE public.workshop_stock_events_id_seq TO service_role;

-- Only the workshop-api's authenticated, active staff session may authorize
-- this service-role-only RPC. Current staff roles are checked inside the DB.
CREATE OR REPLACE FUNCTION public.zukait_stock_phase1_write(
  p_actor_id text,p_session_hash text,p_client_request_id text,
  p_kind text,p_material_id text,p_brand_id text,p_quantity numeric,
  p_total_cost numeric,p_note text,p_count_confirmed boolean DEFAULT false
) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER
SET search_path = pg_catalog,public AS $$
DECLARE
  v_role text;
  v_unit text;
  v_material jsonb;
  v_brand jsonb;
  v_master jsonb;
  v_kind text := upper(btrim(coalesce(p_kind,'')));
  v_note text := btrim(coalesce(p_note,''));
  v_qty numeric(18,4);
  v_cost numeric(18,3);
  v_fingerprint text;
  v_seen text;
  v_receipt jsonb;
  v_physical numeric(18,4);
  v_value numeric(18,3);
  v_opening timestamptz;
  v_previous_unit text;
  v_after_physical numeric(18,4);
  v_after_value numeric(18,3);
  v_id bigint;
BEGIN
  SELECT s.role INTO v_role
    FROM public.staff_credentials s
    JOIN public.staff_sessions ss ON ss.user_id=s.user_id
   WHERE s.user_id=p_actor_id AND ss.token_hash=p_session_hash
     AND ss.revoked_at IS NULL AND s.active IS TRUE AND s.must_change IS FALSE
   LIMIT 1;
  IF v_role IS NULL OR (v_kind='OPENING' AND v_role<>'Manager') OR
    (v_kind='PURCHASE' AND v_role NOT IN ('Manager','Supervisor')) THEN
    RAISE EXCEPTION 'stock_forbidden' USING ERRCODE='42501';
  END IF;
  IF v_kind NOT IN ('OPENING','PURCHASE') THEN
    RAISE EXCEPTION 'stock_action_disabled' USING ERRCODE='42501';
  END IF;
  IF p_client_request_id IS NULL OR length(p_client_request_id) NOT BETWEEN 16 AND 128
    OR p_client_request_id !~ '^[A-Za-z0-9_:.-]+$' THEN
    RAISE EXCEPTION 'stock_request_invalid';
  END IF;
  IF p_material_id IS NULL OR length(p_material_id) NOT BETWEEN 1 AND 100
    OR p_brand_id IS NULL OR length(p_brand_id) NOT BETWEEN 1 AND 100 THEN
    RAISE EXCEPTION 'stock_item_invalid';
  END IF;
  IF length(v_note) NOT BETWEEN 5 AND 200 THEN
    RAISE EXCEPTION 'stock_reference_required';
  END IF;
  IF p_quantity IS NULL OR p_total_cost IS NULL OR
     p_quantity<0 OR p_quantity>100000 OR p_quantity <> round(p_quantity,4) OR
     p_total_cost<0 OR p_total_cost>1000000 OR p_total_cost<>round(p_total_cost,3) OR
     (v_kind='PURCHASE' AND (p_quantity=0 OR p_total_cost=0)) OR
     (v_kind='OPENING' AND (p_count_confirmed IS DISTINCT FROM true OR
       (p_quantity=0 AND p_total_cost<>0))) THEN
    RAISE EXCEPTION 'stock_quantity_price_invalid';
  END IF;
  v_qty:=p_quantity;
  v_cost:=p_total_cost;

  -- Validate against current Material Master without modifying it. This
  -- indexed-by-ID lookup does not use old master prices for stock valuation.
  SELECT s.data->'consumables' INTO v_master
    FROM public.workshop_state s WHERE s.id='main';
  SELECT m.value INTO v_material
    FROM jsonb_array_elements(coalesce(v_master->'materials','[]'::jsonb)) AS m
   WHERE m.value->>'id'=p_material_id
     AND m.value->>'active' IS DISTINCT FROM 'false' LIMIT 1;
  SELECT b.value INTO v_brand
    FROM jsonb_array_elements(coalesce(v_master->'brands','[]'::jsonb)) AS b
   WHERE b.value->>'id'=p_brand_id
     AND b.value->>'active' IS DISTINCT FROM 'false' LIMIT 1;
  IF v_material IS NULL OR v_brand IS NULL OR NOT EXISTS(
    SELECT 1 FROM jsonb_array_elements(coalesce(v_master->'prices','[]'::jsonb)) AS p
    WHERE p.value->>'materialId'=p_material_id AND p.value->>'brandId'=p_brand_id
      AND p.value->>'voided' IS DISTINCT FROM 'true'
  ) THEN RAISE EXCEPTION 'stock_master_pair_invalid'; END IF;
  v_unit:=btrim(v_material->>'unit');
  IF v_unit NOT IN ('Liter','kg','Piece') THEN RAISE EXCEPTION 'stock_unit_invalid'; END IF;
  IF v_unit='Piece' AND v_qty <> trunc(v_qty) THEN
    RAISE EXCEPTION 'stock_piece_quantity_invalid';
  END IF;

  v_fingerprint:=md5(jsonb_build_object(
    'actor',p_actor_id,'kind',v_kind,'material',p_material_id,'brand',p_brand_id,
    'quantity',v_qty,'cost',v_cost,'note',v_note
  )::text);
  -- Serialize writes per material/brand, not all workshop activity.
  PERFORM pg_advisory_xact_lock(hashtextextended('stock:'||p_material_id||':'||p_brand_id,0));
  SELECT fingerprint,receipt INTO v_seen,v_receipt
    FROM public.workshop_stock_events WHERE client_request_id=p_client_request_id;
  IF FOUND THEN
    IF v_seen <> v_fingerprint THEN RAISE EXCEPTION 'stock_request_conflict'; END IF;
    RETURN v_receipt || jsonb_build_object('duplicate',true);
  END IF;

  IF v_kind='OPENING' THEN
    INSERT INTO public.workshop_stock_balances(material_id,brand_id,unit)
      VALUES(p_material_id,p_brand_id,v_unit)
      ON CONFLICT (material_id,brand_id) DO NOTHING;
  END IF;
  SELECT unit,physical,stock_value,opening_at
    INTO v_previous_unit,v_physical,v_value,v_opening
    FROM public.workshop_stock_balances
   WHERE material_id=p_material_id AND brand_id=p_brand_id FOR UPDATE;
  IF NOT FOUND OR (v_kind='PURCHASE' AND v_opening IS NULL) THEN
    RAISE EXCEPTION 'stock_opening_required';
  END IF;
  IF v_previous_unit<>v_unit THEN RAISE EXCEPTION 'stock_unit_changed'; END IF;
  IF v_kind='OPENING' AND v_opening IS NOT NULL THEN RAISE EXCEPTION 'stock_already_opened'; END IF;
  v_after_physical:=v_physical+v_qty;
  v_after_value:=v_value+v_cost;

  UPDATE public.workshop_stock_balances
     SET physical=v_after_physical,stock_value=v_after_value,
         opening_at=CASE WHEN v_kind='OPENING' THEN now() ELSE opening_at END,
         opening_by=CASE WHEN v_kind='OPENING' THEN p_actor_id ELSE opening_by END,
         updated_at=now()
   WHERE material_id=p_material_id AND brand_id=p_brand_id;

  v_receipt:=jsonb_build_object(
    'ok',true,'requestId',p_client_request_id,'kind',v_kind,
    'materialId',p_material_id,'brandId',p_brand_id,'unit',v_unit,
    'quantity',v_qty,'totalCost',v_cost,
    'physicalAfter',v_after_physical,'stockValueAfter',v_after_value,
    'averageUnitCost',CASE WHEN v_after_physical>0
      THEN round(v_after_value/v_after_physical,6) ELSE NULL END,
    'actorId',p_actor_id
  );
  INSERT INTO public.workshop_stock_events(
    client_request_id,fingerprint,kind,material_id,brand_id,unit,
    quantity,total_cost,unit_cost,physical_after,stock_value_after,
    actor_id,note,receipt
  ) VALUES (
    p_client_request_id,v_fingerprint,v_kind,p_material_id,p_brand_id,v_unit,
    v_qty,v_cost,CASE WHEN v_qty>0 THEN round(v_cost/v_qty,6) ELSE 0 END,
    v_after_physical,v_after_value,p_actor_id,v_note,v_receipt
  ) RETURNING id INTO v_id;
  RETURN v_receipt || jsonb_build_object('eventId',v_id);
END $$;

REVOKE ALL ON FUNCTION public.zukait_stock_phase1_write(
  text,text,text,text,text,text,numeric,numeric,text,boolean
) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.zukait_stock_phase1_write(
  text,text,text,text,text,text,numeric,numeric,text,boolean
) TO service_role;
COMMIT;
