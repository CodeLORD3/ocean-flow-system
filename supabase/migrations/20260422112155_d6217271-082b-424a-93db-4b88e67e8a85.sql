-- =========================================================
-- Scomber Commerce layer
-- All writes go through edge functions; tables are private.
-- =========================================================

-- Customer tiers (used by price matrix)
CREATE TABLE public.scomber_customer_tiers (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  code text NOT NULL UNIQUE,            -- e.g. 'walk_in', 'restaurant_a', 'restaurant_b'
  name text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

-- Store / channel configs
CREATE TABLE public.store_configs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  store_id uuid,                        -- nullable = global
  channel text NOT NULL CHECK (channel IN ('pos','b2b','morning')),
  key text NOT NULL,
  value jsonb NOT NULL DEFAULT '{}'::jsonb,
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (store_id, channel, key)
);

-- Cached read-models from Makrilltrade MySQL (read-only mirror)
CREATE TABLE public.makrilltrade_articles_cache (
  article_id text PRIMARY KEY,          -- Makrilltrade native id
  sku text,
  name text NOT NULL,
  category text,
  unit text NOT NULL DEFAULT 'kg',
  vat_rate numeric NOT NULL DEFAULT 12,
  default_price_ore integer NOT NULL DEFAULT 0,
  active boolean NOT NULL DEFAULT true,
  raw jsonb,
  synced_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE public.makrilltrade_batches_cache (
  batch_id text PRIMARY KEY,            -- Makrilltrade native id
  article_id text NOT NULL REFERENCES public.makrilltrade_articles_cache(article_id) ON DELETE CASCADE,
  supplier_name text,
  caught_at date,
  best_before date,
  quantity_remaining numeric NOT NULL DEFAULT 0,
  unit text NOT NULL DEFAULT 'kg',
  raw jsonb,
  synced_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX idx_mkt_batches_article ON public.makrilltrade_batches_cache(article_id);

-- Daily price overrides — full matrix (article × store × channel × tier × date)
CREATE TABLE public.price_overrides (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  effective_date date NOT NULL DEFAULT CURRENT_DATE,
  article_id text NOT NULL REFERENCES public.makrilltrade_articles_cache(article_id) ON DELETE CASCADE,
  store_id uuid,                        -- nullable = all stores
  channel text NOT NULL CHECK (channel IN ('pos','b2b','morning','any')) DEFAULT 'any',
  customer_tier_id uuid REFERENCES public.scomber_customer_tiers(id) ON DELETE CASCADE,
  price_ore integer NOT NULL CHECK (price_ore >= 0),
  set_by text,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (effective_date, article_id, store_id, channel, customer_tier_id)
);

CREATE INDEX idx_price_overrides_lookup
  ON public.price_overrides(effective_date, article_id, channel);

-- B2B orders (restaurant invoices)
CREATE TABLE public.b2b_orders (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  order_no bigserial UNIQUE,
  customer_tier_id uuid REFERENCES public.scomber_customer_tiers(id),
  customer_name text NOT NULL,
  customer_org_no text,
  customer_email text,
  delivery_date date,
  store_id uuid,
  status text NOT NULL DEFAULT 'draft' CHECK (status IN ('draft','confirmed','delivered','invoiced','cancelled')),
  total_ore integer NOT NULL DEFAULT 0,
  vat_breakdown jsonb NOT NULL DEFAULT '{}'::jsonb,
  notes text,
  created_by text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE public.b2b_order_lines (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  order_id uuid NOT NULL REFERENCES public.b2b_orders(id) ON DELETE CASCADE,
  article_id text NOT NULL REFERENCES public.makrilltrade_articles_cache(article_id),
  product_name text NOT NULL,
  quantity numeric NOT NULL,
  unit text NOT NULL,
  unit_price_ore integer NOT NULL,
  line_total_ore integer NOT NULL,
  vat_rate numeric NOT NULL
);

CREATE INDEX idx_b2b_order_lines_order ON public.b2b_order_lines(order_id);

-- Batch traceability — every sold line points at a batch
CREATE TABLE public.batch_allocations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  batch_id text NOT NULL REFERENCES public.makrilltrade_batches_cache(batch_id),
  article_id text NOT NULL,
  source_type text NOT NULL CHECK (source_type IN ('pos_transaction_item','b2b_order_line')),
  source_id uuid NOT NULL,
  quantity numeric NOT NULL,
  unit text NOT NULL,
  allocated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX idx_batch_alloc_source ON public.batch_allocations(source_type, source_id);
CREATE INDEX idx_batch_alloc_batch ON public.batch_allocations(batch_id);

-- updated_at triggers
CREATE TRIGGER trg_store_configs_updated
  BEFORE UPDATE ON public.store_configs
  FOR EACH ROW EXECUTE FUNCTION public.pos_set_updated_at();

CREATE TRIGGER trg_b2b_orders_updated
  BEFORE UPDATE ON public.b2b_orders
  FOR EACH ROW EXECUTE FUNCTION public.pos_set_updated_at();

-- =========================================================
-- RLS — strict: no anon/authenticated access. Service role only.
-- =========================================================
ALTER TABLE public.scomber_customer_tiers       ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.store_configs                ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.makrilltrade_articles_cache  ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.makrilltrade_batches_cache   ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.price_overrides              ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.b2b_orders                   ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.b2b_order_lines              ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.batch_allocations            ENABLE ROW LEVEL SECURITY;

-- Deliberately NO policies created. Service role bypasses RLS,
-- so edge functions using SUPABASE_SERVICE_ROLE_KEY can read/write,
-- while anon/authenticated clients are blocked entirely.

-- Seed a couple of customer tiers so the API has something to reference
INSERT INTO public.scomber_customer_tiers (code, name) VALUES
  ('walk_in',      'Privatkund (kassan)'),
  ('restaurant_a', 'Restaurang – nivå A'),
  ('restaurant_b', 'Restaurang – nivå B');
