-- 1. Standardmodellen "hel"
INSERT INTO public.cut_model_splits (cut_model, detail_form, detail_name, pct_of_fillet, role, is_optional, sort_order)
VALUES ('hel', 'hel', 'Hel', 100, 'main', false, 1)
ON CONFLICT DO NOTHING;

INSERT INTO public.species_cut_models (species_group, cut_model, note)
SELECT g, 'hel', 'Standardmodell: säljs hel, ingen styckning.'
FROM (VALUES
  ('abalone'),('argentinsk-rodraka'),('blamussla'),('calamari'),('carabinero'),
  ('drottningkammussla'),('flodkrafta'),('gronmussla'),('havskrafta'),('hjartmussla'),
  ('hummer-amerikansk'),('hummer-europeisk'),('kammussla'),('knivmussla'),('kungskrabba'),
  ('langust'),('mandelmussla'),('octopus'),('ostron-gigas'),('ostron-platt'),
  ('raka-nordhav'),('signalkrafta'),('snokrabba'),('softshell-crab'),('strandsnacka'),
  ('taskkrabba'),('tigerraka'),('valthornssnacka'),('vannameiraka'),('venusmussla'),('vongole')
) AS t(g)
WHERE NOT EXISTS (
  SELECT 1 FROM public.species_cut_models m WHERE public.species_key(m.species_group) = public.species_key(t.g)
);

-- Fiskarter som fileas får inte modellen "hel"
INSERT INTO public.species_cut_models (species_group, cut_model)
SELECT 'gos', 'single'
WHERE NOT EXISTS (SELECT 1 FROM public.species_cut_models WHERE public.species_key(species_group) = 'gos');
INSERT INTO public.species_cut_models (species_group, cut_model)
SELECT 'stillahavslax', 'salmon_side'
WHERE NOT EXISTS (SELECT 1 FROM public.species_cut_models WHERE public.species_key(species_group) = 'stillahavslax');

-- 2. Huvuddetaljer (role = main)
UPDATE public.cut_model_splits SET role = 'main'
 WHERE (cut_model, detail_form) IN (
   ('loin_four','rygg'), ('loin_whole','loin'), ('salmon_side','rygg'),
   ('flatfish','hel filé'), ('tail_only','stjärt'), ('single','hel filé'));

UPDATE public.cut_model_splits SET role = 'byproduct'
 WHERE role NOT IN ('main','byproduct');

DELETE FROM public.cut_model_splits
 WHERE cut_model = 'flatfish' AND detail_form IN ('kotlett','fletch');

-- 3. Undantagsflagga på produktkategori
ALTER TABLE public.categories
  ADD COLUMN IF NOT EXISTS exempt_species_data boolean NOT NULL DEFAULT false;

UPDATE public.categories SET exempt_species_data = true
 WHERE name IN ('Emballage & Förbrukning','Konserver & Torkat','Såser & Röror','Löjrom & Kaviar','Delikatesser');

