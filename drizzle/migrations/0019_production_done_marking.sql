ALTER TABLE public.products ADD COLUMN IF NOT EXISTS is_production_item boolean NOT NULL DEFAULT false;
UPDATE public.products SET is_production_item = true WHERE producer = 'Produktion';

ALTER TABLE public.shop_orders
  ADD COLUMN IF NOT EXISTS production_done_at timestamptz,
  ADD COLUMN IF NOT EXISTS production_done_by uuid,
  ADD COLUMN IF NOT EXISTS production_done_by_name text,
  ADD COLUMN IF NOT EXISTS production_missing_count integer NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS production_done_snapshot jsonb,
  ADD COLUMN IF NOT EXISTS production_changed_after_done boolean NOT NULL DEFAULT false;

ALTER TABLE public.shop_order_lines ADD COLUMN IF NOT EXISTS production_missing boolean NOT NULL DEFAULT false;

-- Ångra: bara den som klarmarkerade eller admin, och inte när ordern är skickad.
CREATE OR REPLACE FUNCTION public.guard_production_done_undo()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF OLD.production_done_at IS NOT NULL AND NEW.production_done_at IS NULL THEN
    IF OLD.status IN ('Skickad','Levererad','Klar / Levererad') THEN
      RAISE EXCEPTION 'Ordern är redan skickad, klarmarkeringen kan inte ångras';
    END IF;
    IF auth.uid() IS NOT NULL AND auth.uid() IS DISTINCT FROM OLD.production_done_by AND NOT public.is_hr_admin() THEN
      RAISE EXCEPTION 'Bara den som klarmarkerade eller admin kan ångra';
    END IF;
  END IF;
  IF NEW.production_done_at IS NOT NULL AND NEW.production_done_at IS DISTINCT FROM OLD.production_done_at THEN
    NEW.production_done_by := COALESCE(auth.uid(), NEW.production_done_by);
  END IF;
  RETURN NEW;
END $$;
DROP TRIGGER IF EXISTS trg_guard_production_done_undo ON public.shop_orders;
CREATE TRIGGER trg_guard_production_done_undo BEFORE UPDATE ON public.shop_orders
  FOR EACH ROW EXECUTE FUNCTION public.guard_production_done_undo();

-- Ny rad eller ökad mängd på produktionens vara efter klarmarkering.
CREATE OR REPLACE FUNCTION public.flag_production_change_after_done()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF NEW.shop_order_id IS NULL THEN RETURN NEW; END IF;
  IF TG_OP = 'UPDATE' AND COALESCE(NEW.quantity_ordered,0) <= COALESCE(OLD.quantity_ordered,0)
     AND NEW.product_id IS NOT DISTINCT FROM OLD.product_id THEN
    RETURN NEW;
  END IF;
  IF EXISTS (SELECT 1 FROM products p WHERE p.id = NEW.product_id AND p.is_production_item) THEN
    UPDATE shop_orders SET production_changed_after_done = true
     WHERE id = NEW.shop_order_id AND production_done_at IS NOT NULL AND NOT production_changed_after_done;
  END IF;
  RETURN NEW;
END $$;
DROP TRIGGER IF EXISTS trg_flag_production_change_after_done ON public.shop_order_lines;
CREATE TRIGGER trg_flag_production_change_after_done AFTER INSERT OR UPDATE OF quantity_ordered, product_id ON public.shop_order_lines
  FOR EACH ROW EXECUTE FUNCTION public.flag_production_change_after_done();