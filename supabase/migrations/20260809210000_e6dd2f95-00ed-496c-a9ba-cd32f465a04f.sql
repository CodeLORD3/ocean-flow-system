-- 6A: bolagslagret
ALTER TABLE public.legal_entities
  ADD COLUMN IF NOT EXISTS vat_regime text,
  ADD COLUMN IF NOT EXISTS fiscal_year_end text,
  ADD COLUMN IF NOT EXISTS active boolean NOT NULL DEFAULT true,
  ADD COLUMN IF NOT EXISTS updated_at timestamptz NOT NULL DEFAULT now();

UPDATE public.legal_entities SET vat_regime = COALESCE(vat_regime, country), fiscal_year_end = COALESCE(fiscal_year_end, '12-31');

GRANT SELECT ON public.legal_entities TO authenticated;
GRANT ALL ON public.legal_entities TO service_role;
ALTER TABLE public.legal_entities ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "legal_entities_read" ON public.legal_entities;
CREATE POLICY "legal_entities_read" ON public.legal_entities FOR SELECT TO authenticated USING (true);
DROP POLICY IF EXISTS "legal_entities_admin_write" ON public.legal_entities;
CREATE POLICY "legal_entities_admin_write" ON public.legal_entities FOR ALL TO authenticated
  USING (public.has_role(auth.uid(),'admin')) WITH CHECK (public.has_role(auth.uid(),'admin'));

-- bolagstillhörighet med giltighetstid
CREATE TABLE IF NOT EXISTS public.store_company_periods (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  store_id uuid NOT NULL REFERENCES public.stores(id) ON DELETE RESTRICT,
  legal_entity_id text NOT NULL REFERENCES public.legal_entities(legal_entity_id) ON DELETE RESTRICT,
  valid_from date NOT NULL DEFAULT '2000-01-01',
  valid_to date,
  note text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT store_company_periods_order CHECK (valid_to IS NULL OR valid_to >= valid_from)
);
CREATE UNIQUE INDEX IF NOT EXISTS store_company_periods_open_uniq
  ON public.store_company_periods(store_id) WHERE valid_to IS NULL;
CREATE INDEX IF NOT EXISTS store_company_periods_lookup
  ON public.store_company_periods(store_id, valid_from, valid_to);

GRANT SELECT ON public.store_company_periods TO authenticated;
GRANT ALL ON public.store_company_periods TO service_role;
ALTER TABLE public.store_company_periods ENABLE ROW LEVEL SECURITY;
CREATE POLICY "scp_read" ON public.store_company_periods FOR SELECT TO authenticated USING (true);
CREATE POLICY "scp_admin_write" ON public.store_company_periods FOR ALL TO authenticated
  USING (public.has_role(auth.uid(),'admin')) WITH CHECK (public.has_role(auth.uid(),'admin'));

CREATE TRIGGER scp_updated_at BEFORE UPDATE ON public.store_company_periods
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

INSERT INTO public.store_company_periods (store_id, legal_entity_id, valid_from, note)
SELECT s.id, s.legal_entity_id, '2000-01-01', 'Initial period från butikens bolag'
FROM public.stores s
WHERE s.legal_entity_id IS NOT NULL
  AND NOT EXISTS (SELECT 1 FROM public.store_company_periods p WHERE p.store_id = s.id);

-- datumbaserat uppslag
CREATE OR REPLACE FUNCTION public.company_of_store(_store_id uuid, _on date DEFAULT current_date)
RETURNS text LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT p.legal_entity_id FROM public.store_company_periods p
  WHERE p.store_id = _store_id AND p.valid_from <= _on AND (p.valid_to IS NULL OR p.valid_to >= _on)
  ORDER BY p.valid_from DESC LIMIT 1
$$;

CREATE OR REPLACE FUNCTION public.company_of_location(_location_id uuid, _on date DEFAULT current_date)
RETURNS text LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT public.company_of_store(l.store_id, _on) FROM public.storage_locations l WHERE l.id = _location_id
$$;

-- främmande nyckel för bolagstillhörighet
ALTER TABLE public.stock_movements ADD COLUMN IF NOT EXISTS legal_entity_id text REFERENCES public.legal_entities(legal_entity_id) ON DELETE RESTRICT;
ALTER TABLE public.transfer_orders ADD COLUMN IF NOT EXISTS legal_entity_id text REFERENCES public.legal_entities(legal_entity_id) ON DELETE RESTRICT;
ALTER TABLE public.lots ADD COLUMN IF NOT EXISTS legal_entity_id text REFERENCES public.legal_entities(legal_entity_id) ON DELETE RESTRICT;
ALTER TABLE public.purchase_reports ADD COLUMN IF NOT EXISTS legal_entity_id text REFERENCES public.legal_entities(legal_entity_id) ON DELETE RESTRICT;
ALTER TABLE public.shop_orders ADD COLUMN IF NOT EXISTS legal_entity_id text REFERENCES public.legal_entities(legal_entity_id) ON DELETE RESTRICT;
ALTER TABLE public.staff ADD COLUMN IF NOT EXISTS legal_entity_id text REFERENCES public.legal_entities(legal_entity_id) ON DELETE RESTRICT;
ALTER TABLE public.margin_targets ADD COLUMN IF NOT EXISTS legal_entity_id text REFERENCES public.legal_entities(legal_entity_id) ON DELETE RESTRICT;
ALTER TABLE public.detail_prices ADD COLUMN IF NOT EXISTS legal_entity_id text REFERENCES public.legal_entities(legal_entity_id) ON DELETE RESTRICT;
ALTER TABLE public.vat_rates ADD COLUMN IF NOT EXISTS legal_entity_id text REFERENCES public.legal_entities(legal_entity_id) ON DELETE RESTRICT;

