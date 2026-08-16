-- 1. Merchant-konfiguration
CREATE TABLE public.sumup_merchants (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  merchant_code text NOT NULL UNIQUE,
  store_id uuid NOT NULL REFERENCES public.stores(id) ON DELETE CASCADE,
  legal_entity_id text NOT NULL REFERENCES public.legal_entities(legal_entity_id),
  currency text NOT NULL DEFAULT 'CHF',
  test_mode boolean NOT NULL DEFAULT false,
  active boolean NOT NULL DEFAULT true,
  label text,
  last_polled_at timestamptz,
  last_success_at timestamptz,
  last_transaction_at timestamptz,
  fail_streak integer NOT NULL DEFAULT 0,
  last_error text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT ON public.sumup_merchants TO authenticated;
GRANT ALL ON public.sumup_merchants TO service_role;
ALTER TABLE public.sumup_merchants ENABLE ROW LEVEL SECURITY;
CREATE POLICY "sumup_merchants_read" ON public.sumup_merchants FOR SELECT TO authenticated USING (public.is_staff());
CREATE POLICY "sumup_merchants_admin" ON public.sumup_merchants FOR ALL TO authenticated
  USING (public.has_role(auth.uid(), 'admin') OR public.is_platform_admin(auth.uid()))
  WITH CHECK (public.has_role(auth.uid(), 'admin') OR public.is_platform_admin(auth.uid()));
CREATE TRIGGER sumup_merchants_updated_at BEFORE UPDATE ON public.sumup_merchants
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- 2. Händelsekö
CREATE TABLE public.sumup_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  merchant_code text NOT NULL,
  external_id text NOT NULL,
  transaction_code text,
  event_type text NOT NULL DEFAULT 'PAYMENT',
  payload jsonb NOT NULL DEFAULT '{}'::jsonb,
  receipt_payload jsonb,
  status text NOT NULL DEFAULT 'koad',
  attempts integer NOT NULL DEFAULT 0,
  last_error text,
  transaction_id uuid REFERENCES public.pos_transactions(id) ON DELETE SET NULL,
  test_mode boolean NOT NULL DEFAULT false,
  occurred_at timestamptz,
  received_at timestamptz NOT NULL DEFAULT now(),
  processed_at timestamptz,
  CONSTRAINT sumup_events_unique UNIQUE (merchant_code, external_id)
);
CREATE INDEX sumup_events_status_idx ON public.sumup_events (status, received_at DESC);
GRANT SELECT ON public.sumup_events TO authenticated;
GRANT ALL ON public.sumup_events TO service_role;
ALTER TABLE public.sumup_events ENABLE ROW LEVEL SECURITY;
CREATE POLICY "sumup_events_read" ON public.sumup_events FOR SELECT TO authenticated USING (public.is_staff());

-- 3. Produktnamnsmappning
CREATE TABLE public.sumup_product_map (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  merchant_code text,
  external_name text NOT NULL,
  external_name_key text GENERATED ALWAYS AS (lower(btrim(external_name))) STORED,
  product_id uuid REFERENCES public.products(id) ON DELETE SET NULL,
  unit text,
  unmatched_count integer NOT NULL DEFAULT 0,
  last_seen_at timestamptz NOT NULL DEFAULT now(),
  confirmed_by uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX sumup_product_map_key_idx ON public.sumup_product_map (coalesce(merchant_code,''), external_name_key);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.sumup_product_map TO authenticated;
GRANT ALL ON public.sumup_product_map TO service_role;
ALTER TABLE public.sumup_product_map ENABLE ROW LEVEL SECURITY;
CREATE POLICY "sumup_product_map_read" ON public.sumup_product_map FOR SELECT TO authenticated USING (public.is_staff());
CREATE POLICY "sumup_product_map_write" ON public.sumup_product_map FOR ALL TO authenticated
  USING (public.is_staff()) WITH CHECK (public.is_staff());
CREATE TRIGGER sumup_product_map_updated_at BEFORE UPDATE ON public.sumup_product_map
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- 4. Körningslogg
CREATE TABLE public.sumup_poll_runs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  merchant_code text NOT NULL,
  started_at timestamptz NOT NULL DEFAULT now(),
  finished_at timestamptz,
  status text NOT NULL DEFAULT 'kord',
  fetched_count integer NOT NULL DEFAULT 0,
  queued_count integer NOT NULL DEFAULT 0,
  duplicate_count integer NOT NULL DEFAULT 0,
  http_status integer,
  error_code text,
  message text,
  changes_since timestamptz,
  test_mode boolean NOT NULL DEFAULT false
);
CREATE INDEX sumup_poll_runs_merchant_idx ON public.sumup_poll_runs (merchant_code, started_at DESC);
GRANT SELECT ON public.sumup_poll_runs TO authenticated;
GRANT ALL ON public.sumup_poll_runs TO service_role;
ALTER TABLE public.sumup_poll_runs ENABLE ROW LEVEL SECURITY;
CREATE POLICY "sumup_poll_runs_read" ON public.sumup_poll_runs FOR SELECT TO authenticated USING (public.is_staff());

-- 5. Valuta och viktvarufält på kassaregistret
ALTER TABLE public.pos_transactions ADD COLUMN IF NOT EXISTS currency text NOT NULL DEFAULT 'SEK';
ALTER TABLE public.pos_transaction_items ADD COLUMN IF NOT EXISTS quantity_source text;
ALTER TABLE public.pos_transaction_items ADD COLUMN IF NOT EXISTS external_quantity numeric;