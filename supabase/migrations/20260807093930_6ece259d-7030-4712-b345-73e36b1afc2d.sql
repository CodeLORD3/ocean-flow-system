CREATE TABLE public.daily_reports (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  store_id uuid NOT NULL REFERENCES public.stores(id) ON DELETE CASCADE,
  report_date date NOT NULL,
  gross_sales numeric(12,2),
  net_sales numeric(12,2),
  receipt_count integer,
  largest_sale numeric(12,2),
  staff_entries jsonb NOT NULL DEFAULT '[]'::jsonb,
  staff_notes text,
  waste_items jsonb NOT NULL DEFAULT '[]'::jsonb,
  comment text,
  created_by text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (store_id, report_date)
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.daily_reports TO authenticated;
GRANT ALL ON public.daily_reports TO service_role;

ALTER TABLE public.daily_reports ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Authenticated can manage daily reports"
ON public.daily_reports FOR ALL TO authenticated
USING (true) WITH CHECK (true);

CREATE TRIGGER trg_daily_reports_updated
BEFORE UPDATE ON public.daily_reports
FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();