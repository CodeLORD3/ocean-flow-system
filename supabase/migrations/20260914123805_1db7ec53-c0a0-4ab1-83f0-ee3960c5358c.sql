ALTER TABLE public.employments
  ADD COLUMN IF NOT EXISTS ob_50 boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS ob_70 boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS ob_100 boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS ob_source text;

ALTER TABLE public.employees
  ADD COLUMN IF NOT EXISTS is_test boolean NOT NULL DEFAULT false;

CREATE INDEX IF NOT EXISTS employees_is_test_idx ON public.employees (is_test) WHERE is_test;