-- ============ AP-9: FÖLJESEDELSINLÄSNING ============

-- 1. purchase_reports: dokumenthuvud, leverantör, dubblettnycklar, bokföring
ALTER TABLE public.purchase_reports
  ADD COLUMN IF NOT EXISTS supplier_id uuid REFERENCES public.suppliers(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS supplier_name_raw text,
  ADD COLUMN IF NOT EXISTS document_type text,
  ADD COLUMN IF NOT EXISTS document_number text,
  ADD COLUMN IF NOT EXISTS document_date date,
  ADD COLUMN IF NOT EXISTS delivery_date date,
  ADD COLUMN IF NOT EXISTS total_ex_vat numeric(14,2),
  ADD COLUMN IF NOT EXISTS file_hash text,
  ADD COLUMN IF NOT EXISTS posted_at timestamptz,
  ADD COLUMN IF NOT EXISTS posted_by uuid REFERENCES public.staff(id) ON DELETE SET NULL;

CREATE UNIQUE INDEX IF NOT EXISTS purchase_reports_supplier_docnr_uniq
  ON public.purchase_reports (supplier_id, document_number)
  WHERE supplier_id IS NOT NULL AND document_number IS NOT NULL;

-- Auktionssedlar utan dokumentnummer: en auktion per dag och leverantör
CREATE UNIQUE INDEX IF NOT EXISTS purchase_reports_supplier_docdate_uniq
  ON public.purchase_reports (supplier_id, document_date)
  WHERE supplier_id IS NOT NULL AND document_date IS NOT NULL AND document_number IS NULL;

CREATE INDEX IF NOT EXISTS purchase_reports_file_hash_idx ON public.purchase_reports (file_hash);

-- 2. purchase_report_lines: spårbarhet, kontroller, partikoppling
ALTER TABLE public.purchase_report_lines
  ADD COLUMN IF NOT EXISTS supplier_article_no text,
  ADD COLUMN IF NOT EXISTS latin_name text,
  ADD COLUMN IF NOT EXISTS species_fao_code text,
  ADD COLUMN IF NOT EXISTS lot_numbers text[] NOT NULL DEFAULT '{}',
  ADD COLUMN IF NOT EXISTS catch_area text,
  ADD COLUMN IF NOT EXISTS fishing_gear text,
  ADD COLUMN IF NOT EXISTS fishing_gear_code text,
  ADD COLUMN IF NOT EXISTS catch_date_from date,
  ADD COLUMN IF NOT EXISTS catch_date_to date,
  ADD COLUMN IF NOT EXISTS best_before date,
  ADD COLUMN IF NOT EXISTS presentation text,
  ADD COLUMN IF NOT EXISTS grade text,
  ADD COLUMN IF NOT EXISTS condition text,
  ADD COLUMN IF NOT EXISTS vessel_name text,
  ADD COLUMN IF NOT EXISTS vessel_reg text,
  ADD COLUMN IF NOT EXISTS vessel_nation text,
  ADD COLUMN IF NOT EXISTS certificate text,
  ADD COLUMN IF NOT EXISTS ordered_quantity numeric(12,3),
  ADD COLUMN IF NOT EXISTS qty_variance_flag boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS amount_mismatch boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS zero_price_confirmed boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS parent_line_id uuid REFERENCES public.purchase_report_lines(id) ON DELETE CASCADE,
  ADD COLUMN IF NOT EXISTS batch_quantities jsonb,
  ADD COLUMN IF NOT EXISTS lot_id uuid REFERENCES public.lots(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS movement_id uuid REFERENCES public.stock_movements(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS match_method text;

CREATE INDEX IF NOT EXISTS purchase_report_lines_parent_idx ON public.purchase_report_lines (parent_line_id);
CREATE INDEX IF NOT EXISTS purchase_report_lines_lot_idx ON public.purchase_report_lines (lot_id);

-- 3. lots: prisstatus (följesedelspris är preliminärt)
ALTER TABLE public.lots
  ADD COLUMN IF NOT EXISTS price_status text NOT NULL DEFAULT 'preliminar'
    CHECK (price_status IN ('preliminar','bekraftad'));

-- 4. supplier_article_map
CREATE TABLE IF NOT EXISTS public.supplier_article_map (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  supplier_id uuid NOT NULL REFERENCES public.suppliers(id) ON DELETE CASCADE,
  supplier_article_no text NOT NULL,
  product_id uuid NOT NULL REFERENCES public.products(id) ON DELETE CASCADE,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (supplier_id, supplier_article_no)
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.supplier_article_map TO authenticated;
GRANT ALL ON public.supplier_article_map TO service_role;
ALTER TABLE public.supplier_article_map ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Authenticated can manage supplier article map"
  ON public.supplier_article_map FOR ALL TO authenticated USING (true) WITH CHECK (true);

-- 5. species_latin_aliases: BARA felstavningar mappade mot korrekt namn
CREATE OR REPLACE FUNCTION public.latin_norm(v text)
RETURNS text
LANGUAGE sql
IMMUTABLE
SET search_path = public
AS $$
  SELECT regexp_replace(lower(trim(coalesce(v, ''))), '\s+', ' ', 'g')
$$;

CREATE TABLE IF NOT EXISTS public.species_latin_aliases (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  alias text NOT NULL,
  latin_name text NOT NULL,
  note text,
  created_at timestamptz NOT NULL DEFAULT now(),
  -- Ett korrekt namn får aldrig mappas mot exakt sig självt. Rena versalfel
  -- (Mytilus Edulis -> Mytilus edulis) är tillåtna och fångas av normaliseringen.
  CONSTRAINT species_latin_aliases_not_self CHECK (trim(alias) <> trim(latin_name))
);

CREATE UNIQUE INDEX IF NOT EXISTS species_latin_aliases_alias_uniq
  ON public.species_latin_aliases (public.latin_norm(alias));

GRANT SELECT, INSERT, UPDATE, DELETE ON public.species_latin_aliases TO authenticated;
GRANT ALL ON public.species_latin_aliases TO service_role;
ALTER TABLE public.species_latin_aliases ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Authenticated can manage latin aliases"
  ON public.species_latin_aliases FOR ALL TO authenticated USING (true) WITH CHECK (true);

INSERT INTO public.species_latin_aliases (alias, latin_name, note) VALUES
  ('Homarus gamarus', 'Homarus gammarus', 'JHB'),
  ('Lophius piscatorus', 'Lophius piscatorius', 'JHB'),
  ('Clupea herengus', 'Clupea harengus', 'JHB'),
  ('Mytilus Edulis', 'Mytilus edulis', 'versalfel, fångas även av normaliseringen')
ON CONFLICT DO NOTHING;

-- 6. purchase_report_rejected_lines: otolkade rader
CREATE TABLE IF NOT EXISTS public.purchase_report_rejected_lines (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  report_id uuid NOT NULL REFERENCES public.purchase_reports(id) ON DELETE CASCADE,
  row_index integer,
  raw_data jsonb,
  reason text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.purchase_report_rejected_lines TO authenticated;
GRANT ALL ON public.purchase_report_rejected_lines TO service_role;
ALTER TABLE public.purchase_report_rejected_lines ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Authenticated can manage rejected purchase lines"
  ON public.purchase_report_rejected_lines FOR ALL TO authenticated USING (true) WITH CHECK (true);

CREATE INDEX IF NOT EXISTS purchase_report_rejected_lines_report_idx
  ON public.purchase_report_rejected_lines (report_id);

-- updated_at-trigger för supplier_article_map
CREATE TRIGGER update_supplier_article_map_updated_at
  BEFORE UPDATE ON public.supplier_article_map
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();