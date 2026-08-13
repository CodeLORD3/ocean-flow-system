-- 1. Flagg-tabell för inventeringsavvikelser (negativt saldo)
CREATE TABLE public.stock_negative_flags (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  product_id uuid NOT NULL REFERENCES public.products(id) ON DELETE CASCADE,
  location_id uuid NOT NULL REFERENCES public.storage_locations(id) ON DELETE CASCADE,
  movement_id uuid REFERENCES public.stock_movements(id) ON DELETE SET NULL,
  resulting_qty numeric NOT NULL,
  movement_qty numeric,
  movement_type text,
  driver_note text,
  suggested_lot_id uuid REFERENCES public.lots(id) ON DELETE SET NULL,
  acknowledged_at timestamptz,
  acknowledged_by uuid,
  ack_note text,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX idx_neg_flags_open ON public.stock_negative_flags (acknowledged_at, created_at DESC);

GRANT SELECT, INSERT, UPDATE ON public.stock_negative_flags TO authenticated;
GRANT ALL ON public.stock_negative_flags TO service_role;

ALTER TABLE public.stock_negative_flags ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Staff can read negative flags"
  ON public.stock_negative_flags FOR SELECT TO authenticated
  USING (public.is_staff() OR public.has_role(auth.uid(), 'admin'));

CREATE POLICY "Staff can acknowledge negative flags"
  ON public.stock_negative_flags FOR UPDATE TO authenticated
  USING (public.is_staff() OR public.has_role(auth.uid(), 'admin'))
  WITH CHECK (public.is_staff() OR public.has_role(auth.uid(), 'admin'));

-- 2. Trigger: flagga när ett uttag driver saldot negativt (blockerar aldrig)
CREATE OR REPLACE FUNCTION public.zz_flag_negative_balance()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_qty numeric;
  v_lot uuid;
BEGIN
  IF NEW.quantity_kg >= 0 THEN
    RETURN NEW;
  END IF;

  SELECT quantity INTO v_qty
  FROM public.product_stock_locations
  WHERE product_id = NEW.product_id AND location_id = NEW.location_id;

  IF v_qty IS NULL OR v_qty >= 0 THEN
    RETURN NEW;
  END IF;

  -- Föreslå det parti som borde ha burit uttaget (äldsta aktiva partiet för SKU:n)
  SELECT l.id INTO v_lot
  FROM public.lots l
  WHERE l.product_id = NEW.product_id
    AND l.status = 'aktiv'
  ORDER BY l.best_before NULLS LAST, l.created_at
  LIMIT 1;

  INSERT INTO public.stock_negative_flags (
    product_id, location_id, movement_id, resulting_qty, movement_qty,
    movement_type, driver_note, suggested_lot_id
  ) VALUES (
    NEW.product_id, NEW.location_id, NEW.id, v_qty, NEW.quantity_kg,
    NEW.movement_type, NEW.note, COALESCE(NEW.lot_id, v_lot)
  );

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS zz_flag_negative_balance ON public.stock_movements;
CREATE TRIGGER zz_flag_negative_balance
AFTER INSERT ON public.stock_movements
FOR EACH ROW EXECUTE FUNCTION public.zz_flag_negative_balance();

-- 3. Rätta de befintliga negativa saldona: flagga dem + bokför justering till noll
WITH neg AS (
  SELECT psl.product_id, psl.location_id, psl.quantity
  FROM public.product_stock_locations psl
  WHERE psl.quantity < 0
), driver AS (
  SELECT n.product_id, n.location_id, n.quantity,
         (SELECT m.id FROM public.stock_movements m
           WHERE m.product_id = n.product_id AND m.location_id = n.location_id AND m.quantity_kg < 0
           ORDER BY m.created_at DESC LIMIT 1) AS movement_id,
         (SELECT m.note FROM public.stock_movements m
           WHERE m.product_id = n.product_id AND m.location_id = n.location_id AND m.quantity_kg < 0
           ORDER BY m.created_at DESC LIMIT 1) AS note,
         (SELECT m.movement_type FROM public.stock_movements m
           WHERE m.product_id = n.product_id AND m.location_id = n.location_id AND m.quantity_kg < 0
           ORDER BY m.created_at DESC LIMIT 1) AS mtype,
         (SELECT l.id FROM public.lots l
           WHERE l.product_id = n.product_id AND l.status = 'aktiv'
           ORDER BY l.best_before NULLS LAST, l.created_at LIMIT 1) AS lot_id
  FROM neg n
)
INSERT INTO public.stock_negative_flags (
  product_id, location_id, movement_id, resulting_qty, movement_qty,
  movement_type, driver_note, suggested_lot_id
)
SELECT product_id, location_id, movement_id, quantity, quantity, mtype,
       COALESCE(note, 'Okänt uttag') || ' (historiskt negativt saldo, nollställt vid genomgång 2026-08-13)',
       lot_id
FROM driver;

INSERT INTO public.stock_movements (
  product_id, location_id, movement_type, quantity_kg, reference_type, note
)
SELECT psl.product_id, psl.location_id, 'justering', -psl.quantity, 'inventeringsavvikelse',
       'Nollställning av negativt saldo — inventeringsavvikelse att kvittera (2026-08-13)'
FROM public.product_stock_locations psl
WHERE psl.quantity < 0;