
CREATE TABLE public.price_lists (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  store_id uuid REFERENCES public.stores(id) ON DELETE CASCADE,
  created_by text,
  total_products integer NOT NULL DEFAULT 0,
  notes text,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE public.price_list_items (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  price_list_id uuid NOT NULL REFERENCES public.price_lists(id) ON DELETE CASCADE,
  product_id uuid REFERENCES public.products(id) ON DELETE SET NULL,
  product_name text NOT NULL,
  sku text,
  unit text,
  category text,
  price numeric NOT NULL DEFAULT 0,
  sort_order integer NOT NULL DEFAULT 0
);

CREATE INDEX idx_price_lists_store_id ON public.price_lists(store_id);
CREATE INDEX idx_price_list_items_list_id ON public.price_list_items(price_list_id);

ALTER TABLE public.price_lists ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.price_list_items ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Public access" ON public.price_lists FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "Public access" ON public.price_list_items FOR ALL USING (true) WITH CHECK (true);
