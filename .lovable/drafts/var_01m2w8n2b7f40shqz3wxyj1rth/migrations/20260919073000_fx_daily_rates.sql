-- Dagliga växelkurser: CHF-omsättning ska kunna visas i SEK med dagens snittkurs.
CREATE TABLE IF NOT EXISTS public.fx_daily_rates (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  rate_date date NOT NULL,
  base_currency text NOT NULL,
  quote_currency text NOT NULL DEFAULT 'SEK',
  rate numeric(14,6) NOT NULL,
  source text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT fx_daily_rates_unique UNIQUE (rate_date, base_currency, quote_currency)
);

CREATE INDEX IF NOT EXISTS fx_daily_rates_date_idx
  ON public.fx_daily_rates (rate_date DESC, base_currency);

GRANT SELECT ON public.fx_daily_rates TO authenticated;
GRANT ALL ON public.fx_daily_rates TO service_role;

ALTER TABLE public.fx_daily_rates ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Staff can read fx rates"
  ON public.fx_daily_rates FOR SELECT TO authenticated
  USING (public.is_staff());

CREATE TRIGGER trg_fx_daily_rates_updated
  BEFORE UPDATE ON public.fx_daily_rates
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
