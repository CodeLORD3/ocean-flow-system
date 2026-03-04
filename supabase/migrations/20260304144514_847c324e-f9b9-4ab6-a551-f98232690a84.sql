
-- Storage locations (e.g. "Kyl 1", "Frys", "Torrt lager", per warehouse/store)
CREATE TABLE public.storage_locations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  store_id uuid REFERENCES public.stores(id) ON DELETE CASCADE,
  zone text, -- e.g. Kyl, Frys, Torrt
  description text,
  created_at timestamptz DEFAULT now()
);

ALTER TABLE public.storage_locations ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Public access" ON public.storage_locations FOR ALL USING (true) WITH CHECK (true);

-- Stock per product per location
CREATE TABLE public.product_stock_locations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  product_id uuid NOT NULL REFERENCES public.products(id) ON DELETE CASCADE,
  location_id uuid NOT NULL REFERENCES public.storage_locations(id) ON DELETE CASCADE,
  quantity numeric NOT NULL DEFAULT 0,
  min_stock numeric DEFAULT 0,
  updated_at timestamptz DEFAULT now(),
  UNIQUE(product_id, location_id)
);

ALTER TABLE public.product_stock_locations ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Public access" ON public.product_stock_locations FOR ALL USING (true) WITH CHECK (true);
