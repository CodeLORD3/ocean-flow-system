-- 1. Skydda historik mot produktradering (SET NULL -> RESTRICT)
ALTER TABLE public.customer_order_lines DROP CONSTRAINT customer_order_lines_product_id_fkey;
ALTER TABLE public.customer_order_lines ADD CONSTRAINT customer_order_lines_product_id_fkey
  FOREIGN KEY (product_id) REFERENCES public.products(id) ON DELETE RESTRICT;

ALTER TABLE public.customer_order_lines DROP CONSTRAINT customer_order_lines_original_product_id_fkey;
ALTER TABLE public.customer_order_lines ADD CONSTRAINT customer_order_lines_original_product_id_fkey
  FOREIGN KEY (original_product_id) REFERENCES public.products(id) ON DELETE RESTRICT;

ALTER TABLE public.daily_stock_sheet_lines DROP CONSTRAINT daily_stock_sheet_lines_product_id_fkey;
ALTER TABLE public.daily_stock_sheet_lines ADD CONSTRAINT daily_stock_sheet_lines_product_id_fkey
  FOREIGN KEY (product_id) REFERENCES public.products(id) ON DELETE RESTRICT;

ALTER TABLE public.price_list_items DROP CONSTRAINT price_list_items_product_id_fkey;
ALTER TABLE public.price_list_items ADD CONSTRAINT price_list_items_product_id_fkey
  FOREIGN KEY (product_id) REFERENCES public.products(id) ON DELETE RESTRICT;

ALTER TABLE public.detail_price_applications DROP CONSTRAINT detail_price_applications_product_id_fkey;
ALTER TABLE public.detail_price_applications ADD CONSTRAINT detail_price_applications_product_id_fkey
  FOREIGN KEY (product_id) REFERENCES public.products(id) ON DELETE RESTRICT;

-- 2. Anläggningar (853/2004)
CREATE TABLE public.establishments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  approval_number text,
  identification_mark text,
  mark_image text,
  approval_type text,
  control_authority text,
  legal_entity_id text REFERENCES public.legal_entities(legal_entity_id) ON DELETE SET NULL,
  registered_at date,
  valid_to date,
  active boolean NOT NULL DEFAULT true,
  note text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.establishments TO authenticated;
GRANT ALL ON public.establishments TO service_role;
ALTER TABLE public.establishments ENABLE ROW LEVEL SECURITY;

CREATE POLICY "establishments_read" ON public.establishments
  FOR SELECT TO authenticated USING (public.is_staff());
CREATE POLICY "establishments_write" ON public.establishments
  FOR INSERT TO authenticated WITH CHECK (public.is_staff_manager());
CREATE POLICY "establishments_update" ON public.establishments
  FOR UPDATE TO authenticated USING (public.is_staff_manager());
CREATE POLICY "establishments_delete" ON public.establishments
  FOR DELETE TO authenticated USING (public.has_role(auth.uid(), 'admin'));

CREATE TRIGGER trg_establishments_updated BEFORE UPDATE ON public.establishments
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- 3. Koppling och kravflagga
ALTER TABLE public.stores
  ADD COLUMN IF NOT EXISTS establishment_id uuid REFERENCES public.establishments(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS requires_identification_mark boolean NOT NULL DEFAULT false;

ALTER TABLE public.storage_locations
  ADD COLUMN IF NOT EXISTS establishment_id uuid REFERENCES public.establishments(id) ON DELETE SET NULL;

ALTER TABLE public.customers
  ADD COLUMN IF NOT EXISTS requires_identification_mark boolean NOT NULL DEFAULT false;

ALTER TABLE public.customers_retail
  ADD COLUMN IF NOT EXISTS requires_identification_mark boolean NOT NULL DEFAULT false;

CREATE INDEX IF NOT EXISTS idx_stores_establishment ON public.stores(establishment_id);
CREATE INDEX IF NOT EXISTS idx_storage_locations_establishment ON public.storage_locations(establishment_id);