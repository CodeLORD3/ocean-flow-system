ALTER TABLE public.purchase_report_lines
  ADD COLUMN supplier_name text DEFAULT NULL,
  ADD COLUMN status text NOT NULL DEFAULT 'Inköpt',
  ADD COLUMN purchase_date date DEFAULT CURRENT_DATE;