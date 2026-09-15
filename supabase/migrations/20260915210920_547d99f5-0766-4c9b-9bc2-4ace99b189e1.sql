-- 1. Priskategorier (tiers)
CREATE TABLE public.price_tiers (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  name text NOT NULL,
  region text,
  currency text NOT NULL DEFAULT 'SEK',
  vat_rate numeric NOT NULL DEFAULT 12,
  sort_order integer NOT NULL DEFAULT 0,
  active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT ON public.price_tiers TO authenticated;
GRANT INSERT, UPDATE, DELETE ON public.price_tiers TO authenticated;
GRANT ALL ON public.price_tiers TO service_role;
ALTER TABLE public.price_tiers ENABLE ROW LEVEL SECURITY;

CREATE POLICY "price_tiers_read" ON public.price_tiers
  FOR SELECT TO authenticated USING (true);
CREATE POLICY "price_tiers_write" ON public.price_tiers
  FOR ALL TO authenticated
  USING (public.has_role(auth.uid(),'admin') OR public.has_role(auth.uid(),'platform_admin') OR public.has_role(auth.uid(),'wholesale_staff'))
  WITH CHECK (public.has_role(auth.uid(),'admin') OR public.has_role(auth.uid(),'platform_admin') OR public.has_role(auth.uid(),'wholesale_staff'));

CREATE TRIGGER price_tiers_touch BEFORE UPDATE ON public.price_tiers
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

INSERT INTO public.price_tiers (name, region, currency, vat_rate, sort_order) VALUES
  ('Göteborg / Väst', 'vast', 'SEK', 12, 1),
  ('Stockholm', 'stockholm', 'SEK', 12, 2),
  ('Schweiz', 'schweiz', 'CHF', 2.6, 3);

-- 2. Butik → priskategori
ALTER TABLE public.stores ADD COLUMN IF NOT EXISTS price_tier_id uuid REFERENCES public.price_tiers(id) ON DELETE SET NULL;

UPDATE public.stores s SET price_tier_id = t.id
FROM public.price_tiers t
WHERE t.region = s.region AND s.price_tier_id IS NULL;

-- 3. Grossistpriser per priskategori (historik: en rad per ändring)
CREATE TABLE public.wholesale_prices (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  product_id uuid NOT NULL REFERENCES public.products(id) ON DELETE CASCADE,
  price_tier_id uuid NOT NULL REFERENCES public.price_tiers(id) ON DELETE CASCADE,
  price numeric NOT NULL,
  currency text NOT NULL DEFAULT 'SEK',
  lock_mode text NOT NULL DEFAULT 'estimated',
  source_lot_id uuid REFERENCES public.lots(id) ON DELETE SET NULL,
  basis_cost numeric,
  margin_pct numeric,
  retail_suggested numeric,
  valid_from timestamptz NOT NULL DEFAULT now(),
  set_by text,
  note text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT wholesale_prices_lock_mode_chk CHECK (lock_mode IN ('locked','estimated'))
);

CREATE INDEX wholesale_prices_lookup_idx ON public.wholesale_prices (product_id, price_tier_id, valid_from DESC);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.wholesale_prices TO authenticated;
GRANT ALL ON public.wholesale_prices TO service_role;
ALTER TABLE public.wholesale_prices ENABLE ROW LEVEL SECURITY;

-- Butikspersonal ser bara sin egen priskategori; grossist/admin ser allt
CREATE POLICY "wholesale_prices_read" ON public.wholesale_prices
  FOR SELECT TO authenticated
  USING (
    public.has_role(auth.uid(),'admin')
    OR public.has_role(auth.uid(),'platform_admin')
    OR public.has_role(auth.uid(),'wholesale_staff')
    OR EXISTS (
      SELECT 1 FROM public.stores s
      WHERE s.price_tier_id = wholesale_prices.price_tier_id
        AND public.can_see_store(s.id)
    )
  );

CREATE POLICY "wholesale_prices_write" ON public.wholesale_prices
  FOR ALL TO authenticated
  USING (public.has_role(auth.uid(),'admin') OR public.has_role(auth.uid(),'platform_admin') OR public.has_role(auth.uid(),'wholesale_staff'))
  WITH CHECK (public.has_role(auth.uid(),'admin') OR public.has_role(auth.uid(),'platform_admin') OR public.has_role(auth.uid(),'wholesale_staff'));

CREATE TRIGGER wholesale_prices_touch BEFORE UPDATE ON public.wholesale_prices
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- 4. Aktuellt pris per produkt/priskategori
CREATE OR REPLACE VIEW public.wholesale_prices_current
WITH (security_invoker = true) AS
SELECT DISTINCT ON (product_id, price_tier_id)
  id, product_id, price_tier_id, price, currency, lock_mode, source_lot_id,
  basis_cost, margin_pct, retail_suggested, valid_from, set_by, note
FROM public.wholesale_prices
WHERE valid_from <= now()
ORDER BY product_id, price_tier_id, valid_from DESC, created_at DESC;

GRANT SELECT ON public.wholesale_prices_current TO authenticated;

-- 5. Inköpsprishistorik per produkt
CREATE OR REPLACE FUNCTION public.product_cost_history(_product_id uuid)
RETURNS TABLE(
  last_cost numeric,
  last_cost_at timestamptz,
  avg_cost_30d numeric,
  min_cost_90d numeric,
  max_cost_90d numeric,
  lots_30d integer
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  WITH l AS (
    SELECT unit_cost, created_at
    FROM public.lots
    WHERE product_id = _product_id AND unit_cost IS NOT NULL AND unit_cost > 0
  )
  SELECT
    (SELECT unit_cost FROM l ORDER BY created_at DESC LIMIT 1),
    (SELECT created_at FROM l ORDER BY created_at DESC LIMIT 1),
    (SELECT round(avg(unit_cost), 2) FROM l WHERE created_at > now() - interval '30 days'),
    (SELECT min(unit_cost) FROM l WHERE created_at > now() - interval '90 days'),
    (SELECT max(unit_cost) FROM l WHERE created_at > now() - interval '90 days'),
    (SELECT count(*)::int FROM l WHERE created_at > now() - interval '30 days');
$$;

REVOKE ALL ON FUNCTION public.product_cost_history(uuid) FROM anon;
GRANT EXECUTE ON FUNCTION public.product_cost_history(uuid) TO authenticated, service_role;

-- 6. Butikens gällande pris för en produkt
CREATE OR REPLACE FUNCTION public.wholesale_price_for(_product_id uuid, _store_id uuid)
RETURNS TABLE(price numeric, currency text, lock_mode text, price_tier_id uuid, valid_from timestamptz)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  WITH tier AS (
    SELECT s.price_tier_id AS id FROM public.stores s WHERE s.id = _store_id
  )
  SELECT wp.price, wp.currency, wp.lock_mode, wp.price_tier_id, wp.valid_from
  FROM public.wholesale_prices wp, tier
  WHERE wp.product_id = _product_id AND wp.price_tier_id = tier.id AND wp.valid_from <= now()
  ORDER BY wp.valid_from DESC, wp.created_at DESC
  LIMIT 1;
$$;

REVOKE ALL ON FUNCTION public.wholesale_price_for(uuid, uuid) FROM anon;
GRANT EXECUTE ON FUNCTION public.wholesale_price_for(uuid, uuid) TO authenticated, service_role;