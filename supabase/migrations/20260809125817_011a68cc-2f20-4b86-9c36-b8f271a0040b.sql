CREATE OR REPLACE FUNCTION public.notify_customer_order()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_store text;
  v_who text;
BEGIN
  SELECT name INTO v_store FROM public.stores WHERE id = NEW.store_id;
  v_who := COALESCE(NEW.customer_name_snapshot, 'kund');

  IF TG_OP = 'INSERT' THEN
    PERFORM public.notify_event(ARRAY['shop','wholesale'], '/customer-orders', NEW.store_id,
      'Ny kundbeställning ' || NEW.order_number || ' — ' || v_who || ' ' || to_char(NEW.wanted_date, 'YYYY-MM-DD'),
      'customer_order', NEW.id::text);
    RETURN NEW;
  END IF;

  IF NEW.status IS DISTINCT FROM OLD.status THEN
    IF NEW.status = 'avbruten' THEN
      PERFORM public.notify_event(ARRAY['shop','wholesale'], '/customer-orders', NEW.store_id,
        'Kundbeställning ' || NEW.order_number || ' avbruten', 'customer_order', NEW.id::text);
    ELSIF NEW.status IN ('packad','levererad','avhamtad') THEN
      PERFORM public.notify_event(ARRAY['shop'], '/customer-orders', NEW.store_id,
        'Kundbeställning ' || NEW.order_number || ' är ' || NEW.status, 'customer_order', NEW.id::text);
    END IF;
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_notify_customer_order_ins ON public.customer_orders;
CREATE TRIGGER trg_notify_customer_order_ins
AFTER INSERT ON public.customer_orders
FOR EACH ROW EXECUTE FUNCTION public.notify_customer_order();

DROP TRIGGER IF EXISTS trg_notify_customer_order_upd ON public.customer_orders;
CREATE TRIGGER trg_notify_customer_order_upd
AFTER UPDATE ON public.customer_orders
FOR EACH ROW EXECUTE FUNCTION public.notify_customer_order();