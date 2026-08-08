-- =========================================================
-- Etapp 1: ny lagerstruktur — fem nivåer, regler som data, spärrar i databasen
-- =========================================================

-- 1. Nivåer på lagerplatser
DO $$ BEGIN
  CREATE TYPE public.location_type AS ENUM ('inkopslager','grossistlager','tillverkningslager','leveranslager','butik');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

ALTER TABLE public.storage_locations
  ADD COLUMN IF NOT EXISTS location_type public.location_type,
  ADD COLUMN IF NOT EXISTS active boolean NOT NULL DEFAULT true;

-- 2. Flödesregler som data
CREATE TABLE IF NOT EXISTS public.stock_flow_rules (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  from_type public.location_type NOT NULL,
  to_type public.location_type NOT NULL,
  allowed boolean NOT NULL DEFAULT true,
  required_document_type text,
  requires_reason boolean NOT NULL DEFAULT false,
  requires_admin boolean NOT NULL DEFAULT false,
  note text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (from_type, to_type)
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.stock_flow_rules TO authenticated;
GRANT ALL ON public.stock_flow_rules TO service_role;
ALTER TABLE public.stock_flow_rules ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Personal kan läsa flödesregler" ON public.stock_flow_rules
  FOR SELECT TO authenticated USING (public.is_staff());
CREATE POLICY "Admin kan ändra flödesregler" ON public.stock_flow_rules
  FOR ALL TO authenticated USING (public.has_role(auth.uid(),'admin')) WITH CHECK (public.has_role(auth.uid(),'admin'));

CREATE TRIGGER trg_stock_flow_rules_updated BEFORE UPDATE ON public.stock_flow_rules
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

INSERT INTO public.stock_flow_rules (from_type, to_type, allowed, required_document_type, requires_reason, requires_admin, note) VALUES
  ('inkopslager','grossistlager', true, 'purchase_report', false, false, 'Ankomstkontroll mot inköpt kvantitet'),
  ('grossistlager','tillverkningslager', true, 'production_order', false, false, 'Kräver bokfört saldo i grossistlagret'),
  ('tillverkningslager','grossistlager', true, 'production_order', false, false, 'Produktionsrapport med faktiskt utbyte'),
  ('grossistlager','leveranslager', true, 'shop_order', false, false, NULL),
  ('leveranslager','butik', true, 'shop_order', false, false, NULL),
  ('butik','leveranslager', true, 'return_order', true, false, 'Retur, orsak obligatorisk'),
  ('leveranslager','grossistlager', true, 'return_order', true, false, 'Retur, orsak obligatorisk')
ON CONFLICT (from_type, to_type) DO NOTHING;

-- 3. Överföringsordrar
DO $$ BEGIN
  CREATE TYPE public.transfer_status AS ENUM
    ('skapad','plocklista_utskriven','godkand_utleverans','under_transport','delvis_levererad','godkand_inleverans','avvisad');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

CREATE TABLE IF NOT EXISTS public.transfer_orders (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  order_number text,
  from_location_id uuid NOT NULL REFERENCES public.storage_locations(id),
  to_location_id uuid NOT NULL REFERENCES public.storage_locations(id),
  source_document_type text,
  source_document_id text,
  status public.transfer_status NOT NULL DEFAULT 'skapad',
  reason text,
  created_by uuid REFERENCES public.staff(id),
  picked_by uuid REFERENCES public.staff(id),
  approved_out_by uuid REFERENCES public.staff(id),
  approved_in_by uuid REFERENCES public.staff(id),
  picklist_printed_at timestamptz,
  picked_at timestamptz,
  approved_out_at timestamptz,
  approved_in_at timestamptz,
  deviation_note text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.transfer_order_lines (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  transfer_order_id uuid NOT NULL REFERENCES public.transfer_orders(id) ON DELETE CASCADE,
  product_id uuid NOT NULL REFERENCES public.products(id),
  lot_id uuid REFERENCES public.lots(id),
  quantity_ordered numeric(14,3) NOT NULL DEFAULT 0,
  quantity_picked numeric(14,3),
  quantity_shipped numeric(14,3),
  quantity_received numeric(14,3),
  pick_deviation_reason text,
  ship_deviation_reason text,
  receive_deviation_reason text,
  unit_cost numeric(12,2),
  sort_order int NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_transfer_orders_status ON public.transfer_orders(status);
CREATE INDEX IF NOT EXISTS idx_transfer_order_lines_order ON public.transfer_order_lines(transfer_order_id);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.transfer_orders TO authenticated;
GRANT ALL ON public.transfer_orders TO service_role;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.transfer_order_lines TO authenticated;
GRANT ALL ON public.transfer_order_lines TO service_role;

ALTER TABLE public.transfer_orders ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.transfer_order_lines ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Personal hanterar överföringar" ON public.transfer_orders
  FOR ALL TO authenticated USING (public.is_staff()) WITH CHECK (public.is_staff());
CREATE POLICY "Personal hanterar överföringsrader" ON public.transfer_order_lines
  FOR ALL TO authenticated USING (public.is_staff()) WITH CHECK (public.is_staff());

CREATE TRIGGER trg_transfer_orders_updated BEFORE UPDATE ON public.transfer_orders
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
CREATE TRIGGER trg_transfer_order_lines_updated BEFORE UPDATE ON public.transfer_order_lines
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- 4. Svinnrapporter
CREATE TABLE IF NOT EXISTS public.waste_reports (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  location_id uuid NOT NULL REFERENCES public.storage_locations(id),
  reason text NOT NULL,
  comment text,
  reported_by uuid REFERENCES public.staff(id),
  transfer_order_id uuid REFERENCES public.transfer_orders(id),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT waste_reason_allowed CHECK (reason IN ('kvalitet','temperatur','skada','utganget_datum','saknas','for_mycket','ankomstavvikelse','ovrigt'))
);

CREATE TABLE IF NOT EXISTS public.waste_report_lines (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  waste_report_id uuid NOT NULL REFERENCES public.waste_reports(id) ON DELETE CASCADE,
  product_id uuid NOT NULL REFERENCES public.products(id),
  lot_id uuid REFERENCES public.lots(id),
  quantity_kg numeric(14,3) NOT NULL CHECK (quantity_kg > 0),
  unit_cost numeric(12,2),
  comment text,
  created_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.waste_reports TO authenticated;
GRANT ALL ON public.waste_reports TO service_role;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.waste_report_lines TO authenticated;
GRANT ALL ON public.waste_report_lines TO service_role;
ALTER TABLE public.waste_reports ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.waste_report_lines ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Personal hanterar svinnrapporter" ON public.waste_reports
  FOR ALL TO authenticated USING (public.is_staff()) WITH CHECK (public.is_staff());
CREATE POLICY "Personal hanterar svinnrader" ON public.waste_report_lines
  FOR ALL TO authenticated USING (public.is_staff()) WITH CHECK (public.is_staff());

CREATE TRIGGER trg_waste_reports_updated BEFORE UPDATE ON public.waste_reports
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- 5. Externa produktionsuppdrag + förväntad ankomst på inköpsrader
ALTER TABLE public.production_orders
  ADD COLUMN IF NOT EXISTS order_type text NOT NULL DEFAULT 'intern',
  ADD COLUMN IF NOT EXISTS external_supplier_id uuid REFERENCES public.suppliers(id),
  ADD COLUMN IF NOT EXISTS external_supplier_name text,
  ADD COLUMN IF NOT EXISTS expected_return_date date,
  ADD COLUMN IF NOT EXISTS external_price_per_kg numeric(12,2);

DO $$ BEGIN
  ALTER TABLE public.production_orders
    ADD CONSTRAINT production_order_type_allowed CHECK (order_type IN ('intern','extern'));
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

CREATE OR REPLACE FUNCTION public.validate_external_production_order()
RETURNS trigger LANGUAGE plpgsql SET search_path = public AS $$
BEGIN
  IF NEW.order_type = 'extern' THEN
    IF COALESCE(NEW.external_supplier_name, '') = '' AND NEW.external_supplier_id IS NULL THEN
      RAISE EXCEPTION 'Externt produktionsuppdrag kräver leverantör.';
    END IF;
    IF NEW.expected_return_date IS NULL THEN
      RAISE EXCEPTION 'Externt produktionsuppdrag kräver förväntat returdatum.';
    END IF;
    IF NEW.external_price_per_kg IS NULL THEN
      RAISE EXCEPTION 'Externt produktionsuppdrag kräver avtalat pris per kilo.';
    END IF;
  END IF;
  RETURN NEW;
END; $$;

CREATE TRIGGER trg_validate_external_production_order
  BEFORE INSERT OR UPDATE ON public.production_orders
  FOR EACH ROW EXECUTE FUNCTION public.validate_external_production_order();

ALTER TABLE public.purchase_report_lines
  ADD COLUMN IF NOT EXISTS expected_arrival_date date;

-- 6. Spärrar

-- 6a. Flödesregler + underlag vid statusövergång
CREATE OR REPLACE FUNCTION public.enforce_transfer_flow()
RETURNS trigger LANGUAGE plpgsql SET search_path = public AS $$
DECLARE
  f public.location_type;
  t public.location_type;
  rule public.stock_flow_rules;
  from_active boolean;
  to_active boolean;
  open_dev int;
BEGIN
  SELECT location_type, active INTO f, from_active FROM public.storage_locations WHERE id = NEW.from_location_id;
  SELECT location_type, active INTO t, to_active FROM public.storage_locations WHERE id = NEW.to_location_id;

  IF NOT COALESCE(from_active, false) OR NOT COALESCE(to_active, false) THEN
    RAISE EXCEPTION 'Lagerplatsen är inaktiverad och kan inte användas i en överföring.';
  END IF;
  IF f IS NULL OR t IS NULL THEN
    RAISE EXCEPTION 'Lagerplatsen saknar nivå (location_type) och kan inte användas i en överföring.';
  END IF;

  SELECT * INTO rule FROM public.stock_flow_rules WHERE from_type = f AND to_type = t AND allowed;
  IF NOT FOUND THEN
    IF f = 'tillverkningslager' THEN
      RAISE EXCEPTION 'Tillverkningslagret kan bara skicka till grossistlagret';
    END IF;
    RAISE EXCEPTION 'Flytt från % till % är inte tillåten.', f, t;
  END IF;

  IF rule.requires_reason AND COALESCE(NEW.reason, '') = '' THEN
    RAISE EXCEPTION 'Flytten kräver orsak.';
  END IF;

  IF NEW.status IN ('godkand_utleverans','under_transport','delvis_levererad','godkand_inleverans') THEN
    IF COALESCE(NEW.source_document_type, '') = '' OR COALESCE(NEW.source_document_id, '') = '' THEN
      RAISE EXCEPTION 'Leveransen saknar underlag. Välj beställning eller skapa flyttorder.';
    END IF;
  END IF;

  IF NEW.status = 'plocklista_utskriven' AND NEW.picklist_printed_at IS NULL THEN
    NEW.picklist_printed_at := now();
  END IF;

  IF NEW.status = 'godkand_inleverans' THEN
    SELECT count(*) INTO open_dev
    FROM public.transfer_order_lines l
    WHERE l.transfer_order_id = NEW.id
      AND l.quantity_received IS DISTINCT FROM l.quantity_shipped
      AND COALESCE(l.receive_deviation_reason, '') = '';
    IF open_dev > 0 THEN
      RAISE EXCEPTION 'Leveransen har % rad(er) med oredovisad avvikelse.', open_dev;
    END IF;
  END IF;

  RETURN NEW;
END; $$;

CREATE TRIGGER trg_enforce_transfer_flow
  BEFORE INSERT OR UPDATE ON public.transfer_orders
  FOR EACH ROW EXECUTE FUNCTION public.enforce_transfer_flow();

-- 6b. Svinn kräver rapport, och ingen bokföring mot inaktiverad plats
CREATE OR REPLACE FUNCTION public.enforce_movement_preconditions()
RETURNS trigger LANGUAGE plpgsql SET search_path = public AS $$
DECLARE
  loc_active boolean;
BEGIN
  SELECT active INTO loc_active FROM public.storage_locations WHERE id = NEW.location_id;
  IF NOT COALESCE(loc_active, false) THEN
    RAISE EXCEPTION 'Lagerplatsen är inaktiverad — rörelsen kan inte bokföras.';
  END IF;

  IF NEW.movement_type = 'svinn' THEN
    IF NEW.reference_type IS DISTINCT FROM 'waste_report' OR NEW.reference_id IS NULL THEN
      RAISE EXCEPTION 'Svinn kräver en svinnrapport med orsak.';
    END IF;
    IF NOT EXISTS (SELECT 1 FROM public.waste_reports w WHERE w.id::text = NEW.reference_id::text) THEN
      RAISE EXCEPTION 'Svinnrapporten hittades inte.';
    END IF;
  END IF;

  RETURN NEW;
END; $$;

CREATE TRIGGER trg_enforce_movement_preconditions
  BEFORE INSERT ON public.stock_movements
  FOR EACH ROW EXECUTE FUNCTION public.enforce_movement_preconditions();

-- 7. Klassning av befintliga platser (endast etikett, inga saldon rörs)
UPDATE public.storage_locations SET location_type = 'grossistlager'
 WHERE location_type IS NULL AND (name ILIKE 'Grossist%' OR name ILIKE 'Produktionslager' OR name ILIKE 'Transportlager' OR name ILIKE 'Pre-Produktion');

UPDATE public.storage_locations SET location_type = 'butik'
 WHERE location_type IS NULL;

-- 8. Nya lagerplatser: inköps- och tillverkningslager per enhet, leveranslager per butik
INSERT INTO public.storage_locations (name, store_id, zone, description, location_type)
SELECT 'Inköpslager ' || s.name, s.id, 'inkop', 'På väg till oss — i vår ägo, ännu inte fysiskt hos oss', 'inkopslager'
FROM public.stores s
WHERE NOT EXISTS (
  SELECT 1 FROM public.storage_locations l WHERE l.store_id = s.id AND l.location_type = 'inkopslager'
);

INSERT INTO public.storage_locations (name, store_id, zone, description, location_type)
SELECT 'Tillverkningslager ' || s.name, s.id, 'tillverkning', 'Varor planerade för produktion eller ute på externt uppdrag', 'tillverkningslager'
FROM public.stores s
WHERE NOT EXISTS (
  SELECT 1 FROM public.storage_locations l WHERE l.store_id = s.id AND l.location_type = 'tillverkningslager'
);

INSERT INTO public.storage_locations (name, store_id, zone, description, location_type)
SELECT 'Leverans ' || s.name, s.id, 'leverans', 'Bokat till butiken, ännu inte mottaget', 'leveranslager'
FROM public.stores s
WHERE NOT EXISTS (
  SELECT 1 FROM public.storage_locations l WHERE l.store_id = s.id AND l.location_type = 'leveranslager'
);