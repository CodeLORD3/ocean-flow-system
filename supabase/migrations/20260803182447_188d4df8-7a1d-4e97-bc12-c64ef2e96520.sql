-- 1. Intern partinummerserie
CREATE SEQUENCE IF NOT EXISTS public.lot_number_seq;

CREATE OR REPLACE FUNCTION public.next_internal_lot_number()
RETURNS text
LANGUAGE sql
VOLATILE
SET search_path = public
AS $$
  SELECT 'IL-' || to_char(now(), 'YYYY') || '-' || lpad(nextval('public.lot_number_seq')::text, 4, '0');
$$;

-- 2. Städa upp de två felaktiga partierna från den kraschade bokföringen
INSERT INTO public.stock_movements (product_id, location_id, lot_id, movement_type, quantity_kg, unit_cost, reference_type, reference_id, note)
SELECT m.product_id, m.location_id, m.lot_id, 'justering', -m.quantity_kg, m.unit_cost, 'korrigering', m.reference_id,
       'Återföring av avbruten bokföring'
FROM public.stock_movements m
JOIN public.lots l ON l.id = m.lot_id
WHERE m.movement_type = 'inleverans'
  AND l.lot_number IN ('2', '3');

UPDATE public.purchase_report_lines
SET lot_id = NULL, movement_id = NULL, parent_line_id = NULL
WHERE lot_id IN (SELECT id FROM public.lots WHERE lot_number IN ('2', '3'));

UPDATE public.lots
SET status = 'terminerad',
    terminated_reason = 'Ogiltigt partinummer från avbruten bokföring',
    quantity_kg = 0
WHERE lot_number IN ('2', '3');

-- 3. Utbyten per sortering
ALTER TABLE public.yields ADD COLUMN IF NOT EXISTS grade text;

ALTER TABLE public.yields DROP CONSTRAINT IF EXISTS yields_species_group_from_form_to_form_key;
CREATE UNIQUE INDEX IF NOT EXISTS yields_species_form_grade_uniq
  ON public.yields (species_group, from_form, to_form, COALESCE(grade, ''));

INSERT INTO public.yields (species_group, from_form, to_form, yield_pct, is_estimate, note, grade)
VALUES
  ('torsk', 'rensad', 'filé utan skinn', 48, true, 'Startvärde, ej kalibrerat', NULL),
  ('torsk', 'hel', 'filé utan skinn', 50, false, 'Sortering 1', '1'),
  ('torsk', 'hel', 'filé utan skinn', 50, false, 'Sortering 2', '2'),
  ('torsk', 'hel', 'filé utan skinn', 47, false, 'Sortering 3', '3'),
  ('torsk', 'hel', 'filé utan skinn', 45, false, 'Sortering 4', '4'),
  ('torsk', 'hel', 'filé utan skinn', 43, false, 'Sortering 5', '5')
ON CONFLICT DO NOTHING;

-- 4. Styckningsmodell styrd av sortering
ALTER TABLE public.species_cut_models ADD COLUMN IF NOT EXISTS grade_limit integer;
COMMENT ON COLUMN public.species_cut_models.grade_limit IS
  'Sortering från och med detta värde styckas som hel filé (single) i stället för cut_model.';
UPDATE public.species_cut_models SET grade_limit = 3 WHERE species_group = 'torsk';

-- 5. Prislista torsk
UPDATE public.detail_prices SET last_set_price = 798, price_incl_vat = 798
WHERE species_group = 'torsk' AND detail_form = 'rygg' AND price_list = 'butik_goteborg';

UPDATE public.detail_prices SET last_set_price = 198, price_incl_vat = 198
WHERE species_group = 'torsk' AND detail_form = 'slag' AND price_list = 'butik_goteborg';

INSERT INTO public.detail_prices (species_group, detail_form, cut_form, role, price_list, last_set_price, price_incl_vat)
VALUES ('torsk', 'hel filé', 'hel filé', 'primary', 'butik_goteborg', 0, NULL)
ON CONFLICT (price_list, species_group, detail_form) DO NOTHING;

-- 6. Atomisk bokföring av inköpsrapport
CREATE OR REPLACE FUNCTION public.post_purchase_report(
  p_report_id uuid,
  p_location_id uuid,
  p_lots jsonb
)
RETURNS uuid[]
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_lot jsonb;
  v_lot_id uuid;
  v_movement_id uuid;
  v_lot_ids uuid[] := '{}';
  v_posted timestamptz;
  v_line_ids uuid[];
