-- Add report_date column to purchase_reports
ALTER TABLE public.purchase_reports
  ADD COLUMN IF NOT EXISTS report_date DATE NOT NULL DEFAULT CURRENT_DATE;

-- Backfill existing rows from created_at
UPDATE public.purchase_reports
  SET report_date = (created_at AT TIME ZONE 'Europe/Stockholm')::date
  WHERE report_date = CURRENT_DATE AND created_at IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_purchase_reports_report_date ON public.purchase_reports(report_date);