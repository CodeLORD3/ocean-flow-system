ALTER TABLE public.purchase_report_lines
  ADD COLUMN IF NOT EXISTS size_grade integer;

COMMENT ON COLUMN public.purchase_report_lines.size_grade IS
  'Sorteringsklass (EU 2406/96) som stod tryckt på följesedelsraden, 1-9. NULL när den inte kunde läsas.';