ALTER TABLE public.important_papers
  ADD COLUMN IF NOT EXISTS company_website text,
  ADD COLUMN IF NOT EXISTS company_logo_url text;