-- 4. Nollställning av lagersaldon: admin, förhandsvisning, orsak och partirader
-- Förhandsvisning: saldorader som avviker från rörelseloggen och därmed skulle nollas/rättas.
CREATE OR REPLACE FUNCTION public.preview_stock_zeroing()
RETURNS TABLE (
  product_id uuid,
  product_name text,
  sku text,
  location_id uuid,
  location_name text,
  balance_qty numeric,
  ledger_qty numeric,
  diff_qty numeric,
  stock_value numeric
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT psl.product_id,
         p.name,
         p.sku,
         psl.location_id,
         sl.name,
         ROUND(COALESCE(psl.quantity, 0), 3),
         ROUND(COALESCE(led.qty, 0), 3),
         ROUND(COALESCE(led.qty, 0) - COALESCE(psl.quantity, 0), 3),
         ROUND(COALESCE(psl.stock_value, 0), 2)
    FROM public.product_stock_locations psl
    JOIN public.products p ON p.id = psl.product_id
    JOIN public.storage_locations sl ON sl.id = psl.location_id
    LEFT JOIN (
      SELECT m.product_id, m.location_id, SUM(m.quantity_kg) AS qty
        FROM public.stock_movements m
       GROUP BY m.product_id, m.location_id
    ) led ON led.product_id = psl.product_id AND led.location_id = psl.location_id
   WHERE ROUND(COALESCE(psl.quantity, 0), 3) <> ROUND(COALESCE(led.qty, 0), 3)
   ORDER BY sl.name, p.name;
$$;

REVOKE ALL ON FUNCTION public.preview_stock_zeroing() FROM public;
GRANT EXECUTE ON FUNCTION public.preview_stock_zeroing() TO authenticated;

-- Nollställning: endast admin, tvingande orsak, en justeringsrad per parti.
CREATE OR REPLACE FUNCTION public.zero_stock_balances(_rows jsonb, _reason text)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  r record;
  lot record;
  left_qty numeric;
  take numeric;
  moves integer := 0;
  rows_done integer := 0;
BEGIN
  IF NOT public.has_role(auth.uid(), 'admin') THEN
    RAISE EXCEPTION 'Endast administratör får nollställa lagersaldon.';
  END IF;
  IF _reason IS NULL OR length(btrim(_reason)) < 5 THEN
    RAISE EXCEPTION 'Ange en orsak till nollställningen (minst 5 tecken).';
  END IF;
  IF _rows IS NULL OR jsonb_typeof(_rows) <> 'array' OR jsonb_array_length(_rows) = 0 THEN
    RAISE EXCEPTION 'Inga saldorader angivna.';
  END IF;

  FOR r IN
    SELECT (e->>'product_id')::uuid AS product_id,
           (e->>'location_id')::uuid AS location_id
      FROM jsonb_array_elements(_rows) e
  LOOP
    SELECT ROUND(COALESCE(quantity, 0), 3) INTO left_qty
      FROM public.product_stock_locations
     WHERE product_id = r.product_id AND location_id = r.location_id;

    IF left_qty IS NULL OR left_qty = 0 THEN CONTINUE; END IF;
    rows_done := rows_done + 1;

    -- Partier med saldo på platsen bär nollningen, kortast hållbarhet först.
    IF left_qty > 0 THEN
      FOR lot IN
        SELECT m.lot_id, ROUND(SUM(m.quantity_kg), 3) AS qty, MIN(l.best_before) AS bb
          FROM public.stock_movements m
          JOIN public.lots l ON l.id = m.lot_id
         WHERE m.product_id = r.product_id AND m.location_id = r.location_id AND m.lot_id IS NOT NULL
         GROUP BY m.lot_id
        HAVING ROUND(SUM(m.quantity_kg), 3) > 0
         ORDER BY MIN(l.best_before) NULLS LAST
      LOOP
        EXIT WHEN left_qty <= 0;
        take := LEAST(left_qty, lot.qty);
        INSERT INTO public.stock_movements
          (product_id, location_id, lot_id, movement_type, quantity_kg, reference_type, note, created_by)
        VALUES (r.product_id, r.location_id, lot.lot_id, 'justering', -take, 'nollstallning',
                'Nollställning: ' || btrim(_reason), auth.uid());
        moves := moves + 1;
        left_qty := ROUND(left_qty - take, 3);
      END LOOP;
    END IF;

    -- Rest utan partikoppling (eller negativt saldo) bokförs som en egen rad.
    IF left_qty <> 0 THEN
      INSERT INTO public.stock_movements
        (product_id, location_id, movement_type, quantity_kg, reference_type, note, created_by)
      VALUES (r.product_id, r.location_id, 'justering', -left_qty, 'nollstallning',
              'Nollställning utan partikoppling: ' || btrim(_reason), auth.uid());
      moves := moves + 1;
    END IF;
  END LOOP;

  INSERT INTO public.activity_logs (portal, action_type, description, entity_type, details)
  VALUES ('admin', 'stock_zeroing',
          'Nollställning av lagersaldon: ' || btrim(_reason),
          'product_stock_locations',
          jsonb_build_object('rows', rows_done, 'movements', moves, 'reason', btrim(_reason), 'requested', _rows));

  RETURN jsonb_build_object('rows', rows_done, 'movements', moves);
END;
$$;

REVOKE ALL ON FUNCTION public.zero_stock_balances(jsonb, text) FROM public;
GRANT EXECUTE ON FUNCTION public.zero_stock_balances(jsonb, text) TO authenticated;

-- Omräkningen nollar inte längre rader i tysthet: den rättar bara rader som
-- rörelseloggen faktiskt har underlag för och rapporterar övriga för granskning.
CREATE OR REPLACE FUNCTION public.rebuild_stock_from_movements()
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  touched integer := 0;
  needs_zeroing integer := 0;
BEGIN
  IF NOT public.has_role(auth.uid(), 'admin') THEN
    RAISE EXCEPTION 'Endast administratör får räkna om lagersaldon.';
  END IF;

  PERFORM set_config('app.stock_ledger', 'on', true);

  WITH agg AS (
    SELECT m.product_id,
           m.location_id,
           ROUND(SUM(m.quantity_kg)::numeric, 3) AS qty,
           CASE
             WHEN SUM(CASE WHEN m.quantity_kg > 0 AND m.unit_cost IS NOT NULL THEN m.quantity_kg ELSE 0 END) > 0
             THEN ROUND(
                    SUM(CASE WHEN m.quantity_kg > 0 AND m.unit_cost IS NOT NULL THEN m.quantity_kg * m.unit_cost ELSE 0 END)
                    / SUM(CASE WHEN m.quantity_kg > 0 AND m.unit_cost IS NOT NULL THEN m.quantity_kg ELSE 0 END), 2)
             ELSE NULL
           END AS avg_cost
      FROM public.stock_movements m
     GROUP BY m.product_id, m.location_id
  ), upserted AS (
    INSERT INTO public.product_stock_locations (product_id, location_id, quantity, avg_cost, unit_cost, stock_value, updated_at)
    SELECT a.product_id, a.location_id, a.qty, COALESCE(a.avg_cost, 0), COALESCE(a.avg_cost, 0),
           ROUND(a.qty * COALESCE(a.avg_cost, 0), 2), now()
      FROM agg a
    ON CONFLICT (product_id, location_id) DO UPDATE
      SET quantity = EXCLUDED.quantity,
          avg_cost = EXCLUDED.avg_cost,
          unit_cost = EXCLUDED.unit_cost,
          stock_value = EXCLUDED.stock_value,
          updated_at = now()
    RETURNING 1
  )
  SELECT count(*) INTO touched FROM upserted;

  SELECT count(*) INTO needs_zeroing
    FROM public.product_stock_locations psl
   WHERE COALESCE(psl.quantity, 0) <> 0
     AND NOT EXISTS (
       SELECT 1 FROM public.stock_movements m
        WHERE m.product_id = psl.product_id AND m.location_id = psl.location_id);

  PERFORM set_config('app.stock_ledger', 'off', true);

  INSERT INTO public.activity_logs (portal, action_type, description, entity_type, details)
  VALUES ('admin', 'stock_rebuild', 'Omräkning av lagersaldon från rörelseloggen', 'product_stock_locations',
          jsonb_build_object('rebuilt_rows', touched, 'needs_zeroing', needs_zeroing));

  RETURN jsonb_build_object('rebuilt_rows', touched, 'zeroed_rows', 0, 'needs_zeroing', needs_zeroing);
END;
$$;

REVOKE ALL ON FUNCTION public.rebuild_stock_from_movements() FROM public;
GRANT EXECUTE ON FUNCTION public.rebuild_stock_from_movements() TO authenticated;