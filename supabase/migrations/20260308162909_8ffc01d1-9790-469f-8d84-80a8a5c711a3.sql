
-- Purchase reports table
CREATE TABLE public.purchase_reports (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  created_at TIMESTAMPTZ DEFAULT now(),
  file_name TEXT NOT NULL,
  file_url TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'Ny',
  notes TEXT,
  total_amount NUMERIC DEFAULT 0
);

ALTER TABLE public.purchase_reports ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Public access" ON public.purchase_reports FOR ALL USING (true) WITH CHECK (true);

-- Purchase report lines
CREATE TABLE public.purchase_report_lines (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  report_id UUID NOT NULL REFERENCES public.purchase_reports(id) ON DELETE CASCADE,
  product_name TEXT NOT NULL,
  quantity NUMERIC NOT NULL DEFAULT 0,
  unit TEXT DEFAULT 'kg',
  unit_price NUMERIC DEFAULT 0,
  line_total NUMERIC DEFAULT 0,
  product_id UUID REFERENCES public.products(id),
  created_at TIMESTAMPTZ DEFAULT now()
);

ALTER TABLE public.purchase_report_lines ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Public access" ON public.purchase_report_lines FOR ALL USING (true) WITH CHECK (true);

-- Storage bucket for följesedel uploads
INSERT INTO storage.buckets (id, name, public) VALUES ('purchase-documents', 'purchase-documents', true);

CREATE POLICY "Public upload" ON storage.objects FOR INSERT WITH CHECK (bucket_id = 'purchase-documents');
CREATE POLICY "Public read" ON storage.objects FOR SELECT USING (bucket_id = 'purchase-documents');
CREATE POLICY "Public delete" ON storage.objects FOR DELETE USING (bucket_id = 'purchase-documents');