CREATE INDEX IF NOT EXISTS stock_movements_company_idx ON public.stock_movements(legal_entity_id);
CREATE INDEX IF NOT EXISTS transfer_orders_company_idx ON public.transfer_orders(legal_entity_id);
CREATE INDEX IF NOT EXISTS lots_company_idx ON public.lots(legal_entity_id);
CREATE INDEX IF NOT EXISTS shop_orders_company_idx ON public.shop_orders(legal_entity_id);

-- backfill från lagerplats/butik
ALTER TABLE public.transfer_orders DISABLE TRIGGER USER;
ALTER TABLE public.lots DISABLE TRIGGER USER;
ALTER TABLE public.stock_movements DISABLE TRIGGER USER;

UPDATE public.stock_movements m
SET legal_entity_id = public.company_of_location(m.location_id, m.created_at::date)
WHERE m.legal_entity_id IS NULL AND m.location_id IS NOT NULL;

UPDATE public.transfer_orders t
SET legal_entity_id = public.company_of_location(t.from_location_id, t.created_at::date)
WHERE t.legal_entity_id IS NULL AND t.from_location_id IS NOT NULL;

UPDATE public.shop_orders o
SET legal_entity_id = public.company_of_store(o.store_id, o.created_at::date)
WHERE o.legal_entity_id IS NULL AND o.store_id IS NOT NULL;

UPDATE public.staff s
SET legal_entity_id = public.company_of_store(COALESCE(s.store_id, s.allowed_store_id))
WHERE s.legal_entity_id IS NULL AND COALESCE(s.store_id, s.allowed_store_id) IS NOT NULL;

UPDATE public.margin_targets t
SET legal_entity_id = public.company_of_store(t.store_id)
WHERE t.legal_entity_id IS NULL AND t.store_id IS NOT NULL;

UPDATE public.lots l
SET legal_entity_id = COALESCE(
  (SELECT public.company_of_location(m.location_id, m.created_at::date) FROM public.stock_movements m
    WHERE m.lot_id = l.id AND m.location_id IS NOT NULL ORDER BY m.created_at ASC LIMIT 1),
  'fsab-se')
WHERE l.legal_entity_id IS NULL;

UPDATE public.purchase_reports r SET legal_entity_id = 'fsab-se' WHERE r.legal_entity_id IS NULL;

ALTER TABLE public.stock_movements ENABLE TRIGGER USER;

-- automatisk sättning vid nya rader
CREATE OR REPLACE FUNCTION public.set_company_from_location()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF NEW.legal_entity_id IS NULL THEN
    NEW.legal_entity_id := public.company_of_location(NEW.location_id, COALESCE(NEW.created_at::date, current_date));
  END IF;
  RETURN NEW;
END; $$;

DROP TRIGGER IF EXISTS stock_movements_set_company ON public.stock_movements;
CREATE TRIGGER stock_movements_set_company BEFORE INSERT ON public.stock_movements
  FOR EACH ROW EXECUTE FUNCTION public.set_company_from_location();

CREATE OR REPLACE FUNCTION public.set_company_from_store()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF NEW.legal_entity_id IS NULL AND NEW.store_id IS NOT NULL THEN
    NEW.legal_entity_id := public.company_of_store(NEW.store_id, current_date);
  END IF;
  RETURN NEW;
END; $$;

DROP TRIGGER IF EXISTS shop_orders_set_company ON public.shop_orders;
CREATE TRIGGER shop_orders_set_company BEFORE INSERT ON public.shop_orders
  FOR EACH ROW EXECUTE FUNCTION public.set_company_from_store();

DROP TRIGGER IF EXISTS staff_set_company ON public.staff;
CREATE TRIGGER staff_set_company BEFORE INSERT ON public.staff
  FOR EACH ROW EXECUTE FUNCTION public.set_company_from_store();

-- internförsäljning
ALTER TABLE public.transfer_orders
  ADD COLUMN IF NOT EXISTS is_intercompany boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS to_legal_entity_id text REFERENCES public.legal_entities(legal_entity_id) ON DELETE RESTRICT,
  ADD COLUMN IF NOT EXISTS internal_price_per_kg numeric;

