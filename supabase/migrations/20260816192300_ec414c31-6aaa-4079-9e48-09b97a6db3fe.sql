CREATE TABLE public.sumup_reconciliations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  merchant_code text NOT NULL,
  recon_date date NOT NULL,
  currency text NOT NULL DEFAULT 'CHF',
  sumup_count integer NOT NULL DEFAULT 0,
  sumup_total_minor bigint NOT NULL DEFAULT 0,
  local_count integer NOT NULL DEFAULT 0,
  local_total_minor bigint NOT NULL DEFAULT 0,
  diff_minor bigint NOT NULL DEFAULT 0,
  missing_external_ids jsonb NOT NULL DEFAULT '[]'::jsonb,
  refetched_count integer NOT NULL DEFAULT 0,
  receipt_filled_count integer NOT NULL DEFAULT 0,
  status text NOT NULL DEFAULT 'ok',
  message text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (merchant_code, recon_date)
);

GRANT SELECT ON public.sumup_reconciliations TO authenticated;
GRANT ALL ON public.sumup_reconciliations TO service_role;

ALTER TABLE public.sumup_reconciliations ENABLE ROW LEVEL SECURITY;

CREATE POLICY "sumup_reconciliations_read" ON public.sumup_reconciliations
FOR SELECT TO authenticated USING (public.is_staff());

CREATE TRIGGER sumup_reconciliations_updated_at
BEFORE UPDATE ON public.sumup_reconciliations
FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

CREATE INDEX sumup_reconciliations_date_idx ON public.sumup_reconciliations (recon_date DESC);