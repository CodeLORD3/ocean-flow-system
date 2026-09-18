
CREATE TABLE public.store_replenishment_orders (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  order_number text NOT NULL UNIQUE,
  store_id uuid NOT NULL REFERENCES public.stores(id),
  supplier text NOT NULL DEFAULT 'grossist' CHECK (supplier IN ('grossist','produktion')),
  wanted_date date NOT NULL,
  status text NOT NULL DEFAULT 'utkast' CHECK (status IN ('utkast','skickad','bekraftad','avsand','mottagen','delvis_mottagen','makulerad')),
  intercompany boolean NOT NULL DEFAULT false,
  created_by uuid REFERENCES public.staff(id),
  created_by_name text,
  sent_at timestamptz,
  sent_by uuid REFERENCES public.staff(id),
  confirmed_at timestamptz,
  dispatched_at timestamptz,
  received_at timestamptz,
  cancelled_at timestamptz,
  auto_sent boolean NOT NULL DEFAULT false,
  note text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.store_replenishment_orders TO authenticated;
GRANT ALL ON public.store_replenishment_orders TO service_role;
ALTER TABLE public.store_replenishment_orders ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Personal hanterar butiksordrar" ON public.store_replenishment_orders
  FOR ALL TO authenticated
  USING (public.is_staff() AND public.can_see_store(store_id))
  WITH CHECK (public.is_staff() AND public.can_see_store(store_id));

CREATE UNIQUE INDEX store_replenishment_one_draft
  ON public.store_replenishment_orders (store_id, supplier, wanted_date)
  WHERE status = 'utkast';

CREATE TABLE public.store_replenishment_lines (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  order_id uuid NOT NULL REFERENCES public.store_replenishment_orders(id) ON DELETE CASCADE,
  product_id uuid NOT NULL REFERENCES public.products(id),
  quantity_ordered numeric NOT NULL CHECK (quantity_ordered > 0),
  unit text NOT NULL DEFAULT 'kg',
  source text NOT NULL DEFAULT 'manuell' CHECK (source IN ('inventering','manuell')),
  comment text,
  line_status text NOT NULL DEFAULT 'ny' CHECK (line_status IN ('ny','bekraftad','avvisad','plockad','mottagen')),
  rejection_reason text,
  quantity_confirmed numeric,
  quantity_shipped numeric,
  quantity_received numeric,
  receive_deviation_note text,
  dispatch_key text UNIQUE,
  created_by uuid REFERENCES public.staff(id),
  created_by_name text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.store_replenishment_lines TO authenticated;
GRANT ALL ON public.store_replenishment_lines TO service_role;
ALTER TABLE public.store_replenishment_lines ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Personal hanterar butiksorderrader" ON public.store_replenishment_lines
  FOR ALL TO authenticated
  USING (EXISTS (SELECT 1 FROM public.store_replenishment_orders o WHERE o.id = order_id AND public.is_staff() AND public.can_see_store(o.store_id)))
  WITH CHECK (EXISTS (SELECT 1 FROM public.store_replenishment_orders o WHERE o.id = order_id AND public.is_staff() AND public.can_see_store(o.store_id)));

CREATE INDEX store_replenishment_lines_order ON public.store_replenishment_lines (order_id);
CREATE UNIQUE INDEX store_replenishment_lines_one_per_product
  ON public.store_replenishment_lines (order_id, product_id);

CREATE TABLE public.store_replenishment_picks (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  line_id uuid NOT NULL REFERENCES public.store_replenishment_lines(id) ON DELETE CASCADE,
  lot_id uuid REFERENCES public.lots(id),
  quantity numeric NOT NULL CHECK (quantity > 0),
  dispatched boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.store_replenishment_picks TO authenticated;
GRANT ALL ON public.store_replenishment_picks TO service_role;
ALTER TABLE public.store_replenishment_picks ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Personal hanterar plockrader" ON public.store_replenishment_picks
  FOR ALL TO authenticated
  USING (EXISTS (
    SELECT 1 FROM public.store_replenishment_lines l
    JOIN public.store_replenishment_orders o ON o.id = l.order_id
    WHERE l.id = line_id AND public.is_staff() AND public.can_see_store(o.store_id)))
  WITH CHECK (EXISTS (
    SELECT 1 FROM public.store_replenishment_lines l
    JOIN public.store_replenishment_orders o ON o.id = l.order_id
    WHERE l.id = line_id AND public.is_staff() AND public.can_see_store(o.store_id)));

CREATE INDEX store_replenishment_picks_line ON public.store_replenishment_picks (line_id);

CREATE TABLE public.store_order_invoice_basis (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  order_id uuid NOT NULL UNIQUE REFERENCES public.store_replenishment_orders(id) ON DELETE CASCADE,
  seller_legal_entity_id text NOT NULL,
  buyer_legal_entity_id text NOT NULL,
  currency text NOT NULL DEFAULT 'SEK',
  amount_ex_vat numeric NOT NULL DEFAULT 0,
  status text NOT NULL DEFAULT 'underlag' CHECK (status IN ('underlag','fakturerad','makulerad')),
  note text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.store_order_invoice_basis TO authenticated;
GRANT ALL ON public.store_order_invoice_basis TO service_role;
ALTER TABLE public.store_order_invoice_basis ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Personal ser internhandelsunderlag" ON public.store_order_invoice_basis
  FOR ALL TO authenticated
  USING (EXISTS (SELECT 1 FROM public.store_replenishment_orders o WHERE o.id = order_id AND public.is_staff() AND public.can_see_store(o.store_id)))
  WITH CHECK (EXISTS (SELECT 1 FROM public.store_replenishment_orders o WHERE o.id = order_id AND public.is_staff() AND public.can_see_store(o.store_id)));

ALTER TABLE public.store_order_settings
  ADD COLUMN IF NOT EXISTS replenish_send_role text NOT NULL DEFAULT 'alla',
  ADD COLUMN IF NOT EXISTS replenish_auto_send_time time NOT NULL DEFAULT '15:00';

CREATE TRIGGER store_replenishment_orders_touch BEFORE UPDATE ON public.store_replenishment_orders
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
CREATE TRIGGER store_replenishment_lines_touch BEFORE UPDATE ON public.store_replenishment_lines
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
CREATE TRIGGER store_replenishment_picks_touch BEFORE UPDATE ON public.store_replenishment_picks
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
CREATE TRIGGER store_order_invoice_basis_touch BEFORE UPDATE ON public.store_order_invoice_basis
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- Automatskick: utkast med rader skickas när butikens tid passerats. Tomma
-- utkast rörs aldrig.
CREATE OR REPLACE FUNCTION public.store_replenishment_auto_send()
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  sent integer := 0;
BEGIN
  WITH due AS (
    SELECT o.id
    FROM public.store_replenishment_orders o
    LEFT JOIN public.store_order_settings s ON s.store_id = o.store_id
    WHERE o.status = 'utkast'
      AND o.wanted_date <= (now() AT TIME ZONE 'Europe/Stockholm')::date + 1
      AND (now() AT TIME ZONE 'Europe/Stockholm')::time >= COALESCE(s.replenish_auto_send_time, '15:00'::time)
      AND EXISTS (SELECT 1 FROM public.store_replenishment_lines l WHERE l.order_id = o.id)
  )
  UPDATE public.store_replenishment_orders o
  SET status = 'skickad', sent_at = now(), auto_sent = true
  WHERE o.id IN (SELECT id FROM due);
  GET DIAGNOSTICS sent = ROW_COUNT;
  RETURN sent;
END;
$$;

GRANT EXECUTE ON FUNCTION public.store_replenishment_auto_send() TO authenticated, service_role;
