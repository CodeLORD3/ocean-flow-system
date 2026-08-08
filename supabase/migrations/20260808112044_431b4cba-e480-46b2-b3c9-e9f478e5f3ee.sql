ALTER TABLE public.purchase_reports
  ADD COLUMN IF NOT EXISTS arrived_at timestamptz,
  ADD COLUMN IF NOT EXISTS arrived_by uuid REFERENCES public.staff(id);