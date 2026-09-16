ALTER TABLE public.map_zones ADD COLUMN IF NOT EXISTS area_sqm numeric;
ALTER TABLE public.map_objects ADD COLUMN IF NOT EXISTS area_sqm numeric;
ALTER TABLE public.floor_plans ADD COLUMN IF NOT EXISTS px_per_meter numeric;

CREATE TABLE IF NOT EXISTS public.map_pins (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  floor_plan_id uuid NOT NULL REFERENCES public.floor_plans(id) ON DELETE CASCADE,
  store_id uuid NOT NULL,
  zone_id uuid REFERENCES public.map_zones(id) ON DELETE SET NULL,
  map_object_id uuid REFERENCES public.map_objects(id) ON DELETE SET NULL,
  x numeric NOT NULL,
  y numeric NOT NULL,
  kind text NOT NULL DEFAULT 'note',
  title text NOT NULL,
  body text,
  assigned_staff_id uuid,
  assigned_name text,
  due_date date,
  status text NOT NULL DEFAULT 'open',
  created_by uuid DEFAULT auth.uid(),
  created_by_name text,
  done_at timestamptz,
  done_by_name text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS map_pins_plan_idx ON public.map_pins(floor_plan_id);
CREATE INDEX IF NOT EXISTS map_pins_store_idx ON public.map_pins(store_id);
CREATE INDEX IF NOT EXISTS map_pins_assigned_idx ON public.map_pins(assigned_staff_id);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.map_pins TO authenticated;
GRANT ALL ON public.map_pins TO service_role;

ALTER TABLE public.map_pins ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Personal ser punkter i sina butiker"
ON public.map_pins FOR SELECT TO authenticated
USING (public.can_see_store(store_id) OR public.is_platform_admin(auth.uid()));

CREATE POLICY "Personal skapar punkter i sina butiker"
ON public.map_pins FOR INSERT TO authenticated
WITH CHECK (public.can_see_store(store_id) OR public.is_platform_admin(auth.uid()));

CREATE POLICY "Personal uppdaterar punkter i sina butiker"
ON public.map_pins FOR UPDATE TO authenticated
USING (public.can_see_store(store_id) OR public.is_platform_admin(auth.uid()))
WITH CHECK (public.can_see_store(store_id) OR public.is_platform_admin(auth.uid()));

CREATE POLICY "Skapare eller admin tar bort punkter"
ON public.map_pins FOR DELETE TO authenticated
USING (created_by = auth.uid() OR public.is_platform_admin(auth.uid()));

CREATE TRIGGER map_pins_updated_at
BEFORE UPDATE ON public.map_pins
FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();