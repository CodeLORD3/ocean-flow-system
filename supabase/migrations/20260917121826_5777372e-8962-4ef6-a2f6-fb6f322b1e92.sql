ALTER TABLE public.important_papers
  ADD COLUMN IF NOT EXISTS payment_method text
  CHECK (payment_method IS NULL OR payment_method IN ('kort','kontant'));