
-- Table to store per-line receiving reports from shops
CREATE TABLE public.delivery_receiving_reports (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  shop_order_id UUID NOT NULL REFERENCES public.shop_orders(id) ON DELETE CASCADE,
  order_line_id UUID NOT NULL REFERENCES public.shop_order_lines(id) ON DELETE CASCADE,
  store_id UUID NOT NULL REFERENCES public.stores(id) ON DELETE CASCADE,
  status TEXT NOT NULL DEFAULT 'Godkänd', -- 'Godkänd' or 'Rapporterad'
  report_type TEXT, -- e.g. 'Skadad', 'Fel kvantitet', 'Dålig kvalitet', 'Saknas'
  notes TEXT,
  quantity_received NUMERIC,
  reported_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  reported_by TEXT
);

ALTER TABLE public.delivery_receiving_reports ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Public access" ON public.delivery_receiving_reports
  FOR ALL
  USING (true)
  WITH CHECK (true);

-- Enable realtime for delivery_receiving_reports
ALTER PUBLICATION supabase_realtime ADD TABLE public.delivery_receiving_reports;
