CREATE TABLE public.stock_transformations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  store_id uuid REFERENCES public.stores(id) ON DELETE SET NULL,
  location_id uuid REFERENCES public.storage_locations(id) ON DELETE SET NULL,
  transform_kind text NOT NULL DEFAULT 'dela_upp',
  source_product_id uuid REFERENCES public.products(id) ON DELETE SET NULL,
  source_lot_id uuid REFERENCES public.lots(id) ON DELETE SET NULL,
  source_quantity numeric NOT NULL DEFAULT 0,
  target_product_id uuid REFERENCES public.products(id) ON DELETE SET NULL,
  target_lot_id uuid REFERENCES public.lots(id) ON DELETE SET NULL,
  target_quantity numeric NOT NULL DEFAULT 0,
  target_packages numeric,
  yield_pct numeric,
  waste_quantity numeric NOT NULL DEFAULT 0,
  waste_reason text,
  note text,
  performed_at timestamptz NOT NULL DEFAULT now(),
  performed_by uuid REFERENCES public.staff(id) ON DELETE SET NULL,
  performed_by_name text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.stock_transformations TO authenticated;
GRANT ALL ON public.stock_transformations TO service_role;

ALTER TABLE public.stock_transformations ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Staff access" ON public.stock_transformations
  FOR ALL TO authenticated USING (is_staff()) WITH CHECK (is_staff());

CREATE INDEX idx_stock_transformations_performed_at ON public.stock_transformations (performed_at DESC);
CREATE INDEX idx_stock_transformations_store ON public.stock_transformations (store_id);

CREATE TRIGGER update_stock_transformations_updated_at
  BEFORE UPDATE ON public.stock_transformations
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();