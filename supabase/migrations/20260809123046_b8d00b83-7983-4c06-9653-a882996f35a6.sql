-- Privatkundregister
CREATE TABLE public.customers_retail (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  store_id uuid REFERENCES public.stores(id) ON DELETE SET NULL,
  name text NOT NULL,
  phone text,
  email text,
  street text,
  postal_code text,
  city text,
  note text,
  excluded_allergens text[] NOT NULL DEFAULT '{}',
  anonymized_at timestamptz,
  created_by uuid REFERENCES public.staff(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX idx_customers_retail_phone ON public.customers_retail (phone);
CREATE INDEX idx_customers_retail_name ON public.customers_retail (lower(name));
CREATE INDEX idx_customers_retail_store ON public.customers_retail (store_id);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.customers_retail TO authenticated;
GRANT ALL ON public.customers_retail TO service_role;
ALTER TABLE public.customers_retail ENABLE ROW LEVEL SECURITY;

CREATE POLICY "cr_read" ON public.customers_retail FOR SELECT TO authenticated
  USING (public.is_staff_manager() OR public.staff_has_store(store_id));
CREATE POLICY "cr_insert" ON public.customers_retail FOR INSERT TO authenticated
  WITH CHECK (public.is_staff_manager() OR public.staff_has_store(store_id));
CREATE POLICY "cr_update" ON public.customers_retail FOR UPDATE TO authenticated
  USING (public.is_staff_manager() OR public.staff_has_store(store_id));
CREATE POLICY "cr_delete" ON public.customers_retail FOR DELETE TO authenticated
  USING (public.is_staff_manager() OR public.staff_has_store(store_id));

CREATE TRIGGER trg_customers_retail_updated BEFORE UPDATE ON public.customers_retail
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- Kundorder
CREATE TABLE public.customer_orders (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  order_number text NOT NULL UNIQUE,
  store_id uuid NOT NULL REFERENCES public.stores(id) ON DELETE RESTRICT,
  customer_id uuid REFERENCES public.customers_retail(id) ON DELETE SET NULL,
  customer_name_snapshot text,
  customer_phone_snapshot text,
  order_type text NOT NULL DEFAULT 'upphamtning'
    CHECK (order_type IN ('upphamtning','leverans')),
  category text NOT NULL DEFAULT 'vanlig'
    CHECK (category IN ('vanlig','catering')),
  wanted_date date NOT NULL,
  wanted_time time,
  delivery_street text,
  delivery_postal_code text,
  delivery_city text,
  guest_count integer,
  allergy_note text,
  excluded_allergens text[] NOT NULL DEFAULT '{}',
  pack_status text NOT NULL DEFAULT 'opackad'
    CHECK (pack_status IN ('opackad','pagaende','packad')),
  status text NOT NULL DEFAULT 'ny'
    CHECK (status IN ('forfragan','ny','bekraftad','packad','delvis_utlamnad','levererad','avhamtad','avbruten')),
  source text NOT NULL DEFAULT 'i_butik'
    CHECK (source IN ('telefon','i_butik','epost')),
  received_by uuid REFERENCES public.staff(id) ON DELETE SET NULL,
  received_by_name text,
  estimated_total numeric(12,2) NOT NULL DEFAULT 0,
  total_incl_vat numeric(12,2) NOT NULL DEFAULT 0,
  note text,
  packed_at timestamptz,
  handed_over_at timestamptz,
  cancelled_at timestamptz,
  created_by uuid REFERENCES public.staff(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX idx_co_store_date ON public.customer_orders (store_id, wanted_date);
CREATE INDEX idx_co_date ON public.customer_orders (wanted_date);
CREATE INDEX idx_co_customer ON public.customer_orders (customer_id);
CREATE INDEX idx_co_number ON public.customer_orders (order_number);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.customer_orders TO authenticated;
GRANT ALL ON public.customer_orders TO service_role;
ALTER TABLE public.customer_orders ENABLE ROW LEVEL SECURITY;

-- Alla i personalen får läsa order (övriga butiker visas i låst läge i gränssnittet)
CREATE POLICY "co_read" ON public.customer_orders FOR SELECT TO authenticated
  USING (public.is_staff());
CREATE POLICY "co_insert" ON public.customer_orders FOR INSERT TO authenticated
  WITH CHECK (public.is_staff_manager() OR public.staff_has_store(store_id));
CREATE POLICY "co_update" ON public.customer_orders FOR UPDATE TO authenticated
  USING (public.is_staff_manager() OR public.staff_has_store(store_id));
CREATE POLICY "co_delete" ON public.customer_orders FOR DELETE TO authenticated
  USING (public.is_staff_manager() OR public.staff_has_store(store_id));

CREATE TRIGGER trg_customer_orders_updated BEFORE UPDATE ON public.customer_orders
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- Orderrader
CREATE TABLE public.customer_order_lines (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  customer_order_id uuid NOT NULL REFERENCES public.customer_orders(id) ON DELETE CASCADE,
  product_id uuid REFERENCES public.products(id) ON DELETE SET NULL,
  original_product_id uuid REFERENCES public.products(id) ON DELETE SET NULL,
  free_text_name text,
  is_free_text boolean NOT NULL DEFAULT false,
  quantity_ordered numeric(12,3) NOT NULL,
  quantity_packed numeric(12,3),
  unit text NOT NULL DEFAULT 'kg',
  estimated_price_per_unit numeric(12,2),
  price_per_unit numeric(12,2),
  price_override_reason text,
  price_override_by text,
  line_total numeric(12,2),
  note text,
  pack_status text NOT NULL DEFAULT 'opackad'
    CHECK (pack_status IN ('opackad','packad','restnoterad','struken')),
  reservation_status text NOT NULL DEFAULT 'inkopsbehov'
    CHECK (reservation_status IN ('reserverad','inkopsbehov','ingen')),
  reserved_lot_id uuid REFERENCES public.lots(id) ON DELETE SET NULL,
  reserved_quantity numeric(12,3) NOT NULL DEFAULT 0,
  substitution_approved boolean NOT NULL DEFAULT false,
  substitution_note text,
  portion_per_guest numeric(12,3),
  locked_from_scaling boolean NOT NULL DEFAULT false,
  movement_id uuid REFERENCES public.stock_movements(id) ON DELETE SET NULL,
  packed_at timestamptz,
  packed_by uuid REFERENCES public.staff(id) ON DELETE SET NULL,
  sort_order integer NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX idx_col_order ON public.customer_order_lines (customer_order_id);
CREATE INDEX idx_col_product ON public.customer_order_lines (product_id);
CREATE INDEX idx_col_reservation ON public.customer_order_lines (reservation_status);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.customer_order_lines TO authenticated;
GRANT ALL ON public.customer_order_lines TO service_role;
ALTER TABLE public.customer_order_lines ENABLE ROW LEVEL SECURITY;

CREATE POLICY "col_read" ON public.customer_order_lines FOR SELECT TO authenticated
  USING (public.is_staff());
CREATE POLICY "col_write" ON public.customer_order_lines FOR ALL TO authenticated
  USING (public.is_staff_manager() OR EXISTS (
    SELECT 1 FROM public.customer_orders o
    WHERE o.id = customer_order_id AND public.staff_has_store(o.store_id)))
  WITH CHECK (public.is_staff_manager() OR EXISTS (
    SELECT 1 FROM public.customer_orders o
    WHERE o.id = customer_order_id AND public.staff_has_store(o.store_id)));

CREATE TRIGGER trg_customer_order_lines_updated BEFORE UPDATE ON public.customer_order_lines
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- Händelselogg (tidslinje)
CREATE TABLE public.customer_order_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  customer_order_id uuid NOT NULL REFERENCES public.customer_orders(id) ON DELETE CASCADE,
  event_type text NOT NULL,
  description text,
  old_value jsonb,
  new_value jsonb,
  performed_by text,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX idx_coe_order ON public.customer_order_events (customer_order_id, created_at DESC);

GRANT SELECT, INSERT ON public.customer_order_events TO authenticated;
GRANT ALL ON public.customer_order_events TO service_role;
ALTER TABLE public.customer_order_events ENABLE ROW LEVEL SECURITY;

CREATE POLICY "coe_read" ON public.customer_order_events FOR SELECT TO authenticated
  USING (public.is_staff());
CREATE POLICY "coe_insert" ON public.customer_order_events FOR INSERT TO authenticated
  WITH CHECK (public.is_staff());

-- Ny rörelsetyp: kundorderuttag hålls skilt från diskförsäljning
ALTER TABLE public.stock_movements DROP CONSTRAINT stock_movements_movement_type_check;
ALTER TABLE public.stock_movements ADD CONSTRAINT stock_movements_movement_type_check
  CHECK (movement_type = ANY (ARRAY['inleverans','tillverkning_in','tillverkning_ut',
    'overforing_in','overforing_ut','forsaljning','kundorder','svinn','justering','inventering']));

-- Ordernummer: BUTIKSKOD-ÅÅÅÅMMDD-NNN, säkert vid samtidiga order
CREATE OR REPLACE FUNCTION public.next_customer_order_number(_store_id uuid, _date date)
RETURNS text
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  code text;
  seq int;
BEGIN
  SELECT upper(left(regexp_replace(translate(coalesce(s.slug, s.name), 'åäöÅÄÖ', 'aaoAAO'), '[^a-zA-Z0-9]', '', 'g'), 4))
    INTO code FROM public.stores s WHERE s.id = _store_id;
  IF code IS NULL OR code = '' THEN
    code := 'BUT';
  END IF;

  PERFORM pg_advisory_xact_lock(hashtext(_store_id::text || _date::text));

  SELECT count(*) + 1 INTO seq
  FROM public.customer_orders o
  WHERE o.store_id = _store_id AND o.created_at::date = _date;

  RETURN code || '-' || to_char(_date, 'YYYYMMDD') || '-' || lpad(seq::text, 3, '0');
END;
$$;

REVOKE ALL ON FUNCTION public.next_customer_order_number(uuid, date) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.next_customer_order_number(uuid, date) TO authenticated, service_role;