BEGIN
  SELECT posted_at INTO v_posted FROM public.purchase_reports WHERE id = p_report_id FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Inköpsrapporten hittades inte.';
  END IF;
  IF v_posted IS NOT NULL THEN
    RAISE EXCEPTION 'Rapporten är redan bokförd och kan inte bokföras igen.';
  END IF;
  IF p_lots IS NULL OR jsonb_array_length(p_lots) = 0 THEN
    RAISE EXCEPTION 'Inga partier att bokföra.';
  END IF;

  FOR v_lot IN SELECT * FROM jsonb_array_elements(p_lots) LOOP
    IF (v_lot->>'product_id') IS NULL THEN
      RAISE EXCEPTION 'En rad saknar kopplad produkt och kan inte bokföras.';
    END IF;
    IF COALESCE((v_lot->>'quantity_kg')::numeric, 0) <= 0 THEN
      RAISE EXCEPTION 'Kvantiteten måste vara större än noll för alla partier.';
    END IF;

    INSERT INTO public.lots (
      lot_number, supplier_lot_id, product_id, quantity_kg, unit_cost, grade,
      best_before, catch_area, catch_date_from, fishing_gear, vessel_name,
      presentation, species_fao_code, latin_name, price_status, status, traceability_required
    ) VALUES (
      public.next_internal_lot_number(),
      NULLIF(v_lot->>'supplier_lot_number', ''),
      (v_lot->>'product_id')::uuid,
      (v_lot->>'quantity_kg')::numeric,
      NULLIF(v_lot->>'unit_cost', '')::numeric,
      NULLIF(v_lot->>'grade', ''),
      NULLIF(v_lot->>'best_before', '')::date,
      NULLIF(v_lot->>'catch_area', ''),
      NULLIF(v_lot->>'catch_date_from', '')::date,
      NULLIF(v_lot->>'fishing_gear', ''),
      NULLIF(v_lot->>'vessel_name', ''),
      NULLIF(v_lot->>'presentation', ''),
      NULLIF(v_lot->>'fao_code', ''),
      NULLIF(v_lot->>'latin_name', ''),
      'preliminar', 'aktiv', true
    ) RETURNING id INTO v_lot_id;

    INSERT INTO public.stock_movements (
      product_id, location_id, lot_id, movement_type, quantity_kg, unit_cost,
      reference_type, reference_id, note
    ) VALUES (
      (v_lot->>'product_id')::uuid,
      p_location_id,
      v_lot_id,
      'inleverans',
      (v_lot->>'quantity_kg')::numeric,
      NULLIF(v_lot->>'unit_cost', '')::numeric,
      'purchase_report',
      p_report_id,
      'Följesedel — parti ' || COALESCE(NULLIF(v_lot->>'supplier_lot_number', ''), 'utan leverantörsparti')
    ) RETURNING id INTO v_movement_id;

    SELECT array_agg(x::uuid) INTO v_line_ids
    FROM jsonb_array_elements_text(COALESCE(v_lot->'line_ids', '[]'::jsonb)) AS x;

    IF v_line_ids IS NOT NULL THEN
      UPDATE public.purchase_report_lines
      SET lot_id = v_lot_id,
          movement_id = v_movement_id,
          parent_line_id = CASE
            WHEN id = NULLIF(v_lot->>'parent_line_id', '')::uuid THEN NULL
            ELSE NULLIF(v_lot->>'parent_line_id', '')::uuid
          END
      WHERE id = ANY(v_line_ids);
    END IF;

    v_lot_ids := v_lot_ids || v_lot_id;
  END LOOP;

  UPDATE public.purchase_reports
  SET posted_at = now()
  WHERE id = p_report_id;

  RETURN v_lot_ids;
END;
$$;

REVOKE ALL ON FUNCTION public.post_purchase_report(uuid, uuid, jsonb) FROM public;
GRANT EXECUTE ON FUNCTION public.post_purchase_report(uuid, uuid, jsonb) TO authenticated;
GRANT EXECUTE ON FUNCTION public.post_purchase_report(uuid, uuid, jsonb) TO service_role;
GRANT EXECUTE ON FUNCTION public.next_internal_lot_number() TO authenticated, service_role;
GRANT USAGE ON SEQUENCE public.lot_number_seq TO authenticated, service_role;