
-- Drop old table and recreate with better structure
DROP TABLE IF EXISTS public.shop_reports;

-- Weekly/monthly reports header
CREATE TABLE public.shop_reports (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  store_id UUID NOT NULL REFERENCES public.stores(id) ON DELETE CASCADE,
  report_type TEXT NOT NULL DEFAULT 'weekly',
  year INTEGER NOT NULL,
  week_number INTEGER,
  report_month TEXT,
  opening_inventory NUMERIC NOT NULL DEFAULT 0,
  closing_inventory NUMERIC NOT NULL DEFAULT 0,
  notes TEXT,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT now()
);

-- Line items for sales and purchases
CREATE TABLE public.shop_report_lines (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  report_id UUID NOT NULL REFERENCES public.shop_reports(id) ON DELETE CASCADE,
  line_type TEXT NOT NULL,
  category TEXT NOT NULL,
  amount NUMERIC NOT NULL DEFAULT 0,
  notes TEXT
);

ALTER TABLE public.shop_reports ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.shop_report_lines ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Public access" ON public.shop_reports FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "Public access" ON public.shop_report_lines FOR ALL USING (true) WITH CHECK (true);

-- Unique constraint: one weekly report per store per week
CREATE UNIQUE INDEX shop_reports_weekly_unique ON public.shop_reports (store_id, year, week_number) WHERE report_type = 'weekly';
