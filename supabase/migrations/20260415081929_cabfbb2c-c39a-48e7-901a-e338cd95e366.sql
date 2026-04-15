
-- Main weekly report
CREATE TABLE public.weekly_reports (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  store_id UUID NOT NULL REFERENCES public.stores(id) ON DELETE CASCADE,
  year INTEGER NOT NULL,
  week_number INTEGER NOT NULL,
  status TEXT NOT NULL DEFAULT 'draft',
  opening_inventory NUMERIC NOT NULL DEFAULT 0,
  closing_inventory NUMERIC NOT NULL DEFAULT 0,
  inventory_change NUMERIC NOT NULL DEFAULT 0,
  total_costs NUMERIC NOT NULL DEFAULT 0,
  total_sales NUMERIC NOT NULL DEFAULT 0,
  gross_margin NUMERIC NOT NULL DEFAULT 0,
  gross_margin_pct NUMERIC NOT NULL DEFAULT 0,
  notes TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(store_id, year, week_number)
);

ALTER TABLE public.weekly_reports ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Public access weekly_reports" ON public.weekly_reports FOR ALL USING (true) WITH CHECK (true);

-- Inventory lines
CREATE TABLE public.weekly_report_inventory_lines (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  report_id UUID NOT NULL REFERENCES public.weekly_reports(id) ON DELETE CASCADE,
  product_id UUID NOT NULL REFERENCES public.products(id),
  quantity NUMERIC NOT NULL DEFAULT 0,
  unit TEXT NOT NULL DEFAULT 'kg',
  unit_price NUMERIC NOT NULL DEFAULT 0,
  total NUMERIC NOT NULL DEFAULT 0
);

ALTER TABLE public.weekly_report_inventory_lines ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Public access weekly_report_inventory_lines" ON public.weekly_report_inventory_lines FOR ALL USING (true) WITH CHECK (true);

-- Cost lines
CREATE TABLE public.weekly_report_cost_lines (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  report_id UUID NOT NULL REFERENCES public.weekly_reports(id) ON DELETE CASCADE,
  label TEXT NOT NULL,
  amount NUMERIC NOT NULL DEFAULT 0,
  sort_order INTEGER NOT NULL DEFAULT 0
);

ALTER TABLE public.weekly_report_cost_lines ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Public access weekly_report_cost_lines" ON public.weekly_report_cost_lines FOR ALL USING (true) WITH CHECK (true);

-- Sales lines
CREATE TABLE public.weekly_report_sales_lines (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  report_id UUID NOT NULL REFERENCES public.weekly_reports(id) ON DELETE CASCADE,
  channel TEXT NOT NULL,
  quantity INTEGER NOT NULL DEFAULT 0,
  amount NUMERIC NOT NULL DEFAULT 0,
  last_year_amount NUMERIC,
  sort_order INTEGER NOT NULL DEFAULT 0
);

ALTER TABLE public.weekly_report_sales_lines ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Public access weekly_report_sales_lines" ON public.weekly_report_sales_lines FOR ALL USING (true) WITH CHECK (true);

-- Social media lines
CREATE TABLE public.weekly_report_social_lines (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  report_id UUID NOT NULL REFERENCES public.weekly_reports(id) ON DELETE CASCADE,
  platform TEXT NOT NULL,
  opening_followers INTEGER NOT NULL DEFAULT 0,
  closing_followers INTEGER NOT NULL DEFAULT 0,
  follower_change INTEGER NOT NULL DEFAULT 0,
  posts_count INTEGER NOT NULL DEFAULT 0,
  sort_order INTEGER NOT NULL DEFAULT 0
);

ALTER TABLE public.weekly_report_social_lines ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Public access weekly_report_social_lines" ON public.weekly_report_social_lines FOR ALL USING (true) WITH CHECK (true);
