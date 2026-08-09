-- 3.1 Exportomfattning: kapitel 03 samt 1604-1605
CREATE OR REPLACE FUNCTION public.product_export_documentation_required(_hs_code text)
RETURNS boolean
LANGUAGE sql
IMMUTABLE
SET search_path TO 'public'
AS $$
  SELECT CASE
    WHEN _hs_code IS NULL THEN false
    WHEN regexp_replace(_hs_code, '[^0-9]', '', 'g') = '' THEN false
    ELSE left(regexp_replace(_hs_code, '[^0-9]', '', 'g') || '000000', 4)::int BETWEEN 300 AND 399
      OR left(regexp_replace(_hs_code, '[^0-9]', '', 'g') || '000000', 4)::int BETWEEN 1604 AND 1605
  END;
$$;

ALTER TABLE public.products
  ADD COLUMN IF NOT EXISTS export_documentation_required boolean
    GENERATED ALWAYS AS (public.product_export_documentation_required(hs_code)) STORED;

-- 3.2 Nya fält på partier
ALTER TABLE public.lots
  ADD COLUMN IF NOT EXISTS fishing_trip_id text,
  ADD COLUMN IF NOT EXISTS incoming_catch_cert text,
  ADD COLUMN IF NOT EXISTS statistical_doc text,
  ADD COLUMN IF NOT EXISTS seal_number text;

-- 3.3 Nya fält på utleverans
ALTER TABLE public.transfer_orders
  ADD COLUMN IF NOT EXISTS catch_certificate_ref text,
  ADD COLUMN IF NOT EXISTS catch_cert_validated date,
  ADD COLUMN IF NOT EXISTS reexport_cert text,
  ADD COLUMN IF NOT EXISTS export_country text,
  ADD COLUMN IF NOT EXISTS seal_number text;

-- 3.4 Dokumentregister per parti
CREATE TABLE public.lot_documents (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  lot_id uuid NOT NULL REFERENCES public.lots(id) ON DELETE RESTRICT,
  document_type text NOT NULL,
  document_number text,
  issuer text,
  issued_date date,
  valid_to date,
  file_path text,
  file_name text,
  note text,
  uploaded_by uuid REFERENCES public.staff(id) ON DELETE SET NULL,
  uploaded_at timestamp with time zone NOT NULL DEFAULT now(),
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  updated_at timestamp with time zone NOT NULL DEFAULT now(),
  CONSTRAINT lot_documents_type_check CHECK (document_type IN (
    'fangstintyg','statistikdokument','reexportintyg','halsointyg',
    'registreringsdokument_blotdjur','leverantorsintyg','ovrigt'))
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.lot_documents TO authenticated;
GRANT ALL ON public.lot_documents TO service_role;

ALTER TABLE public.lot_documents ENABLE ROW LEVEL SECURITY;

CREATE POLICY "lot_documents_read" ON public.lot_documents
  FOR SELECT TO authenticated USING (public.is_staff());
CREATE POLICY "lot_documents_insert" ON public.lot_documents
  FOR INSERT TO authenticated WITH CHECK (public.is_staff());
CREATE POLICY "lot_documents_update" ON public.lot_documents
  FOR UPDATE TO authenticated USING (public.is_staff_manager()) WITH CHECK (public.is_staff_manager());
CREATE POLICY "lot_documents_delete" ON public.lot_documents
  FOR DELETE TO authenticated USING (public.is_staff_manager());

CREATE INDEX idx_lot_documents_lot ON public.lot_documents(lot_id);
CREATE INDEX idx_lot_documents_type ON public.lot_documents(document_type);

CREATE TRIGGER trg_lot_documents_updated
  BEFORE UPDATE ON public.lot_documents
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();