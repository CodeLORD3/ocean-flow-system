
CREATE TABLE public.shop_reports (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  store_id UUID NOT NULL REFERENCES public.stores(id) ON DELETE CASCADE,
  report_month TEXT NOT NULL,
  purchase NUMERIC NOT NULL DEFAULT 0,
  sales NUMERIC NOT NULL DEFAULT 0,
  opening_inventory NUMERIC NOT NULL DEFAULT 0,
  closing_inventory NUMERIC NOT NULL DEFAULT 0,
  notes TEXT,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT now(),
  UNIQUE (store_id, report_month)
);

ALTER TABLE public.shop_reports ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Public access" ON public.shop_reports FOR ALL USING (true) WITH CHECK (true);
