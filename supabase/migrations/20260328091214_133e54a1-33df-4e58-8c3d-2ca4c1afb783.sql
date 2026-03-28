
CREATE TABLE public.schedule_events (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  event_date DATE NOT NULL,
  title TEXT NOT NULL,
  description TEXT,
  event_type TEXT NOT NULL DEFAULT 'note',
  severity TEXT NOT NULL DEFAULT 'info',
  portal TEXT NOT NULL DEFAULT 'wholesale',
  store_id UUID REFERENCES public.stores(id),
  all_day BOOLEAN NOT NULL DEFAULT true,
  start_time TEXT,
  end_time TEXT,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  created_by TEXT
);

ALTER TABLE public.schedule_events ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Public access" ON public.schedule_events FOR ALL TO public USING (true) WITH CHECK (true);
