
-- Add new columns to products for export/weight tracking
ALTER TABLE public.products ADD COLUMN IF NOT EXISTS hs_code text;
ALTER TABLE public.products ADD COLUMN IF NOT EXISTS weight_per_piece numeric DEFAULT 0;

-- Shop orders (weekly orders from each shop to production)
CREATE TABLE public.shop_orders (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  store_id uuid NOT NULL REFERENCES public.stores(id) ON DELETE CASCADE,
  order_week text NOT NULL, -- e.g. '2026-W10'
  status text NOT NULL DEFAULT 'Ny',
  created_at timestamptz DEFAULT now(),
  created_by text,
  notes text
);

ALTER TABLE public.shop_orders ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Public access" ON public.shop_orders FOR ALL USING (true) WITH CHECK (true);

-- Shop order lines
CREATE TABLE public.shop_order_lines (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  shop_order_id uuid NOT NULL REFERENCES public.shop_orders(id) ON DELETE CASCADE,
  product_id uuid NOT NULL REFERENCES public.products(id),
  quantity_ordered numeric NOT NULL DEFAULT 0,
  quantity_delivered numeric DEFAULT 0,
  unit text,
  order_date date,
  delivery_date date,
  deviation text,
  ordered_elsewhere text,
  status text DEFAULT '',
  category_section text
);

ALTER TABLE public.shop_order_lines ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Public access" ON public.shop_order_lines FOR ALL USING (true) WITH CHECK (true);

-- Enable realtime for shop orders
ALTER PUBLICATION supabase_realtime ADD TABLE public.shop_orders;
ALTER PUBLICATION supabase_realtime ADD TABLE public.shop_order_lines;
