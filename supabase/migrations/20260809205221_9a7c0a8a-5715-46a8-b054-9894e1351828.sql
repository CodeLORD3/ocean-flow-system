-- 1. Nya fält för levande blötdjur
ALTER TABLE public.lots
  ADD COLUMN IF NOT EXISTS harvest_date date,
  ADD COLUMN IF NOT EXISTS bivalve_doc_number text,
  ADD COLUMN IF NOT EXISTS bivalve_doc_issuer text,
  ADD COLUMN IF NOT EXISTS bivalve_doc_valid_to date,
  ADD COLUMN IF NOT EXISTS purification_center text,
  ADD COLUMN IF NOT EXISTS bivalve_heat_treated boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS is_bivalve boolean NOT NULL DEFAULT false;

-- Arv av blötdjursflaggan från produkten, samma mönster som parasitflaggan
CREATE OR REPLACE FUNCTION public.set_lot_bivalve_flag()
RETURNS trigger
LANGUAGE plpgsql
SET search_path TO 'public'
AS $$
BEGIN
  IF NEW.product_id IS NOT NULL AND NEW.is_bivalve = false THEN
    SELECT COALESCE(p.is_bivalve, false) INTO NEW.is_bivalve
    FROM public.products p WHERE p.id = NEW.product_id;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_set_lot_bivalve_flag ON public.lots;
CREATE TRIGGER trg_set_lot_bivalve_flag
BEFORE INSERT OR UPDATE OF product_id, is_bivalve ON public.lots
FOR EACH ROW EXECUTE FUNCTION public.set_lot_bivalve_flag();

UPDATE public.lots l
SET is_bivalve = true
WHERE EXISTS (SELECT 1 FROM public.products p WHERE p.id = l.product_id AND p.is_bivalve);

-- Validering av klassificering och giltighet
CREATE OR REPLACE FUNCTION public.validate_bivalve_registration()
RETURNS trigger
LANGUAGE plpgsql
SET search_path TO 'public'
AS $$
BEGIN
  IF NEW.production_area_classification IS NOT NULL
     AND upper(NEW.production_area_classification) NOT IN ('A','B','C') THEN
    RAISE EXCEPTION 'Omradesklassificering maste vara A, B eller C.';
  END IF;
  IF NEW.production_area_classification IS NOT NULL THEN
    NEW.production_area_classification := upper(NEW.production_area_classification);
  END IF;
  IF NEW.bivalve_doc_valid_to IS NOT NULL AND NEW.harvest_date IS NOT NULL
     AND NEW.bivalve_doc_valid_to < NEW.harvest_date THEN
    RAISE EXCEPTION 'Registreringsdokumentet gick ut innan upptagningsdatumet.';
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_validate_bivalve_registration ON public.lots;
CREATE TRIGGER trg_validate_bivalve_registration
BEFORE INSERT OR UPDATE ON public.lots
FOR EACH ROW EXECUTE FUNCTION public.validate_bivalve_registration();

