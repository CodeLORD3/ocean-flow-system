CREATE UNIQUE INDEX IF NOT EXISTS purchase_reports_docnr_uniq
  ON public.purchase_reports (document_number)
  WHERE document_number IS NOT NULL AND archived_at IS NULL;