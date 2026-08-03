ALTER TABLE public.detail_prices ADD COLUMN IF NOT EXISTS reference_cost_per_kg numeric(12,2);

ALTER TABLE public.margin_targets
  ADD COLUMN IF NOT EXISTS scale_warn_low numeric(6,3) NOT NULL DEFAULT 0.75,
  ADD COLUMN IF NOT EXISTS scale_warn_high numeric(6,3) NOT NULL DEFAULT 1.25;

UPDATE public.detail_prices
SET reference_cost_per_kg = 120
WHERE species_group = 'torsk'
  AND price_list = 'butik_goteborg'
  AND detail_form IN ('rygg', 'kontrarygg', 'benfri filé', 'slag');

CREATE TABLE IF NOT EXISTS public.detail_price_applications (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  price_list text NOT NULL,
  species_group text NOT NULL,
  detail_form text NOT NULL,
  product_id uuid REFERENCES public.products(id) ON DELETE SET NULL,
  applied_price numeric(12,2) NOT NULL,
  reference_price numeric(12,2),
  scale_factor numeric(10,4),
  avg_cost_per_kg numeric(12,2),
  yield_pct numeric(6,2),
  manual_override boolean NOT NULL DEFAULT false,
  production_order_id uuid,
  applied_by text,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  updated_at timestamp with time zone NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.detail_price_applications TO authenticated;
GRANT ALL ON public.detail_price_applications TO service_role;

ALTER TABLE public.detail_price_applications ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Staff can manage detail_price_applications"
ON public.detail_price_applications FOR ALL TO authenticated
USING (true) WITH CHECK (true);

CREATE INDEX IF NOT EXISTS detail_price_applications_lookup_idx
  ON public.detail_price_applications (price_list, product_id, created_at DESC);

CREATE TRIGGER trg_detail_price_applications_updated
BEFORE UPDATE ON public.detail_price_applications
FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE TRIGGER normalize_species_group_trg
BEFORE INSERT OR UPDATE OF species_group ON public.detail_price_applications
FOR EACH ROW EXECUTE FUNCTION public.normalize_species_group();