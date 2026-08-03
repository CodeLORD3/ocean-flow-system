-- ============ PARTIER ============
CREATE TABLE public.lots (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  lot_number text NOT NULL UNIQUE,
  supplier_lot_id text,
  origin_lot_id text,
  product_id uuid REFERENCES public.products(id) ON DELETE SET NULL,
  species_fao_code text,
  latin_name text,
  commercial_name text,
  catch_area text,
  fishing_gear text,
  fishing_gear_code text,
  production_method text,
  is_thawed boolean NOT NULL DEFAULT false,
  catch_date_from date,
  catch_date_to date,
  vessel_name text,
  vessel_reg text,
  vessel_nation text,
  supplier_id uuid REFERENCES public.suppliers(id) ON DELETE SET NULL,
  grade text,
  presentation text,
  certificate text,
  certified_program text,
  best_before date,
  quantity_kg numeric(12,3) NOT NULL DEFAULT 0,
  unit_cost numeric(12,2),
  status text NOT NULL DEFAULT 'aktiv' CHECK (status IN ('aktiv','delvis_forbrukad','terminerad','sparrad')),
  terminated_reason text,
  traceability_required boolean NOT NULL DEFAULT true,
  exempt_until date,
  created_by uuid REFERENCES public.staff(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX idx_lots_supplier_lot ON public.lots(supplier_lot_id);
CREATE INDEX idx_lots_product ON public.lots(product_id);
CREATE INDEX idx_lots_best_before ON public.lots(best_before);
CREATE INDEX idx_lots_status ON public.lots(status);

GRANT SELECT, INSERT, UPDATE ON public.lots TO authenticated;
GRANT ALL ON public.lots TO service_role;
ALTER TABLE public.lots ENABLE ROW LEVEL SECURITY;
CREATE POLICY "lots_read" ON public.lots FOR SELECT TO authenticated USING (true);
CREATE POLICY "lots_insert" ON public.lots FOR INSERT TO authenticated WITH CHECK (true);
CREATE POLICY "lots_update" ON public.lots FOR UPDATE TO authenticated USING (true) WITH CHECK (true);

-- ============ PARTIOMVANDLINGAR ============
CREATE TABLE public.lot_transformations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  from_lot_id uuid NOT NULL REFERENCES public.lots(id) ON DELETE CASCADE,
  to_lot_id uuid NOT NULL REFERENCES public.lots(id) ON DELETE CASCADE,
  quantity_in_kg numeric(12,3) NOT NULL,
  quantity_out_kg numeric(12,3) NOT NULL,
  production_order_id uuid REFERENCES public.production_orders(id) ON DELETE SET NULL,
  created_by uuid REFERENCES public.staff(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX idx_lot_tf_from ON public.lot_transformations(from_lot_id);
CREATE INDEX idx_lot_tf_to ON public.lot_transformations(to_lot_id);
CREATE INDEX idx_lot_tf_order ON public.lot_transformations(production_order_id);

GRANT SELECT, INSERT ON public.lot_transformations TO authenticated;
GRANT ALL ON public.lot_transformations TO service_role;
ALTER TABLE public.lot_transformations ENABLE ROW LEVEL SECURITY;
CREATE POLICY "lot_tf_read" ON public.lot_transformations FOR SELECT TO authenticated USING (true);
CREATE POLICY "lot_tf_insert" ON public.lot_transformations FOR INSERT TO authenticated WITH CHECK (true);

-- ============ LAGERRÖRELSER ============
CREATE TABLE public.stock_movements (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  product_id uuid NOT NULL REFERENCES public.products(id) ON DELETE RESTRICT,
  location_id uuid NOT NULL REFERENCES public.storage_locations(id) ON DELETE RESTRICT,
  lot_id uuid REFERENCES public.lots(id) ON DELETE SET NULL,
  movement_type text NOT NULL CHECK (movement_type IN (
    'inleverans','tillverkning_in','tillverkning_ut','overforing_in','overforing_ut',
    'forsaljning','svinn','justering','inventering'
  )),
  quantity_kg numeric(12,3) NOT NULL CHECK (quantity_kg <> 0),
  quantity_pieces integer,
  unit_cost numeric(12,2),
  reference_type text,
  reference_id uuid,
  note text,
  created_by uuid REFERENCES public.staff(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX idx_sm_product_loc ON public.stock_movements(product_id, location_id, created_at DESC);
CREATE INDEX idx_sm_lot ON public.stock_movements(lot_id);
CREATE INDEX idx_sm_ref ON public.stock_movements(reference_type, reference_id);
CREATE INDEX idx_sm_type ON public.stock_movements(movement_type);

GRANT SELECT, INSERT ON public.stock_movements TO authenticated;
GRANT SELECT, INSERT ON public.stock_movements TO service_role;
ALTER TABLE public.stock_movements ENABLE ROW LEVEL SECURITY;
CREATE POLICY "sm_read" ON public.stock_movements FOR SELECT TO authenticated USING (true);
CREATE POLICY "sm_insert" ON public.stock_movements FOR INSERT TO authenticated WITH CHECK (true);

-- Rörelser är oföränderliga: ingen UPDATE- eller DELETE-policy finns.

-- ============ SALDOFÄLT ============
ALTER TABLE public.product_stock_locations
  ADD COLUMN IF NOT EXISTS avg_cost numeric(12,2) NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS stock_value numeric(14,2) NOT NULL DEFAULT 0;

-- ============ TRIGGER: saldo, snittkostpris och lagervärde ============
CREATE OR REPLACE FUNCTION public.apply_stock_movement()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  old_qty numeric(14,3) := 0;
  old_avg numeric(12,2) := 0;
  new_qty numeric(14,3);
  new_avg numeric(12,2);
BEGIN
  SELECT quantity, avg_cost INTO old_qty, old_avg
  FROM public.product_stock_locations
  WHERE product_id = NEW.product_id AND location_id = NEW.location_id
  FOR UPDATE;

  IF NOT FOUND THEN
    old_qty := 0;
    old_avg := 0;
  END IF;

  new_qty := COALESCE(old_qty, 0) + NEW.quantity_kg;
  new_avg := COALESCE(old_avg, 0);

  IF NEW.quantity_kg > 0 AND NEW.unit_cost IS NOT NULL THEN
    IF new_qty > 0 THEN
      new_avg := ROUND(
        ((GREATEST(COALESCE(old_qty, 0), 0) * COALESCE(old_avg, 0)) + (NEW.quantity_kg * NEW.unit_cost))
        / (GREATEST(COALESCE(old_qty, 0), 0) + NEW.quantity_kg), 2);
    ELSE
      new_avg := NEW.unit_cost;
    END IF;
  END IF;

  INSERT INTO public.product_stock_locations (product_id, location_id, quantity, avg_cost, stock_value, unit_cost, updated_at)
  VALUES (NEW.product_id, NEW.location_id, new_qty, new_avg, ROUND(new_qty * new_avg, 2), new_avg, now())
  ON CONFLICT (product_id, location_id) DO UPDATE
    SET quantity = new_qty,
        avg_cost = new_avg,
        stock_value = ROUND(new_qty * new_avg, 2),
        unit_cost = new_avg,
        updated_at = now();

  RETURN NEW;
END;
$$;

CREATE TRIGGER trg_apply_stock_movement
AFTER INSERT ON public.stock_movements
FOR EACH ROW EXECUTE FUNCTION public.apply_stock_movement();

-- ============ INLEVERANSRADER ============
ALTER TABLE public.incoming_delivery_lines
  ADD COLUMN IF NOT EXISTS location_id uuid REFERENCES public.storage_locations(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS lot_id uuid REFERENCES public.lots(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS price_status text NOT NULL DEFAULT 'preliminar' CHECK (price_status IN ('preliminar','bekraftad')),
  ADD COLUMN IF NOT EXISTS final_price_per_kg numeric(12,2),
  ADD COLUMN IF NOT EXISTS price_variance numeric(12,2);

-- ============ INVENTERINGSRADER ============
ALTER TABLE public.inventory_report_lines
  ADD COLUMN IF NOT EXISTS expected_qty_kg numeric(12,3),
  ADD COLUMN IF NOT EXISTS counted_qty_kg numeric(12,3),
  ADD COLUMN IF NOT EXISTS diff_kg numeric(12,3),
  ADD COLUMN IF NOT EXISTS diff_value numeric(12,2),
  ADD COLUMN IF NOT EXISTS diff_reason text;

ALTER TABLE public.inventory_reports
  ADD COLUMN IF NOT EXISTS status text NOT NULL DEFAULT 'godkand',
  ADD COLUMN IF NOT EXISTS started_at timestamptz,
  ADD COLUMN IF NOT EXISTS total_diff_kg numeric(12,3) NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS total_diff_value numeric(12,2) NOT NULL DEFAULT 0;

-- ============ PRODUKTER ============
ALTER TABLE public.products
  ADD COLUMN IF NOT EXISTS fao_code text,
  ADD COLUMN IF NOT EXISTS traceability_exempt boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS catch_weight boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS nominal_weight_kg numeric(8,3);

CREATE OR REPLACE FUNCTION public.product_traceability_required(_hs_code text, _exempt boolean)
RETURNS boolean
LANGUAGE sql
IMMUTABLE
SET search_path = public
AS $$
  SELECT CASE
    WHEN COALESCE(_exempt, false) THEN false
    WHEN _hs_code IS NULL THEN false
    WHEN regexp_replace(_hs_code, '[^0-9]', '', 'g') = '' THEN false
    ELSE left(regexp_replace(_hs_code, '[^0-9]', '', 'g') || '000000', 4)::int BETWEEN 300 AND 308
  END;
$$;