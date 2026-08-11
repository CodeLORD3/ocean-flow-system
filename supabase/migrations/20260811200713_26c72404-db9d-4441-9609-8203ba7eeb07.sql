ALTER TABLE public.customers_retail
  ADD COLUMN IF NOT EXISTS is_company boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS company_name text,
  ADD COLUMN IF NOT EXISTS org_number text,
  ADD COLUMN IF NOT EXISTS contact_reference text;

UPDATE public.customers_retail SET is_company = false WHERE is_company IS NULL;