-- 1. Per-user read state
CREATE TABLE public.notification_reads (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  notification_id uuid NOT NULL REFERENCES public.notifications(id) ON DELETE CASCADE,
  user_id uuid NOT NULL DEFAULT auth.uid(),
  read_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (notification_id, user_id)
);

GRANT SELECT, INSERT, DELETE ON public.notification_reads TO authenticated;
GRANT ALL ON public.notification_reads TO service_role;

ALTER TABLE public.notification_reads ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users read own notification reads"
  ON public.notification_reads FOR SELECT TO authenticated
  USING (user_id = auth.uid());

CREATE POLICY "Users create own notification reads"
  ON public.notification_reads FOR INSERT TO authenticated
  WITH CHECK (user_id = auth.uid());

CREATE POLICY "Users delete own notification reads"
  ON public.notification_reads FOR DELETE TO authenticated
  USING (user_id = auth.uid());

CREATE INDEX idx_notification_reads_user ON public.notification_reads (user_id, notification_id);

-- 2. Generic notification helper
CREATE OR REPLACE FUNCTION public.notify_event(
  _portals text[], _page text, _store uuid, _msg text, _etype text, _eid text
) RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  INSERT INTO public.notifications (portal, target_page, store_id, message, entity_type, entity_id)
  SELECT p, _page, _store, _msg, _etype, _eid FROM unnest(_portals) AS p;
END;
$$;

-- 3. Triggers for uncovered pages
CREATE OR REPLACE FUNCTION public.notify_schedule_event() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  PERFORM public.notify_event(
    CASE WHEN NEW.store_id IS NOT NULL THEN ARRAY['shop','wholesale'] ELSE ARRAY['wholesale','production'] END,
    '/schedule', NEW.store_id,
    'Ny kalenderhändelse: ' || COALESCE(NEW.title, 'utan titel'), 'schedule_event', NEW.id::text);
  RETURN NEW;
END; $$;
CREATE TRIGGER trg_notify_schedule_event AFTER INSERT ON public.schedule_events
FOR EACH ROW EXECUTE FUNCTION public.notify_schedule_event();

CREATE OR REPLACE FUNCTION public.notify_meeting_protocol() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  PERFORM public.notify_event(ARRAY['shop','wholesale'], '/meetings', NEW.store_id,
    'Nytt mötesprotokoll: ' || COALESCE(NEW.title, 'utan titel'), 'meeting_protocol', NEW.id::text);
  RETURN NEW;
END; $$;
CREATE TRIGGER trg_notify_meeting_protocol AFTER INSERT ON public.meeting_protocols
FOR EACH ROW EXECUTE FUNCTION public.notify_meeting_protocol();

CREATE OR REPLACE FUNCTION public.notify_shop_wish() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  PERFORM public.notify_event(ARRAY['shop'], '/wishes', NEW.store_id,
    'Nytt önskemål: ' || COALESCE(NEW.title, 'utan titel'), 'shop_wish', NEW.id::text);
  RETURN NEW;
END; $$;
CREATE TRIGGER trg_notify_shop_wish AFTER INSERT ON public.shop_wishes
FOR EACH ROW EXECUTE FUNCTION public.notify_shop_wish();

CREATE OR REPLACE FUNCTION public.notify_entity_image() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF NEW.entity_type = 'store' THEN
    PERFORM public.notify_event(ARRAY['shop'], '/organisation', NEW.entity_id::uuid,
      'Ny bild i butiken', 'entity_image', NEW.id::text);
  END IF;
  RETURN NEW;
END; $$;
CREATE TRIGGER trg_notify_entity_image AFTER INSERT ON public.entity_images
FOR EACH ROW EXECUTE FUNCTION public.notify_entity_image();

CREATE OR REPLACE FUNCTION public.notify_checklist_completed() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF NEW.status = 'completed' AND COALESCE(OLD.status, '') <> 'completed' THEN
    PERFORM public.notify_event(ARRAY['shop','wholesale'], '/checklist', NEW.store_id,
      'Checklista slutförd', 'checklist_day', NEW.id::text);
  END IF;
  RETURN NEW;
END; $$;
CREATE TRIGGER trg_notify_checklist_completed AFTER UPDATE ON public.checklist_days
FOR EACH ROW EXECUTE FUNCTION public.notify_checklist_completed();

CREATE OR REPLACE FUNCTION public.notify_inventory_report() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  PERFORM public.notify_event(ARRAY['shop','wholesale'], '/inventory', NEW.store_id,
    'Ny lagerrapport', 'inventory_report', NEW.id::text);
  RETURN NEW;
END; $$;
CREATE TRIGGER trg_notify_inventory_report AFTER INSERT ON public.inventory_reports
FOR EACH ROW EXECUTE FUNCTION public.notify_inventory_report();

CREATE OR REPLACE FUNCTION public.notify_weekly_report() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  PERFORM public.notify_event(ARRAY['shop','wholesale'], '/reports', NEW.store_id,
    'Ny veckorapport', 'weekly_report', NEW.id::text);
  RETURN NEW;
END; $$;
CREATE TRIGGER trg_notify_weekly_report AFTER INSERT ON public.weekly_reports
FOR EACH ROW EXECUTE FUNCTION public.notify_weekly_report();

CREATE OR REPLACE FUNCTION public.notify_shop_report() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  PERFORM public.notify_event(ARRAY['shop','wholesale'], '/reports', NEW.store_id,
    'Ny butiksrapport', 'shop_report', NEW.id::text);
  RETURN NEW;
END; $$;
CREATE TRIGGER trg_notify_shop_report AFTER INSERT ON public.shop_reports
FOR EACH ROW EXECUTE FUNCTION public.notify_shop_report();

CREATE OR REPLACE FUNCTION public.notify_new_customer() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  PERFORM public.notify_event(ARRAY['shop','wholesale'], '/customers', NEW.store_id,
    'Ny kund: ' || COALESCE(NEW.name, 'utan namn'), 'customer', NEW.id::text);
  RETURN NEW;
END; $$;
CREATE TRIGGER trg_notify_new_customer AFTER INSERT ON public.customers
FOR EACH ROW EXECUTE FUNCTION public.notify_new_customer();

CREATE OR REPLACE FUNCTION public.notify_new_supplier() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  PERFORM public.notify_event(ARRAY['wholesale','production'], '/suppliers', NULL,
    'Ny leverantör: ' || COALESCE(NEW.name, 'utan namn'), 'supplier', NEW.id::text);
  RETURN NEW;
END; $$;
CREATE TRIGGER trg_notify_new_supplier AFTER INSERT ON public.suppliers
FOR EACH ROW EXECUTE FUNCTION public.notify_new_supplier();

CREATE OR REPLACE FUNCTION public.notify_new_vehicle() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  PERFORM public.notify_event(ARRAY['wholesale'], '/vehicles', NULL,
    'Nytt fordon/maskin: ' || COALESCE(NEW.reg_number, 'utan reg.nr'), 'vehicle', NEW.id::text);
  RETURN NEW;
END; $$;
CREATE TRIGGER trg_notify_new_vehicle AFTER INSERT ON public.vehicles
FOR EACH ROW EXECUTE FUNCTION public.notify_new_vehicle();
CREATE TRIGGER trg_notify_new_machine AFTER INSERT ON public.machines
FOR EACH ROW EXECUTE FUNCTION public.notify_new_vehicle();