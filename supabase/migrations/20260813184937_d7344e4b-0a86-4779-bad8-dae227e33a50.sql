-- Butiksmappning för Shopifys nycklar
CREATE TABLE public.shopify_store_map (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  key_type text NOT NULL CHECK (key_type IN ('shopifyLocationId','locationId','deliveryLocation')),
  key_value text NOT NULL,
  store_id uuid NOT NULL REFERENCES public.stores(id) ON DELETE CASCADE,
  label text,
  active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (key_type, key_value)
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.shopify_store_map TO authenticated;
GRANT ALL ON public.shopify_store_map TO service_role;
ALTER TABLE public.shopify_store_map ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Personal laser butiksmappning" ON public.shopify_store_map
  FOR SELECT TO authenticated USING (public.is_staff());
CREATE POLICY "Admin hanterar butiksmappning" ON public.shopify_store_map
  FOR ALL TO authenticated USING (public.has_role(auth.uid(),'admin')) WITH CHECK (public.has_role(auth.uid(),'admin'));
CREATE TRIGGER shopify_store_map_updated BEFORE UPDATE ON public.shopify_store_map
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- Händelselogg för webhooken
CREATE TABLE public.shopify_webhook_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  topic text NOT NULL DEFAULT 'orders/create',
  shopify_order_id text,
  shopify_order_number text,
  hmac_valid boolean NOT NULL DEFAULT false,
  status text NOT NULL DEFAULT 'mottagen'
    CHECK (status IN ('mottagen','skapad','osorterad','ogiltig_hmac','fel','duplikat')),
  error text,
  payload jsonb,
  store_id uuid REFERENCES public.stores(id) ON DELETE SET NULL,
  customer_order_id uuid REFERENCES public.customer_orders(id) ON DELETE SET NULL,
  resolved_by uuid,
  received_at timestamptz NOT NULL DEFAULT now(),
  processed_at timestamptz
);
CREATE INDEX shopify_webhook_events_status_idx ON public.shopify_webhook_events(status, received_at DESC);
CREATE INDEX shopify_webhook_events_order_idx ON public.shopify_webhook_events(shopify_order_id);
GRANT SELECT, UPDATE ON public.shopify_webhook_events TO authenticated;
GRANT ALL ON public.shopify_webhook_events TO service_role;
ALTER TABLE public.shopify_webhook_events ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Personal laser webbhandelser" ON public.shopify_webhook_events
  FOR SELECT TO authenticated USING (public.is_staff());
CREATE POLICY "Admin hanterar webbhandelser" ON public.shopify_webhook_events
  FOR ALL TO authenticated USING (public.has_role(auth.uid(),'admin')) WITH CHECK (public.has_role(auth.uid(),'admin'));

-- Bekräftade radkopplingar
CREATE TABLE public.shopify_product_map (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  shopify_sku text NOT NULL UNIQUE,
  shopify_title text,
  product_id uuid NOT NULL REFERENCES public.products(id) ON DELETE CASCADE,
  confirmed_by uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.shopify_product_map TO authenticated;
GRANT ALL ON public.shopify_product_map TO service_role;
ALTER TABLE public.shopify_product_map ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Personal hanterar radkopplingar" ON public.shopify_product_map
  FOR ALL TO authenticated USING (public.is_staff()) WITH CHECK (public.is_staff());
CREATE TRIGGER shopify_product_map_updated BEFORE UPDATE ON public.shopify_product_map
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- Kundorder: webbordrar
ALTER TABLE public.customer_orders
  ADD COLUMN shopify_order_id text,
  ADD COLUMN shopify_order_number text,
  ADD COLUMN is_web_order boolean NOT NULL DEFAULT false,
  ADD COLUMN web_paid boolean NOT NULL DEFAULT false,
  ADD COLUMN paid_total numeric,
  ADD COLUMN price_locked boolean NOT NULL DEFAULT false,
  ADD COLUMN wanted_time_window text,
  ADD COLUMN web_delivery_method text;
CREATE UNIQUE INDEX customer_orders_shopify_order_id_key
  ON public.customer_orders(shopify_order_id) WHERE shopify_order_id IS NOT NULL;

-- Orderrader: webbordrar
ALTER TABLE public.customer_order_lines
  ADD COLUMN shopify_line_id text,
  ADD COLUMN shopify_sku text,
  ADD COLUMN shopify_title text,
  ADD COLUMN paid_quantity numeric,
  ADD COLUMN price_locked boolean NOT NULL DEFAULT false,
  ADD COLUMN needs_product_match boolean NOT NULL DEFAULT false;

-- Förifylld mappning enligt verifierade ordrar
INSERT INTO public.shopify_store_map (key_type, key_value, store_id, label) VALUES
  ('shopifyLocationId','92316598538','eb3b69e6-cf80-4cef-aaba-c5fe2c5151d7','Ålsten'),
  ('shopifyLocationId','94113497354','b541f4c6-1ac0-4127-8af3-761ce3ecbbd7','Kungsholmen'),
  ('locationId','68016','eb3b69e6-cf80-4cef-aaba-c5fe2c5151d7','Ålsten (fallback)'),
  ('locationId','68020','b541f4c6-1ac0-4127-8af3-761ce3ecbbd7','Kungsholmen (fallback)'),
  ('deliveryLocation','Ålsten','eb3b69e6-cf80-4cef-aaba-c5fe2c5151d7','Adresstext Ålsten'),
  ('deliveryLocation','Kungsholmen','b541f4c6-1ac0-4127-8af3-761ce3ecbbd7','Adresstext Kungsholmen');