-- Pricing rules (used by morning-suggest to compute target prices)
CREATE TABLE IF NOT EXISTS public.scomber_pricing_rules (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  article_id text NOT NULL REFERENCES public.makrilltrade_articles_cache(article_id) ON DELETE CASCADE,
  strategy text NOT NULL DEFAULT 'markup' CHECK (strategy IN ('markup','target-margin','fixed')),
  markup_percent numeric DEFAULT NULL,
  target_margin_percent numeric DEFAULT NULL,
  fixed_price_ore integer DEFAULT NULL,
  min_price_ore integer DEFAULT NULL,
  max_price_ore integer DEFAULT NULL,
  store_multiplier jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(article_id)
);

CREATE INDEX IF NOT EXISTS idx_pricing_rules_article ON public.scomber_pricing_rules(article_id);

ALTER TABLE public.scomber_pricing_rules ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Public read scomber_pricing_rules"
  ON public.scomber_pricing_rules FOR SELECT
  USING (true);

CREATE POLICY "Public manage scomber_pricing_rules"
  ON public.scomber_pricing_rules FOR ALL
  USING (true) WITH CHECK (true);

CREATE TRIGGER scomber_pricing_rules_updated
  BEFORE UPDATE ON public.scomber_pricing_rules
  FOR EACH ROW EXECUTE FUNCTION public.pos_set_updated_at();

-- Open RLS for the cache tables so the POS UI can query traceability data directly.
-- (writes still go through the service-role edge functions only)
ALTER TABLE public.makrilltrade_articles_cache ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.makrilltrade_batches_cache ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.batch_allocations ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Public read articles cache"
  ON public.makrilltrade_articles_cache FOR SELECT USING (true);

CREATE POLICY "Public read batches cache"
  ON public.makrilltrade_batches_cache FOR SELECT USING (true);

CREATE POLICY "Public read batch allocations"
  ON public.batch_allocations FOR SELECT USING (true);