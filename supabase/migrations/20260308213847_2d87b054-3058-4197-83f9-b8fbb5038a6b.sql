
-- Production reports (sections/groups)
CREATE TABLE public.production_reports (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT now(),
  report_name TEXT NOT NULL,
  display_name TEXT,
  status TEXT NOT NULL DEFAULT 'Aktiv',
  total_quantity NUMERIC DEFAULT 0,
  notes TEXT
);

ALTER TABLE public.production_reports ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Public access" ON public.production_reports FOR ALL USING (true) WITH CHECK (true);

-- Production report lines
CREATE TABLE public.production_report_lines (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  report_id UUID NOT NULL REFERENCES public.production_reports(id) ON DELETE CASCADE,
  product_name TEXT NOT NULL,
  product_id UUID REFERENCES public.products(id),
  quantity NUMERIC NOT NULL DEFAULT 0,
  unit TEXT DEFAULT 'kg',
  status TEXT NOT NULL DEFAULT 'Producerad',
  production_date DATE DEFAULT CURRENT_DATE,
  operator TEXT,
  notes TEXT,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT now()
);

ALTER TABLE public.production_report_lines ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Public access" ON public.production_report_lines FOR ALL USING (true) WITH CHECK (true);
