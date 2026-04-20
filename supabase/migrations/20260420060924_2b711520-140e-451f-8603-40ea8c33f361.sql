-- Currency settings for store-level conversion (single global row used by Zollikon)
CREATE TABLE IF NOT EXISTS public.currency_settings (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  sek_to_chf numeric NOT NULL DEFAULT 0.095,
  transport_chf_per_kg numeric NOT NULL DEFAULT 5,
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.currency_settings ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Public read currency_settings"
  ON public.currency_settings FOR SELECT
  USING (true);

CREATE POLICY "Public write currency_settings"
  ON public.currency_settings FOR ALL
  USING (true) WITH CHECK (true);

INSERT INTO public.currency_settings (sek_to_chf, transport_chf_per_kg)
SELECT 0.095, 5
WHERE NOT EXISTS (SELECT 1 FROM public.currency_settings);