UPDATE public.transfer_orders t
SET to_legal_entity_id = public.company_of_location(t.to_location_id, t.created_at::date)
WHERE t.to_legal_entity_id IS NULL AND t.to_location_id IS NOT NULL;

UPDATE public.transfer_orders t
SET is_intercompany = true
WHERE t.legal_entity_id IS NOT NULL AND t.to_legal_entity_id IS NOT NULL
  AND t.legal_entity_id <> t.to_legal_entity_id;

ALTER TABLE public.transfer_orders ENABLE TRIGGER USER;
ALTER TABLE public.lots ENABLE TRIGGER USER;

CREATE TABLE IF NOT EXISTS public.intercompany_invoices (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  transfer_order_id uuid NOT NULL REFERENCES public.transfer_orders(id) ON DELETE RESTRICT,
  seller_legal_entity_id text NOT NULL REFERENCES public.legal_entities(legal_entity_id) ON DELETE RESTRICT,
  buyer_legal_entity_id text NOT NULL REFERENCES public.legal_entities(legal_entity_id) ON DELETE RESTRICT,
  currency text NOT NULL DEFAULT 'SEK',
  vat_regime text,
  amount_ex_vat numeric NOT NULL DEFAULT 0,
  vat_amount numeric NOT NULL DEFAULT 0,
  status text NOT NULL DEFAULT 'underlag',
  document_number text,
  note text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (transfer_order_id)
);
GRANT SELECT, INSERT, UPDATE ON public.intercompany_invoices TO authenticated;
GRANT ALL ON public.intercompany_invoices TO service_role;
ALTER TABLE public.intercompany_invoices ENABLE ROW LEVEL SECURITY;
CREATE POLICY "ici_read" ON public.intercompany_invoices FOR SELECT TO authenticated USING (true);
CREATE POLICY "ici_write" ON public.intercompany_invoices FOR ALL TO authenticated
  USING (public.has_role(auth.uid(),'admin') OR public.is_staff())
  WITH CHECK (public.has_role(auth.uid(),'admin') OR public.is_staff());
CREATE TRIGGER ici_updated_at BEFORE UPDATE ON public.intercompany_invoices
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

CREATE OR REPLACE FUNCTION public.enforce_intercompany_transfer()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_from text; v_to text;
BEGIN
  v_from := COALESCE(NEW.legal_entity_id, public.company_of_location(NEW.from_location_id, current_date));
  v_to := COALESCE(NEW.to_legal_entity_id, public.company_of_location(NEW.to_location_id, current_date));
  NEW.legal_entity_id := v_from;
  NEW.to_legal_entity_id := v_to;
  NEW.is_intercompany := (v_from IS NOT NULL AND v_to IS NOT NULL AND v_from <> v_to);

  IF NEW.is_intercompany AND NEW.status IS DISTINCT FROM 'skapad'
     AND COALESCE(NEW.internal_price_per_kg, 0) <= 0 THEN
    RAISE EXCEPTION 'Överföring mellan olika bolag är internförsäljning och kräver internpris per kg';
  END IF;
  RETURN NEW;
END; $$;

DROP TRIGGER IF EXISTS transfer_orders_intercompany ON public.transfer_orders;
CREATE TRIGGER transfer_orders_intercompany BEFORE INSERT OR UPDATE ON public.transfer_orders
  FOR EACH ROW EXECUTE FUNCTION public.enforce_intercompany_transfer();

CREATE OR REPLACE FUNCTION public.generate_intercompany_invoice()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_qty numeric; v_cur text; v_regime text;
BEGIN
  IF NEW.is_intercompany AND NEW.status = 'godkand_utleverans'
     AND (OLD.status IS DISTINCT FROM NEW.status) THEN
    SELECT COALESCE(SUM(COALESCE(l.quantity_shipped, l.quantity_requested, 0)), 0)
      INTO v_qty FROM public.transfer_order_lines l WHERE l.transfer_order_id = NEW.id;
    SELECT currency, vat_regime INTO v_cur, v_regime FROM public.legal_entities WHERE legal_entity_id = NEW.legal_entity_id;
    INSERT INTO public.intercompany_invoices (transfer_order_id, seller_legal_entity_id, buyer_legal_entity_id, currency, vat_regime, amount_ex_vat, note)
    VALUES (NEW.id, NEW.legal_entity_id, NEW.to_legal_entity_id, COALESCE(v_cur,'SEK'), v_regime,
            ROUND(v_qty * COALESCE(NEW.internal_price_per_kg,0), 2), 'Automatiskt underlag vid utleverans')
    ON CONFLICT (transfer_order_id) DO NOTHING;
  END IF;
  RETURN NEW;
END; $$;

DROP TRIGGER IF EXISTS transfer_orders_ic_invoice ON public.transfer_orders;
CREATE TRIGGER transfer_orders_ic_invoice AFTER UPDATE ON public.transfer_orders
  FOR EACH ROW EXECUTE FUNCTION public.generate_intercompany_invoice();