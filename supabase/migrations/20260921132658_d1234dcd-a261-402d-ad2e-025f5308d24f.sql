-- 1. Kopplingar mellan områden: ungefärlig gångtid och avstånd
CREATE TABLE public.map_zone_connections (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  store_id uuid NOT NULL,
  floor_plan_id uuid REFERENCES public.floor_plans(id) ON DELETE CASCADE,
  from_zone_id uuid NOT NULL REFERENCES public.map_zones(id) ON DELETE CASCADE,
  to_zone_id uuid NOT NULL REFERENCES public.map_zones(id) ON DELETE CASCADE,
  walk_seconds integer,
  distance_meters numeric,
  active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT map_zone_connections_distinct CHECK (from_zone_id <> to_zone_id)
);
CREATE UNIQUE INDEX map_zone_connections_pair ON public.map_zone_connections (from_zone_id, to_zone_id);
CREATE INDEX map_zone_connections_store ON public.map_zone_connections (store_id);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.map_zone_connections TO authenticated;
GRANT ALL ON public.map_zone_connections TO service_role;
ALTER TABLE public.map_zone_connections ENABLE ROW LEVEL SECURITY;
CREATE POLICY map_zone_connections_read ON public.map_zone_connections
  FOR SELECT TO authenticated USING (true);
CREATE POLICY map_zone_connections_write ON public.map_zone_connections
  FOR ALL TO authenticated
  USING (has_role(auth.uid(), 'admin'::app_role) OR has_role(auth.uid(), 'store_manager'::app_role) OR is_platform_admin(auth.uid()))
  WITH CHECK (has_role(auth.uid(), 'admin'::app_role) OR has_role(auth.uid(), 'store_manager'::app_role) OR is_platform_admin(auth.uid()));

CREATE TRIGGER map_zone_connections_touch BEFORE UPDATE ON public.map_zone_connections
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- 2. Resursens normala plats enligt 5S och saker som hör till en annan sak
ALTER TABLE public.resource_locations
  ADD COLUMN IF NOT EXISTS is_normal_location boolean NOT NULL DEFAULT true,
  ADD COLUMN IF NOT EXISTS attached_to_resource_id uuid REFERENCES public.resource_items(id) ON DELETE SET NULL;

-- 3. Butikens valda standardväg per uppgiftsstandard
CREATE TABLE public.task_standard_routes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  template_item_id uuid NOT NULL REFERENCES public.checklist_template_items(id) ON DELETE CASCADE,
  store_id uuid NOT NULL,
  route_mode text NOT NULL DEFAULT 'calculated',
  stops jsonb NOT NULL DEFAULT '[]'::jsonb,
  version integer NOT NULL DEFAULT 1,
  total_meters numeric,
  walk_seconds integer,
  created_by_staff_id uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT task_standard_routes_mode CHECK (route_mode IN ('calculated', 'standard'))
);
CREATE UNIQUE INDEX task_standard_routes_key ON public.task_standard_routes (template_item_id, store_id);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.task_standard_routes TO authenticated;
GRANT ALL ON public.task_standard_routes TO service_role;
ALTER TABLE public.task_standard_routes ENABLE ROW LEVEL SECURITY;
CREATE POLICY task_standard_routes_read ON public.task_standard_routes
  FOR SELECT TO authenticated USING (true);
CREATE POLICY task_standard_routes_write ON public.task_standard_routes
  FOR ALL TO authenticated
  USING (has_role(auth.uid(), 'admin'::app_role) OR has_role(auth.uid(), 'store_manager'::app_role) OR is_platform_admin(auth.uid()))
  WITH CHECK (has_role(auth.uid(), 'admin'::app_role) OR has_role(auth.uid(), 'store_manager'::app_role) OR is_platform_admin(auth.uid()));

CREATE TRIGGER task_standard_routes_touch BEFORE UPDATE ON public.task_standard_routes
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- 4. Vilken arbetsväg som gällde när arbetet utfördes (historik, skrivs aldrig om)
CREATE TABLE public.task_route_snapshots (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  checklist_item_id uuid REFERENCES public.checklist_items(id) ON DELETE SET NULL,
  template_item_id uuid REFERENCES public.checklist_template_items(id) ON DELETE SET NULL,
  store_id uuid,
  stops jsonb NOT NULL DEFAULT '[]'::jsonb,
  total_meters numeric,
  walk_seconds integer,
  route_source text NOT NULL DEFAULT 'calculated',
  route_version integer,
  created_by_staff_id uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT task_route_snapshots_source CHECK (route_source IN ('calculated', 'standard', 'manual'))
);
CREATE INDEX task_route_snapshots_item ON public.task_route_snapshots (checklist_item_id);
CREATE INDEX task_route_snapshots_template ON public.task_route_snapshots (template_item_id, store_id);

GRANT SELECT, INSERT ON public.task_route_snapshots TO authenticated;
GRANT ALL ON public.task_route_snapshots TO service_role;
ALTER TABLE public.task_route_snapshots ENABLE ROW LEVEL SECURITY;
CREATE POLICY task_route_snapshots_read ON public.task_route_snapshots
  FOR SELECT TO authenticated USING (true);
CREATE POLICY task_route_snapshots_insert ON public.task_route_snapshots
  FOR INSERT TO authenticated WITH CHECK (true);