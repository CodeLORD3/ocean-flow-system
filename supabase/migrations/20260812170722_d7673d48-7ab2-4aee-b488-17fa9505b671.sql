-- 1. Sorteringsregister per artgrupp
CREATE TABLE public.size_grades (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  species_group text NOT NULL,
  grade_no integer NOT NULL,
  label text,
  min_weight_kg numeric,
  max_weight_kg numeric,
  min_count_per_kg integer,
  max_count_per_kg integer,
  note text,
  active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (species_group, grade_no)
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.size_grades TO authenticated;
GRANT ALL ON public.size_grades TO service_role;

ALTER TABLE public.size_grades ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Inloggade kan läsa sorteringsregistret"
  ON public.size_grades FOR SELECT TO authenticated USING (true);

CREATE POLICY "Personal kan hantera sorteringsregistret"
  ON public.size_grades FOR ALL TO authenticated
  USING (public.is_staff()) WITH CHECK (public.is_staff());

CREATE TRIGGER size_grades_set_updated_at
  BEFORE UPDATE ON public.size_grades
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- 2. Produktfält
ALTER TABLE public.products
  ADD COLUMN IF NOT EXISTS purchasable boolean NOT NULL DEFAULT true,
  ADD COLUMN IF NOT EXISTS size_grade_id uuid REFERENCES public.size_grades(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS products_size_grade_idx ON public.products(size_grade_id);

-- 3. Styckningsmodell per sorteringsklass (null = alla storlekar)
ALTER TABLE public.species_cut_models
  ADD COLUMN IF NOT EXISTS size_grade integer;

-- 4. Klasser enligt EU 2406/96 (viktgränser justeras i registret)
INSERT INTO public.size_grades (species_group, grade_no, label, min_weight_kg, max_weight_kg, min_count_per_kg, max_count_per_kg, note) VALUES
  ('torsk',1,'1',7,NULL,NULL,NULL,'EU 2406/96'),
  ('torsk',2,'2',4,7,NULL,NULL,'EU 2406/96'),
  ('torsk',3,'3',2,4,NULL,NULL,'EU 2406/96'),
  ('torsk',4,'4',1,2,NULL,NULL,'EU 2406/96'),
  ('torsk',5,'5',0.3,1,NULL,NULL,'EU 2406/96'),
  ('sej',1,'1',5,NULL,NULL,NULL,'EU 2406/96'),
  ('sej',2,'2',3,5,NULL,NULL,'EU 2406/96'),
  ('sej',3,'3',1.5,3,NULL,NULL,'EU 2406/96'),
  ('sej',4,'4',0.3,1.5,NULL,NULL,'EU 2406/96'),
  ('kolja',1,'1',1,NULL,NULL,NULL,'EU 2406/96'),
  ('kolja',2,'2',0.57,1,NULL,NULL,'EU 2406/96'),
  ('kolja',3,'3',0.37,0.57,NULL,NULL,'EU 2406/96'),
  ('kolja',4,'4',0.17,0.37,NULL,NULL,'EU 2406/96'),
  ('kummel',1,'1',2.5,NULL,NULL,NULL,'EU 2406/96'),
  ('kummel',2,'2',1.2,2.5,NULL,NULL,'EU 2406/96'),
  ('kummel',3,'3',0.6,1.2,NULL,NULL,'EU 2406/96'),
  ('kummel',4,'4',0.28,0.6,NULL,NULL,'EU 2406/96'),
  ('kummel',5,'5',0.2,0.28,NULL,NULL,'EU 2406/96'),
  ('langa',1,'1',5,NULL,NULL,NULL,'EU 2406/96'),
  ('langa',2,'2',3,5,NULL,NULL,'EU 2406/96'),
  ('langa',3,'3',1.5,3,NULL,NULL,'EU 2406/96'),
  ('marulk',1,'1',8,NULL,NULL,NULL,'EU 2406/96, hel'),
  ('marulk',2,'2',4,8,NULL,NULL,'EU 2406/96, hel'),
  ('marulk',3,'3',2,4,NULL,NULL,'EU 2406/96, hel'),
  ('marulk',4,'4',1,2,NULL,NULL,'EU 2406/96, hel'),
  ('marulk',5,'5',0.5,1,NULL,NULL,'EU 2406/96, hel'),
  ('rodspatta',1,'1',0.6,NULL,NULL,NULL,'EU 2406/96'),
  ('rodspatta',2,'2',0.4,0.6,NULL,NULL,'EU 2406/96'),
  ('rodspatta',3,'3',0.3,0.4,NULL,NULL,'EU 2406/96'),
  ('rodspatta',4,'4',0.15,0.3,NULL,NULL,'EU 2406/96'),
  ('rodtunga',1,'1',0.28,NULL,NULL,NULL,'EU 2406/96'),
  ('rodtunga',2,'2',0.2,0.28,NULL,NULL,'EU 2406/96'),
  ('rodtunga',3,'3',0.1,0.2,NULL,NULL,'EU 2406/96'),
  ('bergtunga',1,'1',0.6,NULL,NULL,NULL,'EU 2406/96'),
  ('bergtunga',2,'2',0.3,0.6,NULL,NULL,'EU 2406/96'),
  ('bergtunga',3,'3',0.15,0.3,NULL,NULL,'EU 2406/96'),
  ('sjotunga',1,'1',0.5,NULL,NULL,NULL,'EU 2406/96'),
  ('sjotunga',2,'2',0.33,0.5,NULL,NULL,'EU 2406/96'),
  ('sjotunga',3,'3',0.25,0.33,NULL,NULL,'EU 2406/96'),
  ('sjotunga',4,'4',0.17,0.25,NULL,NULL,'EU 2406/96'),
  ('sjotunga',5,'5',0.12,0.17,NULL,NULL,'EU 2406/96'),
  ('piggvar',1,'1',5,NULL,NULL,NULL,'EU 2406/96'),
  ('piggvar',2,'2',3,5,NULL,NULL,'EU 2406/96'),
  ('piggvar',3,'3',2,3,NULL,NULL,'EU 2406/96'),
  ('piggvar',4,'4',1,2,NULL,NULL,'EU 2406/96'),
  ('slatvar',1,'1',2,NULL,NULL,NULL,'EU 2406/96'),
  ('slatvar',2,'2',1,2,NULL,NULL,'EU 2406/96'),
  ('slatvar',3,'3',0.5,1,NULL,NULL,'EU 2406/96'),
  ('sillflundra',1,'1',0.25,NULL,NULL,NULL,'EU 2406/96'),
  ('sillflundra',2,'2',0.13,0.25,NULL,NULL,'EU 2406/96'),
  ('halleflundra',1,'1',5,NULL,NULL,NULL,'EU 2406/96'),
  ('halleflundra',2,'2',2,5,NULL,NULL,'EU 2406/96'),
  ('halleflundra',3,'3',1,2,NULL,NULL,'EU 2406/96'),
  ('makrill',1,'1',0.5,NULL,NULL,NULL,'EU 2406/96'),
  ('makrill',2,'2',0.2,0.5,NULL,NULL,'EU 2406/96'),
  ('makrill',3,'3',0.1,0.2,NULL,NULL,'EU 2406/96'),
  ('makrill',4,'4',0.05,0.1,NULL,NULL,'EU 2406/96'),
  ('havskrafta',1,'1-5 XL',NULL,NULL,1,5,'Antal per kg'),
  ('havskrafta',2,'6-10 L',NULL,NULL,6,10,'Antal per kg'),
  ('havskrafta',3,'11-15 M',NULL,NULL,11,15,'Antal per kg'),
  ('havskrafta',4,'16-20 S',NULL,NULL,16,20,'Antal per kg'),
  ('havskrafta',5,'21-30',NULL,NULL,21,30,'Antal per kg');

-- 5. Storleksvarianter på hel fisk, en gemensam uppsättning per art
DO $$
DECLARE
  s record; g record; base public.products; parent public.products; new_sku text;
BEGIN
  FOR s IN SELECT DISTINCT species_group FROM public.size_grades WHERE species_group <> 'havskrafta' LOOP
    SELECT p.* INTO base FROM public.products p
      WHERE p.species_group = s.species_group AND p.name ILIKE 'Hel %Svensk' AND p.active
      ORDER BY p.created_at LIMIT 1;
    IF base.id IS NULL THEN CONTINUE; END IF;
    SELECT p.* INTO parent FROM public.products p WHERE p.id = base.parent_product_id;
    IF parent.id IS NULL THEN CONTINUE; END IF;

    FOR g IN SELECT * FROM public.size_grades WHERE species_group = s.species_group ORDER BY grade_no LOOP
      new_sku := parent.sku || '-HEL-' || g.grade_no;
      IF EXISTS (SELECT 1 FROM public.products WHERE sku = new_sku) THEN
        UPDATE public.products SET size_grade_id = g.id, purchasable = true, active = true WHERE sku = new_sku;
      ELSE
        INSERT INTO public.products (
          sku, name, category, unit, cost_price, wholesale_price, retail_suggested, stock,
          parent_product_id, species_group, latin_name, fao_code, shelf_life_days, hs_code,
          catch_weight, requires_processing, traceability_exempt, active, purchasable, size_grade_id
        ) VALUES (
          new_sku, 'Hel ' || parent.name || ' ' || g.grade_no, base.category, base.unit, 0, 0, 0, 0,
          parent.id, base.species_group, base.latin_name, base.fao_code, base.shelf_life_days, base.hs_code,
          base.catch_weight, base.requires_processing, base.traceability_exempt, true, true, g.id
        );
      END IF;
    END LOOP;
  END LOOP;
END $$;

-- 6. Havskräftornas befintliga storlekar kopplas, inga nya skapas
UPDATE public.products p SET size_grade_id = g.id
FROM public.size_grades g
WHERE g.species_group = 'havskrafta'
  AND p.sku = CASE g.grade_no
    WHEN 1 THEN 'HAVS-001-R-XL'
    WHEN 2 THEN 'HAVS-001-R-L'
    WHEN 3 THEN 'HAVS-001-R-M'
    WHEN 4 THEN 'HAVS-001-R-S'
  END;

-- 7. Grundprodukterna spärras för inköp (behålls som förälder i registret)
UPDATE public.products p SET purchasable = false
WHERE p.size_grade_id IS NULL
  AND EXISTS (SELECT 1 FROM public.size_grades g WHERE g.species_group = p.species_group)
  AND (p.name ILIKE 'Hel %' OR p.sku = 'HAVS-001');

-- 8. Omklassning av befintligt parti till rätt storleksvariant
CREATE OR REPLACE FUNCTION public.reclassify_lot_product(_lot_id uuid, _new_product_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_lot public.lots;
  v_new public.products;
  v_old public.products;
  r record;
  v_cost numeric;
  v_moved numeric := 0;
  v_locs integer := 0;
  v_note text;
BEGIN
  SELECT * INTO v_lot FROM public.lots WHERE id = _lot_id;
  IF v_lot.id IS NULL THEN RAISE EXCEPTION 'Partiet finns inte'; END IF;
  SELECT * INTO v_new FROM public.products WHERE id = _new_product_id;
  IF v_new.id IS NULL THEN RAISE EXCEPTION 'Produkten finns inte'; END IF;
  IF v_new.purchasable IS NOT TRUE THEN RAISE EXCEPTION 'Målprodukten är inte inköpsbar'; END IF;
  IF v_new.id = v_lot.product_id THEN RAISE EXCEPTION 'Partiet ligger redan på den produkten'; END IF;
  SELECT * INTO v_old FROM public.products WHERE id = v_lot.product_id;
  IF v_old.id IS NULL THEN RAISE EXCEPTION 'Partiets nuvarande produkt saknas'; END IF;
  IF v_old.species_group IS DISTINCT FROM v_new.species_group THEN
    RAISE EXCEPTION 'Omklassning kan bara ske inom samma artgrupp';
  END IF;

  v_cost := NULLIF(COALESCE(v_lot.unit_cost, 0), 0);
  v_note := 'Omklassning storlek: ' || v_old.sku || ' -> ' || v_new.sku;

  FOR r IN
    SELECT location_id, round(sum(quantity_kg), 3) AS qty
    FROM public.stock_movements
    WHERE lot_id = _lot_id
    GROUP BY location_id
    HAVING round(sum(quantity_kg), 3) > 0
  LOOP
    INSERT INTO public.stock_movements
      (product_id, location_id, lot_id, movement_type, quantity_kg, unit_cost, reference_type, reference_id, note)
    VALUES
      (v_lot.product_id, r.location_id, _lot_id, 'overforing_ut', -r.qty, v_cost, 'lot_reclass', _lot_id, v_note),
      (_new_product_id, r.location_id, _lot_id, 'overforing_in', r.qty, v_cost, 'lot_reclass', _lot_id, v_note);
    v_moved := v_moved + r.qty;
    v_locs := v_locs + 1;
  END LOOP;

  UPDATE public.lots
     SET product_id = _new_product_id,
         commercial_name = v_new.name,
         updated_at = now()
   WHERE id = _lot_id;

  INSERT INTO public.activity_logs (action_type, description, entity_type, entity_id, details)
  VALUES ('update',
          'Parti omklassat: ' || v_lot.lot_number || ' (' || v_old.sku || ' -> ' || v_new.sku || ')',
          'lot', _lot_id::text,
          jsonb_build_object('from_sku', v_old.sku, 'to_sku', v_new.sku, 'kg', v_moved, 'locations', v_locs));

  RETURN jsonb_build_object('lot_number', v_lot.lot_number, 'kg', v_moved, 'locations', v_locs);
END;
$$;

GRANT EXECUTE ON FUNCTION public.reclassify_lot_product(uuid, uuid) TO authenticated;