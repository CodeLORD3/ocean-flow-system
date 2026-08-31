ALTER TABLE public.payroll_lines
  ADD COLUMN IF NOT EXISTS line_key text,
  ALTER COLUMN fortnox_transaction_id TYPE text USING fortnox_transaction_id::text;

CREATE INDEX IF NOT EXISTS idx_payroll_lines_period_line_key ON public.payroll_lines (period_id, line_key);
CREATE INDEX IF NOT EXISTS idx_payroll_lines_fortnox_transaction ON public.payroll_lines (fortnox_transaction_id) WHERE fortnox_transaction_id IS NOT NULL;