ALTER TABLE public.employments ADD COLUMN IF NOT EXISTS bexio_employee_id text;
CREATE UNIQUE INDEX IF NOT EXISTS employees_alt_clock_identifier_key
  ON public.employees (alt_clock_identifier) WHERE alt_clock_identifier IS NOT NULL;