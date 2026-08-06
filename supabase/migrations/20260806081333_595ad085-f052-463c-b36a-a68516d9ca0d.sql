CREATE TABLE public.daily_stock_sheets (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  store_id uuid NOT NULL REFERENCES public.stores(id) ON DELETE CASCADE,
  location_id uuid REFERENCES public.storage_locations(id) ON DELETE SET NULL,
  location_name text,
  sheet_date date NOT NULL DEFAULT (now() AT TIME ZONE 'Europe/Stockholm')::date,
  status text NOT NULL DEFAULT 'utkast',
  mode text NOT NULL DEFAULT 'digital',
  opened_by text,
  closed_by text,
  closed_at timestamp with time zone,
  notes text,
  opening_total_kg numeric(14,3) NOT NULL DEFAULT 0,
  received_total_kg numeric(14,3) NOT NULL DEFAULT 0,
  other_total_kg numeric(14,3) NOT NULL DEFAULT 0,
  counted_total_kg numeric(14,3) NOT NULL DEFAULT 0,
  sold_total_kg numeric(14,3) NOT NULL DEFAULT 0,
  diff_total_kg numeric(14,3) NOT NULL DEFAULT 0,
  diff_total_value numeric(14,2) NOT NULL DEFAULT 0,
  closing_value numeric(14,2) NOT NULL DEFAULT 0,
  line_count integer NOT NULL DEFAULT 0,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  updated_at timestamp with time zone NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.daily_stock_sheets TO authenticated, anon;
GRANT ALL ON public.daily_stock_sheets TO service_role;
ALTER TABLE public.daily_stock_sheets ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Public access" ON public.daily_stock_sheets FOR ALL USING (true) WITH CHECK (true);

CREATE UNIQUE INDEX daily_stock_sheets_unique_day ON public.daily_stock_sheets (store_id, coalesce(location_id, '00000000-0000-0000-0000-000000000000'::uuid), sheet_date);
CREATE INDEX daily_stock_sheets_date_idx ON public.daily_stock_sheets (store_id, sheet_date DESC);

CREATE TRIGGER trg_daily_stock_sheets_updated BEFORE UPDATE ON public.daily_stock_sheets
FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

CREATE TABLE public.daily_stock_sheet_lines (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  sheet_id uuid NOT NULL REFERENCES public.daily_stock_sheets(id) ON DELETE CASCADE,
  product_id uuid REFERENCES public.products(id) ON DELETE SET NULL,
  product_name text NOT NULL,
  sku text,
  unit text,
  category text,
  cost_price numeric(12,2) NOT NULL DEFAULT 0,
  opening_qty_kg numeric(14,3) NOT NULL DEFAULT 0,
  received_qty_kg numeric(14,3) NOT NULL DEFAULT 0,
  other_qty_kg numeric(14,3) NOT NULL DEFAULT 0,
  counted_qty_kg numeric(14,3),
  checked boolean NOT NULL DEFAULT false,
  sold_qty_kg numeric(14,3),
  diff_kg numeric(14,3),
  diff_value numeric(14,2),
  diff_reason text,
  note text,
  sort_order integer NOT NULL DEFAULT 0,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  updated_at timestamp with time zone NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.daily_stock_sheet_lines TO authenticated, anon;
GRANT ALL ON public.daily_stock_sheet_lines TO service_role;
ALTER TABLE public.daily_stock_sheet_lines ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Public access" ON public.daily_stock_sheet_lines FOR ALL USING (true) WITH CHECK (true);

CREATE INDEX daily_stock_sheet_lines_sheet_idx ON public.daily_stock_sheet_lines (sheet_id, sort_order);

CREATE TRIGGER trg_daily_stock_sheet_lines_updated BEFORE UPDATE ON public.daily_stock_sheet_lines
FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();