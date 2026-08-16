ALTER TABLE public.price_lists ADD COLUMN IF NOT EXISTS currency text NOT NULL DEFAULT 'SEK';

CREATE TABLE IF NOT EXISTS public.sumup_catalog_audits (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  merchant_code text NOT NULL,
  legal_entity_id text,
  store_id uuid REFERENCES public.stores(id) ON DELETE SET NULL,
  currency text NOT NULL DEFAULT 'CHF',
  source_filename text,
  row_count integer NOT NULL DEFAULT 0,
  matched_count integer NOT NULL DEFAULT 0,
  price_diff_count integer NOT NULL DEFAULT 0,
  missing_in_pos_count integer NOT NULL DEFAULT 0,
  missing_in_erp_count integer NOT NULL DEFAULT 0,
  details jsonb NOT NULL DEFAULT '[]'::jsonb,
  created_by uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.sumup_catalog_audits TO authenticated;
GRANT ALL ON public.sumup_catalog_audits TO service_role;

ALTER TABLE public.sumup_catalog_audits ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Staff can read catalog audits"
  ON public.sumup_catalog_audits FOR SELECT TO authenticated
  USING (public.is_staff() OR public.is_platform_admin(auth.uid()));

CREATE POLICY "Staff can create catalog audits"
  ON public.sumup_catalog_audits FOR INSERT TO authenticated
  WITH CHECK (public.is_staff() OR public.is_platform_admin(auth.uid()));

CREATE TRIGGER sumup_catalog_audits_updated_at
  BEFORE UPDATE ON public.sumup_catalog_audits
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

CREATE INDEX IF NOT EXISTS sumup_catalog_audits_merchant_idx
  ON public.sumup_catalog_audits (merchant_code, created_at DESC);