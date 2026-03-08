
CREATE TABLE public.deleted_stock_log (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  product_id UUID NOT NULL REFERENCES public.products(id),
  location_id UUID NOT NULL REFERENCES public.storage_locations(id),
  quantity NUMERIC NOT NULL DEFAULT 0,
  reason TEXT NOT NULL,
  deleted_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  deleted_by TEXT
);

ALTER TABLE public.deleted_stock_log ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Public access" ON public.deleted_stock_log FOR ALL USING (true) WITH CHECK (true);
