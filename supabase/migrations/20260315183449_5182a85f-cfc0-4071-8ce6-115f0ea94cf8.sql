
-- Notifications table for global notification system
CREATE TABLE public.notifications (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  portal text NOT NULL DEFAULT 'wholesale',
  target_page text NOT NULL,
  store_id uuid REFERENCES public.stores(id) ON DELETE CASCADE,
  message text NOT NULL,
  entity_type text,
  entity_id text,
  is_read boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now()
);

-- Enable RLS
ALTER TABLE public.notifications ENABLE ROW LEVEL SECURITY;

-- Public access policy
CREATE POLICY "Public access" ON public.notifications FOR ALL TO public USING (true) WITH CHECK (true);

-- Index for fast lookups
CREATE INDEX idx_notifications_unread ON public.notifications (portal, target_page, is_read) WHERE is_read = false;
CREATE INDEX idx_notifications_store ON public.notifications (store_id, target_page, is_read) WHERE is_read = false;

-- Trigger: New shop order → notify wholesale + production /orders
CREATE OR REPLACE FUNCTION public.notify_new_shop_order()
RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE
  store_name text;
BEGIN
  SELECT name INTO store_name FROM public.stores WHERE id = NEW.store_id;
  INSERT INTO public.notifications (portal, target_page, message, entity_type, entity_id)
  VALUES 
    ('wholesale', '/orders', 'Ny order från ' || COALESCE(store_name, 'butik') || ' (v.' || NEW.order_week || ')', 'shop_order', NEW.id::text),
    ('production', '/orders', 'Ny order från ' || COALESCE(store_name, 'butik') || ' (v.' || NEW.order_week || ')', 'shop_order', NEW.id::text);
  RETURN NEW;
END;
$$;

CREATE TRIGGER trg_notify_new_shop_order
  AFTER INSERT ON public.shop_orders
  FOR EACH ROW EXECUTE FUNCTION public.notify_new_shop_order();

-- Trigger: Change request created → notify relevant portal
CREATE OR REPLACE FUNCTION public.notify_change_request()
RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE
  v_store_id uuid;
  store_name text;
BEGIN
  SELECT so.store_id, s.name INTO v_store_id, store_name
  FROM public.shop_orders so
  JOIN public.stores s ON s.id = so.store_id
  WHERE so.id = NEW.shop_order_id;

  IF NEW.requested_by = 'wholesale' THEN
    -- Wholesale made a change → notify the shop
    INSERT INTO public.notifications (portal, target_page, store_id, message, entity_type, entity_id)
    VALUES ('shop', '/orders', v_store_id, 'Ändringsförfrågan på din order (' || NEW.change_type || ')', 'change_request', NEW.id::text);
  ELSE
    -- Shop made a change → notify wholesale
    INSERT INTO public.notifications (portal, target_page, message, entity_type, entity_id)
    VALUES ('wholesale', '/orders', 'Ändringsförfrågan från ' || COALESCE(store_name, 'butik') || ' (' || NEW.change_type || ')', 'change_request', NEW.id::text);
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER trg_notify_change_request
  AFTER INSERT ON public.shop_order_change_requests
  FOR EACH ROW EXECUTE FUNCTION public.notify_change_request();

-- Trigger: Order status → Skickad → notify shop /receiving
CREATE OR REPLACE FUNCTION public.notify_order_shipped()
RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF NEW.status = 'Skickad' AND (OLD.status IS DISTINCT FROM 'Skickad') THEN
    INSERT INTO public.notifications (portal, target_page, store_id, message, entity_type, entity_id)
    VALUES ('shop', '/receiving', NEW.store_id, 'En leverans har skickats till din butik', 'shop_order', NEW.id::text);
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER trg_notify_order_shipped
  AFTER UPDATE ON public.shop_orders
  FOR EACH ROW EXECUTE FUNCTION public.notify_order_shipped();

-- Trigger: New delivery note (after packing) → notify wholesale /invoices
CREATE OR REPLACE FUNCTION public.notify_new_delivery_note()
RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE
  store_name text;
BEGIN
  SELECT name INTO store_name FROM public.stores WHERE id = NEW.store_id;
  INSERT INTO public.notifications (portal, target_page, message, entity_type, entity_id)
  VALUES ('wholesale', '/invoices', 'Ny följesedel ' || NEW.note_number || ' för ' || COALESCE(store_name, 'butik'), 'delivery_note', NEW.id::text);
  RETURN NEW;
END;
$$;

CREATE TRIGGER trg_notify_new_delivery_note
  AFTER INSERT ON public.delivery_notes
  FOR EACH ROW EXECUTE FUNCTION public.notify_new_delivery_note();

-- Trigger: New purchase report → notify wholesale /purchase-schedule
CREATE OR REPLACE FUNCTION public.notify_new_purchase_report()
RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  INSERT INTO public.notifications (portal, target_page, message, entity_type, entity_id)
  VALUES ('wholesale', '/purchase-schedule', 'Ny inköpsrapport: ' || COALESCE(NEW.display_name, NEW.file_name), 'purchase_report', NEW.id::text);
  RETURN NEW;
END;
$$;

CREATE TRIGGER trg_notify_new_purchase_report
  AFTER INSERT ON public.purchase_reports
  FOR EACH ROW EXECUTE FUNCTION public.notify_new_purchase_report();

-- Trigger: New production report → notify production /production-schedule
CREATE OR REPLACE FUNCTION public.notify_new_production_report()
RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  INSERT INTO public.notifications (portal, target_page, message, entity_type, entity_id)
  VALUES ('production', '/production-schedule', 'Ny produktionsrapport: ' || COALESCE(NEW.display_name, NEW.report_name), 'production_report', NEW.id::text);
  RETURN NEW;
END;
$$;

CREATE TRIGGER trg_notify_new_production_report
  AFTER INSERT ON public.production_reports
  FOR EACH ROW EXECUTE FUNCTION public.notify_new_production_report();

-- Trigger: Shop order lines added (new products in order) → notify wholesale + production /purchase-schedule and /production-schedule
CREATE OR REPLACE FUNCTION public.notify_new_order_lines()
RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE
  prod_cat text;
  prod_name text;
BEGIN
  SELECT category, name INTO prod_cat, prod_name FROM public.products WHERE id = NEW.product_id;
  
  IF prod_cat = 'Produktion' THEN
    INSERT INTO public.notifications (portal, target_page, message, entity_type, entity_id)
    VALUES ('production', '/production-schedule', 'Ny orderrad: ' || COALESCE(prod_name, 'produkt'), 'shop_order_line', NEW.id::text);
  ELSE
    INSERT INTO public.notifications (portal, target_page, message, entity_type, entity_id)
    VALUES ('wholesale', '/purchase-schedule', 'Ny orderrad: ' || COALESCE(prod_name, 'produkt'), 'shop_order_line', NEW.id::text);
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER trg_notify_new_order_lines
  AFTER INSERT ON public.shop_order_lines
  FOR EACH ROW EXECUTE FUNCTION public.notify_new_order_lines();
