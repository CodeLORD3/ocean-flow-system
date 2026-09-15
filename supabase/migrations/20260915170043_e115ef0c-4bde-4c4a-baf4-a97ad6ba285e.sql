ALTER TABLE public.shop_order_lines
  ADD COLUMN IF NOT EXISTS priority text NOT NULL DEFAULT 'nice',
  ADD COLUMN IF NOT EXISTS priority_qty numeric,
  ADD COLUMN IF NOT EXISTS priority_note text,
  ADD COLUMN IF NOT EXISTS priority_set_by text,
  ADD COLUMN IF NOT EXISTS priority_set_at timestamptz;

ALTER TABLE public.shop_order_lines
  DROP CONSTRAINT IF EXISTS shop_order_lines_priority_chk;
ALTER TABLE public.shop_order_lines
  ADD CONSTRAINT shop_order_lines_priority_chk CHECK (priority IN ('must','nice','skip'));

CREATE OR REPLACE FUNCTION public.notify_must_shop_order_line()
RETURNS trigger
LANGUAGE plpgsql
SET search_path TO 'public'
AS $function$
DECLARE
  store_name text;
  product_name text;
  qty numeric;
  msg text;
BEGIN
  IF NEW.priority <> 'must' THEN
    RETURN NEW;
  END IF;
  IF TG_OP = 'UPDATE'
     AND OLD.priority = 'must'
     AND OLD.priority_qty IS NOT DISTINCT FROM NEW.priority_qty
     AND OLD.priority_note IS NOT DISTINCT FROM NEW.priority_note THEN
    RETURN NEW;
  END IF;

  SELECT s.name INTO store_name
  FROM public.shop_orders o
  LEFT JOIN public.stores s ON s.id = o.store_id
  WHERE o.id = NEW.shop_order_id;

  SELECT p.name INTO product_name FROM public.products p WHERE p.id = NEW.product_id;

  qty := COALESCE(NEW.priority_qty, NEW.quantity_ordered);
  msg := 'Kundbeställt (måste med): '
      || COALESCE(product_name, 'produkt') || ' '
      || trim(to_char(qty, 'FM999999990.9')) || ' ' || COALESCE(NEW.unit, 'kg')
      || ' – ' || COALESCE(store_name, 'butik')
      || CASE WHEN NEW.priority_note IS NOT NULL AND NEW.priority_note <> ''
              THEN ' · ' || NEW.priority_note ELSE '' END;

  INSERT INTO public.notifications (portal, target_page, message, entity_type, entity_id)
  VALUES
    ('wholesale', '/orders', msg, 'shop_order', NEW.shop_order_id::text),
    ('production', '/orders', msg, 'shop_order', NEW.shop_order_id::text);

  RETURN NEW;
END;
$function$;

DROP TRIGGER IF EXISTS trg_notify_must_shop_order_line ON public.shop_order_lines;
CREATE TRIGGER trg_notify_must_shop_order_line
AFTER INSERT OR UPDATE OF priority, priority_qty, priority_note ON public.shop_order_lines
FOR EACH ROW EXECUTE FUNCTION public.notify_must_shop_order_line();