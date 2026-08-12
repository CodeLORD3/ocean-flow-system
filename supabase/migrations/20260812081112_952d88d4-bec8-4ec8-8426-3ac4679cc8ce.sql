CREATE TABLE public.store_opening_hours (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  store_id uuid NOT NULL REFERENCES public.stores(id) ON DELETE CASCADE,
  weekday smallint NOT NULL CHECK (weekday BETWEEN 0 AND 6),
  open_time time,
  close_time time,
  closed boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (store_id, weekday)
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.store_opening_hours TO authenticated;
GRANT ALL ON public.store_opening_hours TO service_role;

ALTER TABLE public.store_opening_hours ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Staff read opening hours" ON public.store_opening_hours
  FOR SELECT TO authenticated USING (public.is_staff());

CREATE POLICY "Store staff manage opening hours" ON public.store_opening_hours
  FOR ALL TO authenticated
  USING (public.staff_has_store(store_id) OR public.has_role(auth.uid(), 'admin'::app_role))
  WITH CHECK (public.staff_has_store(store_id) OR public.has_role(auth.uid(), 'admin'::app_role));

CREATE TRIGGER trg_store_opening_hours_updated
  BEFORE UPDATE ON public.store_opening_hours
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

CREATE TABLE public.staff_planned_shifts (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  staff_id uuid NOT NULL REFERENCES public.staff(id) ON DELETE CASCADE,
  store_id uuid REFERENCES public.stores(id) ON DELETE SET NULL,
  shift_date date NOT NULL,
  start_time time NOT NULL,
  end_time time NOT NULL,
  note text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX idx_planned_shifts_date ON public.staff_planned_shifts (shift_date, store_id);
CREATE INDEX idx_planned_shifts_staff ON public.staff_planned_shifts (staff_id, shift_date);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.staff_planned_shifts TO authenticated;
GRANT ALL ON public.staff_planned_shifts TO service_role;

ALTER TABLE public.staff_planned_shifts ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Staff read planned shifts" ON public.staff_planned_shifts
  FOR SELECT TO authenticated USING (public.is_staff());

CREATE POLICY "Store staff manage planned shifts" ON public.staff_planned_shifts
  FOR ALL TO authenticated
  USING (public.has_role(auth.uid(), 'admin'::app_role) OR (store_id IS NOT NULL AND public.staff_has_store(store_id)))
  WITH CHECK (public.has_role(auth.uid(), 'admin'::app_role) OR (store_id IS NOT NULL AND public.staff_has_store(store_id)));

CREATE TRIGGER trg_planned_shifts_updated
  BEFORE UPDATE ON public.staff_planned_shifts
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

ALTER PUBLICATION supabase_realtime ADD TABLE public.staff_shifts;
ALTER PUBLICATION supabase_realtime ADD TABLE public.staff_planned_shifts;