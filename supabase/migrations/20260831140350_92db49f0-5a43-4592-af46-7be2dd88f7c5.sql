ALTER TABLE public.payroll_lines
  ADD COLUMN IF NOT EXISTS correction_action text NOT NULL DEFAULT 'upsert';

CREATE INDEX IF NOT EXISTS idx_payroll_lines_correction_action ON public.payroll_lines (period_id, correction_action) WHERE export_status = 'corrected';