-- 2. Spärren utvidgas: samma funktion används av båda befintliga triggrarna
CREATE OR REPLACE FUNCTION public.lot_parasite_block_reason(_lot_id uuid)
RETURNS text
LANGUAGE plpgsql
STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  l public.lots;
BEGIN
  IF _lot_id IS NULL THEN
    RETURN NULL;
  END IF;

  SELECT * INTO l FROM public.lots WHERE id = _lot_id;
  IF NOT FOUND THEN
    RETURN NULL;
  END IF;

  -- Levande blotdjur: registreringsdokument och omradesklassificering kravs
  IF COALESCE(l.is_bivalve, false) THEN
    IF COALESCE(l.production_area_classification, '') = '' THEN
      RETURN format('Parti %s saknar omradesklassificering for levande blotdjur.',
                    COALESCE(l.lot_number, l.id::text));
    END IF;
    IF COALESCE(l.bivalve_doc_number, '') = ''
       AND COALESCE(l.bivalve_registration_doc, '') = '' THEN
      RETURN format('Parti %s saknar registreringsdokument for levande blotdjur.',
                    COALESCE(l.lot_number, l.id::text));
    END IF;
    IF l.bivalve_doc_valid_to IS NOT NULL AND l.bivalve_doc_valid_to < CURRENT_DATE THEN
      RETURN format('Registreringsdokumentet for parti %s gick ut %s.',
                    COALESCE(l.lot_number, l.id::text), l.bivalve_doc_valid_to);
    END IF;
    IF l.production_area_classification IN ('B','C')
       AND COALESCE(l.purification_center, '') = ''
       AND NOT COALESCE(l.bivalve_heat_treated, false) THEN
      RETURN format('Parti %s ar upptaget i klass %s och kraver rening eller varmebehandling.',
                    COALESCE(l.lot_number, l.id::text), l.production_area_classification);
    END IF;
  END IF;

  IF NOT COALESCE(l.parasite_treatment_required, false) THEN
    RETURN NULL;
  END IF;

  IF l.freeze_start IS NOT NULL AND l.freeze_end IS NOT NULL AND l.freeze_temp IS NOT NULL THEN
    RETURN NULL;
  END IF;

  IF COALESCE(l.exemption_reason, '') <> '' AND COALESCE(l.exemption_source, '') <> '' THEN
    RETURN NULL;
  END IF;

  RETURN format('Parti %s ska atas ratt och saknar dokumenterad frysbehandling eller registrerat undantag.',
                COALESCE(l.lot_number, l.id::text));
END;
$$;

-- 3. Handelsdokument för animaliska biprodukter
CREATE TABLE IF NOT EXISTS public.abp_consignments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  store_id uuid REFERENCES public.stores(id) ON DELETE RESTRICT,
  location_id uuid REFERENCES public.storage_locations(id) ON DELETE RESTRICT,
  collected_date date NOT NULL DEFAULT CURRENT_DATE,
  category smallint NOT NULL DEFAULT 3,
  quantity_kg numeric,
  receiver_name text NOT NULL,
  receiver_approval_number text,
  transporter_name text,
  transporter_approval_number text,
  document_number text,
  file_path text,
  file_name text,
  note text,
  created_by uuid REFERENCES public.staff(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.abp_consignments TO authenticated;
GRANT ALL ON public.abp_consignments TO service_role;

ALTER TABLE public.abp_consignments ENABLE ROW LEVEL SECURITY;

CREATE POLICY "abp_read" ON public.abp_consignments
FOR SELECT TO authenticated USING (public.is_staff());

CREATE POLICY "abp_insert" ON public.abp_consignments
FOR INSERT TO authenticated
WITH CHECK (
  public.is_staff()
  AND (store_id IS NULL OR public.staff_has_store(store_id) OR public.has_role(auth.uid(), 'admin'))
);

CREATE POLICY "abp_update" ON public.abp_consignments
FOR UPDATE TO authenticated
USING (public.is_staff_manager() OR public.has_role(auth.uid(), 'admin'))
WITH CHECK (public.is_staff_manager() OR public.has_role(auth.uid(), 'admin'));

CREATE POLICY "abp_delete" ON public.abp_consignments
FOR DELETE TO authenticated
USING (public.is_staff_manager() OR public.has_role(auth.uid(), 'admin'));

DROP TRIGGER IF EXISTS trg_abp_updated_at ON public.abp_consignments;
CREATE TRIGGER trg_abp_updated_at
BEFORE UPDATE ON public.abp_consignments
FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

CREATE INDEX IF NOT EXISTS abp_consignments_store_date_idx
  ON public.abp_consignments (store_id, collected_date DESC);

-- 4. Saldorader och leverantörskopplingar får inte kaskadraderas
ALTER TABLE public.product_stock_locations
  DROP CONSTRAINT product_stock_locations_product_id_fkey,
  ADD CONSTRAINT product_stock_locations_product_id_fkey
    FOREIGN KEY (product_id) REFERENCES public.products(id) ON DELETE RESTRICT;

ALTER TABLE public.supplier_article_map
  DROP CONSTRAINT supplier_article_map_product_id_fkey,
  ADD CONSTRAINT supplier_article_map_product_id_fkey
    FOREIGN KEY (product_id) REFERENCES public.products(id) ON DELETE RESTRICT;