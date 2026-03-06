
CREATE TABLE public.inventory_reports (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  store_id UUID NOT NULL REFERENCES public.stores(id) ON DELETE CASCADE,
  location_id UUID REFERENCES public.storage_locations(id) ON DELETE SET NULL,
  location_name TEXT,
  reported_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  reported_by TEXT,
  total_value NUMERIC NOT NULL DEFAULT 0,
  line_count INTEGER NOT NULL DEFAULT 0,
  notes TEXT
);

CREATE TABLE public.inventory_report_lines (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  report_id UUID NOT NULL REFERENCES public.inventory_reports(id) ON DELETE CASCADE,
  product_id UUID NOT NULL REFERENCES public.products(id) ON DELETE CASCADE,
  product_name TEXT NOT NULL,
  sku TEXT,
  unit TEXT,
  category TEXT,
  quantity NUMERIC NOT NULL DEFAULT 0,
  cost_price NUMERIC NOT NULL DEFAULT 0,
  line_value NUMERIC NOT NULL DEFAULT 0
);

ALTER TABLE public.inventory_reports ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.inventory_report_lines ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Public access" ON public.inventory_reports FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "Public access" ON public.inventory_report_lines FOR ALL USING (true) WITH CHECK (true);
