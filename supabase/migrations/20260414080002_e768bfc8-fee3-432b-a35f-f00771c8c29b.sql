
CREATE TABLE public.meeting_protocols (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  store_id UUID NOT NULL REFERENCES public.stores(id) ON DELETE CASCADE,
  meeting_date DATE NOT NULL DEFAULT CURRENT_DATE,
  title TEXT NOT NULL DEFAULT '',
  attendees TEXT,
  notes TEXT,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

ALTER TABLE public.meeting_protocols ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Public access meeting_protocols"
ON public.meeting_protocols FOR ALL
USING (true) WITH CHECK (true);

CREATE TABLE public.meeting_protocol_items (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  protocol_id UUID NOT NULL REFERENCES public.meeting_protocols(id) ON DELETE CASCADE,
  content TEXT NOT NULL DEFAULT '',
  sort_order INTEGER NOT NULL DEFAULT 0,
  completed BOOLEAN NOT NULL DEFAULT false
);

ALTER TABLE public.meeting_protocol_items ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Public access meeting_protocol_items"
ON public.meeting_protocol_items FOR ALL
USING (true) WITH CHECK (true);
