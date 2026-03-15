
CREATE TABLE public.manual_schedule_entries (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  product_id UUID REFERENCES public.products(id) ON DELETE CASCADE NOT NULL,
  quantity NUMERIC NOT NULL DEFAULT 0,
  departure_date DATE NOT NULL,
  departure_time TEXT NOT NULL DEFAULT '06:00',
  schedule_type TEXT NOT NULL DEFAULT 'purchase',
  notes TEXT,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

ALTER TABLE public.manual_schedule_entries ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Public access" ON public.manual_schedule_entries FOR ALL TO public USING (true) WITH CHECK (true);
