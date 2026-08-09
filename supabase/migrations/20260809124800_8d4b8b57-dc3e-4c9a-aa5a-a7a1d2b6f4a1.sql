ALTER TABLE public.products ADD COLUMN IF NOT EXISTS allergens text[] NOT NULL DEFAULT '{}';

ALTER TABLE public.schedule_events ADD COLUMN IF NOT EXISTS customer_order_id uuid REFERENCES public.customer_orders(id) ON DELETE CASCADE;
CREATE INDEX IF NOT EXISTS idx_schedule_events_customer_order ON public.schedule_events(customer_order_id);

CREATE TABLE public.store_order_settings (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  store_id uuid NOT NULL UNIQUE REFERENCES public.stores(id) ON DELETE CASCADE,
  opening_hours jsonb NOT NULL DEFAULT '{"1":{"open":"10:00","close":"18:00"},"2":{"open":"10:00","close":"18:00"},"3":{"open":"10:00","close":"18:00"},"4":{"open":"10:00","close":"18:00"},"5":{"open":"10:00","close":"18:00"},"6":{"open":"10:00","close":"15:00"},"0":null}'::jsonb,
  max_catering_per_day integer NOT NULL DEFAULT 10,
  max_deliveries_per_slot integer NOT NULL DEFAULT 4,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.store_order_settings TO authenticated;
GRANT ALL ON public.store_order_settings TO service_role;
ALTER TABLE public.store_order_settings ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Staff read store order settings" ON public.store_order_settings FOR SELECT TO authenticated USING (public.is_staff());
CREATE POLICY "Store staff manage own order settings" ON public.store_order_settings FOR ALL TO authenticated
  USING (public.staff_has_store(store_id) OR public.has_role(auth.uid(), 'admin'))
  WITH CHECK (public.staff_has_store(store_id) OR public.has_role(auth.uid(), 'admin'));
CREATE TRIGGER trg_store_order_settings_updated BEFORE UPDATE ON public.store_order_settings FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

CREATE TABLE public.store_special_days (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  store_id uuid NOT NULL REFERENCES public.stores(id) ON DELETE CASCADE,
  day date NOT NULL,
  closed boolean NOT NULL DEFAULT false,
  open_time time,
  close_time time,
  note text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (store_id, day)
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.store_special_days TO authenticated;
GRANT ALL ON public.store_special_days TO service_role;
ALTER TABLE public.store_special_days ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Staff read special days" ON public.store_special_days FOR SELECT TO authenticated USING (public.is_staff());
CREATE POLICY "Store staff manage own special days" ON public.store_special_days FOR ALL TO authenticated
  USING (public.staff_has_store(store_id) OR public.has_role(auth.uid(), 'admin'))
  WITH CHECK (public.staff_has_store(store_id) OR public.has_role(auth.uid(), 'admin'));
CREATE TRIGGER trg_store_special_days_updated BEFORE UPDATE ON public.store_special_days FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

CREATE TABLE public.major_holidays (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  holiday_date date NOT NULL,
  last_order_date date NOT NULL,
  capacity_cap integer,
  open_time time,
  close_time time,
  store_id uuid REFERENCES public.stores(id) ON DELETE CASCADE,
  note text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.major_holidays TO authenticated;
GRANT ALL ON public.major_holidays TO service_role;
ALTER TABLE public.major_holidays ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Staff read major holidays" ON public.major_holidays FOR SELECT TO authenticated USING (public.is_staff());
CREATE POLICY "Admins manage major holidays" ON public.major_holidays FOR ALL TO authenticated
  USING (public.has_role(auth.uid(), 'admin'))
  WITH CHECK (public.has_role(auth.uid(), 'admin'));
CREATE TRIGGER trg_major_holidays_updated BEFORE UPDATE ON public.major_holidays FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

CREATE OR REPLACE FUNCTION public.sync_customer_order_calendar()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_needs boolean;
  v_title text;
  v_place text;
BEGIN
  v_needs := NEW.status <> 'avbruten'
             AND (NEW.order_type = 'leverans' OR NEW.category = 'catering');

  IF NOT v_needs THEN
    DELETE FROM public.schedule_events WHERE customer_order_id = NEW.id;
    RETURN NEW;
  END IF;

  v_title := NEW.order_number || ' — ' || COALESCE(NEW.customer_name_snapshot, 'Kund');
  IF NEW.order_type = 'leverans' THEN
    v_place := concat_ws(', ', NEW.delivery_street, NEW.delivery_postal_code, NEW.delivery_city);
  ELSE
    v_place := (SELECT name FROM public.stores WHERE id = NEW.store_id);
  END IF;

  UPDATE public.schedule_events
     SET title = v_title,
         event_date = NEW.wanted_date,
         start_time = NEW.wanted_time,
         store_id = NEW.store_id,
         description = concat_ws(E'\n', v_place, NEW.note)
   WHERE customer_order_id = NEW.id;

  IF NOT FOUND THEN
    INSERT INTO public.schedule_events (title, event_date, start_time, store_id, portal, event_type, severity, description, customer_order_id, all_day)
    VALUES (v_title, NEW.wanted_date, NEW.wanted_time, NEW.store_id, 'shop',
            CASE WHEN NEW.category = 'catering' THEN 'catering' ELSE 'leverans' END,
            'info', concat_ws(E'\n', v_place, NEW.note), NEW.id, NEW.wanted_time IS NULL);
  END IF;

  RETURN NEW;
END;
$$;

CREATE TRIGGER trg_customer_order_calendar
AFTER INSERT OR UPDATE OF wanted_date, wanted_time, order_type, category, status, delivery_street, delivery_postal_code, delivery_city, customer_name_snapshot, note
ON public.customer_orders
FOR EACH ROW EXECUTE FUNCTION public.sync_customer_order_calendar();