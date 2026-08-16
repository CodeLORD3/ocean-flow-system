CREATE TABLE public.shopify_shops (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  shop_domain text NOT NULL UNIQUE,
  label text NOT NULL,
  legal_entity_id text REFERENCES public.legal_entities(legal_entity_id),
  currency text NOT NULL DEFAULT 'SEK',
  default_store_id uuid REFERENCES public.stores(id),
  sort_by_pickup_location boolean NOT NULL DEFAULT true,
  webhook_secret_env text NOT NULL,
  admin_token_env text NOT NULL,
  api_version text NOT NULL DEFAULT '2024-10',
  active boolean NOT NULL DEFAULT true,
  last_webhook_at timestamp with time zone,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  updated_at timestamp with time zone NOT NULL DEFAULT now()
);

GRANT SELECT ON public.shopify_shops TO authenticated;
GRANT INSERT, UPDATE, DELETE ON public.shopify_shops TO authenticated;
GRANT ALL ON public.shopify_shops TO service_role;

ALTER TABLE public.shopify_shops ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Personal kan lasa shopify-butiker"
  ON public.shopify_shops FOR SELECT TO authenticated USING (public.is_staff());

CREATE POLICY "Admin kan hantera shopify-butiker"
  ON public.shopify_shops FOR ALL TO authenticated
  USING (public.has_role(auth.uid(), 'admin') OR public.is_platform_admin(auth.uid()))
  WITH CHECK (public.has_role(auth.uid(), 'admin') OR public.is_platform_admin(auth.uid()));

CREATE TRIGGER shopify_shops_updated_at
  BEFORE UPDATE ON public.shopify_shops
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

INSERT INTO public.shopify_shops
  (shop_domain, label, legal_entity_id, currency, default_store_id, sort_by_pickup_location, webhook_secret_env, admin_token_env)
VALUES
  ('fiskskaldjur.myshopify.com', 'Sverige (fiskskaldjur.se)', 'fsab-se', 'SEK', NULL, true,
   'SHOPIFY_SE_WEBHOOK_SECRET', 'SHOPIFY_SE_ADMIN_TOKEN'),
  ('fiskskaldjur-ch.myshopify.com', 'Schweiz (fiskskaldjur.ch)', 'fsab-ch', 'CHF',
   (SELECT id FROM public.stores WHERE name = 'Fiskskaldjur Zollikon'), false,
   'SHOPIFY_CH_WEBHOOK_SECRET', 'SHOPIFY_CH_ADMIN_TOKEN');

ALTER TABLE public.shopify_webhook_events
  ADD COLUMN IF NOT EXISTS shop_domain text,
  ADD COLUMN IF NOT EXISTS shop_id uuid REFERENCES public.shopify_shops(id);

CREATE INDEX IF NOT EXISTS shopify_webhook_events_shop_order_topic_idx
  ON public.shopify_webhook_events (shop_domain, shopify_order_id, topic);

ALTER TABLE public.shopify_product_map
  ADD COLUMN IF NOT EXISTS shop_id uuid REFERENCES public.shopify_shops(id),
  ADD COLUMN IF NOT EXISTS store_id uuid REFERENCES public.stores(id),
  ADD COLUMN IF NOT EXISTS shopify_handle text,
  ADD COLUMN IF NOT EXISTS shopify_variant text,
  ADD COLUMN IF NOT EXISTS quantity_factor numeric NOT NULL DEFAULT 1,
  ADD COLUMN IF NOT EXISTS free_text_only boolean NOT NULL DEFAULT false;

ALTER TABLE public.customer_orders
  ADD COLUMN IF NOT EXISTS currency text NOT NULL DEFAULT 'SEK',
  ADD COLUMN IF NOT EXISTS fx_rate_to_sek numeric,
  ADD COLUMN IF NOT EXISTS fx_rate_at timestamp with time zone;