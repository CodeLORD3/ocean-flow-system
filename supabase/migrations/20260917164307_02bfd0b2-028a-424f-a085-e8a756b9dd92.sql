ALTER TABLE public.daily_reports
  ADD COLUMN IF NOT EXISTS currency text,
  ADD COLUMN IF NOT EXISTS vat_rate numeric;

UPDATE public.daily_reports dr
SET currency = s.currency
FROM public.stores s
WHERE dr.store_id = s.id AND dr.currency IS NULL;

UPDATE public.daily_reports dr
SET vat_rate = CASE WHEN dr.currency = 'CHF' THEN 2.6 ELSE 6 END
WHERE dr.vat_rate IS NULL;