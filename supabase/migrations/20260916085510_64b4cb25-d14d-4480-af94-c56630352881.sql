-- ============ Butikskarta: nya entiteter ============

CREATE TABLE public.floor_plans (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  store_id uuid NOT NULL REFERENCES public.stores(id) ON DELETE CASCADE,
  name text NOT NULL,
  floor_label text,
  background_url text,
  background_opacity numeric NOT NULL DEFAULT 0.45,
  background_scale numeric NOT NULL DEFAULT 1,
  background_x numeric NOT NULL DEFAULT 0,
  background_y numeric NOT NULL DEFAULT 0,
  background_locked boolean NOT NULL DEFAULT true,
  width numeric NOT NULL DEFAULT 1200,
  height numeric NOT NULL DEFAULT 800,
  grid_size numeric NOT NULL DEFAULT 20,
  status text NOT NULL DEFAULT 'draft',
  published_at timestamptz,
  created_by uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.floor_plans TO authenticated;
GRANT ALL ON public.floor_plans TO service_role;
ALTER TABLE public.floor_plans ENABLE ROW LEVEL SECURITY;
CREATE POLICY "floor_plans_read" ON public.floor_plans FOR SELECT TO authenticated
  USING (public.can_see_store(store_id));
CREATE POLICY "floor_plans_write" ON public.floor_plans FOR ALL TO authenticated
  USING (public.is_platform_admin(auth.uid()) OR public.has_role(auth.uid(), 'admin'))
  WITH CHECK (public.is_platform_admin(auth.uid()) OR public.has_role(auth.uid(), 'admin'));

CREATE TABLE public.floor_plan_versions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  floor_plan_id uuid NOT NULL REFERENCES public.floor_plans(id) ON DELETE CASCADE,
  version integer NOT NULL,
  snapshot jsonb NOT NULL,
  note text,
  published_by uuid,
  published_by_name text,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (floor_plan_id, version)
);
GRANT SELECT, INSERT ON public.floor_plan_versions TO authenticated;
GRANT ALL ON public.floor_plan_versions TO service_role;
ALTER TABLE public.floor_plan_versions ENABLE ROW LEVEL SECURITY;
CREATE POLICY "floor_plan_versions_read" ON public.floor_plan_versions FOR SELECT TO authenticated
  USING (EXISTS (SELECT 1 FROM public.floor_plans fp WHERE fp.id = floor_plan_id AND public.can_see_store(fp.store_id)));
CREATE POLICY "floor_plan_versions_write" ON public.floor_plan_versions FOR INSERT TO authenticated
  WITH CHECK (public.is_platform_admin(auth.uid()) OR public.has_role(auth.uid(), 'admin'));

CREATE TABLE public.map_geometry (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  floor_plan_id uuid NOT NULL REFERENCES public.floor_plans(id) ON DELETE CASCADE,
  kind text NOT NULL DEFAULT 'wall',
  x1 numeric NOT NULL,
  y1 numeric NOT NULL,
  x2 numeric NOT NULL,
  y2 numeric NOT NULL,
  thickness numeric NOT NULL DEFAULT 6,
  label text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.map_geometry TO authenticated;
GRANT ALL ON public.map_geometry TO service_role;
ALTER TABLE public.map_geometry ENABLE ROW LEVEL SECURITY;
CREATE POLICY "map_geometry_read" ON public.map_geometry FOR SELECT TO authenticated
  USING (EXISTS (SELECT 1 FROM public.floor_plans fp WHERE fp.id = floor_plan_id AND public.can_see_store(fp.store_id)));
CREATE POLICY "map_geometry_write" ON public.map_geometry FOR ALL TO authenticated
  USING (public.is_platform_admin(auth.uid()) OR public.has_role(auth.uid(), 'admin'))
  WITH CHECK (public.is_platform_admin(auth.uid()) OR public.has_role(auth.uid(), 'admin'));

CREATE TABLE public.map_zones (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  floor_plan_id uuid NOT NULL REFERENCES public.floor_plans(id) ON DELETE CASCADE,
  store_id uuid NOT NULL REFERENCES public.stores(id) ON DELETE CASCADE,
  name text NOT NULL,
  zone_key text,
  color text,
  x numeric NOT NULL DEFAULT 0,
  y numeric NOT NULL DEFAULT 0,
  width numeric NOT NULL DEFAULT 200,
  height numeric NOT NULL DEFAULT 150,
  points jsonb,
  sort_order integer NOT NULL DEFAULT 100,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.map_zones TO authenticated;
GRANT ALL ON public.map_zones TO service_role;
ALTER TABLE public.map_zones ENABLE ROW LEVEL SECURITY;
CREATE POLICY "map_zones_read" ON public.map_zones FOR SELECT TO authenticated
  USING (public.can_see_store(store_id));
CREATE POLICY "map_zones_write" ON public.map_zones FOR ALL TO authenticated
  USING (public.is_platform_admin(auth.uid()) OR public.has_role(auth.uid(), 'admin'))
  WITH CHECK (public.is_platform_admin(auth.uid()) OR public.has_role(auth.uid(), 'admin'));

CREATE TABLE public.map_object_types (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  key text NOT NULL UNIQUE,
  name text NOT NULL,
  category text NOT NULL,
  icon text,
  shape text NOT NULL DEFAULT 'box',
  default_width numeric NOT NULL DEFAULT 60,
  default_height numeric NOT NULL DEFAULT 40,
  color text,
  recommended_tasks jsonb NOT NULL DEFAULT '[]'::jsonb,
  supports_temperature boolean NOT NULL DEFAULT false,
  sort_order integer NOT NULL DEFAULT 100,
  active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.map_object_types TO authenticated;
GRANT ALL ON public.map_object_types TO service_role;
ALTER TABLE public.map_object_types ENABLE ROW LEVEL SECURITY;
CREATE POLICY "map_object_types_read" ON public.map_object_types FOR SELECT TO authenticated USING (true);
CREATE POLICY "map_object_types_write" ON public.map_object_types FOR ALL TO authenticated
  USING (public.is_platform_admin(auth.uid()) OR public.has_role(auth.uid(), 'admin'))
  WITH CHECK (public.is_platform_admin(auth.uid()) OR public.has_role(auth.uid(), 'admin'));

CREATE TABLE public.map_objects (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  floor_plan_id uuid NOT NULL REFERENCES public.floor_plans(id) ON DELETE CASCADE,
  store_id uuid NOT NULL REFERENCES public.stores(id) ON DELETE CASCADE,
  zone_id uuid REFERENCES public.map_zones(id) ON DELETE SET NULL,
  object_type_id uuid NOT NULL REFERENCES public.map_object_types(id),
  name text NOT NULL,
  x numeric NOT NULL DEFAULT 0,
  y numeric NOT NULL DEFAULT 0,
  width numeric NOT NULL DEFAULT 60,
  height numeric NOT NULL DEFAULT 40,
  rotation numeric NOT NULL DEFAULT 0,
  note text,
  control_point_id uuid REFERENCES public.control_points(id) ON DELETE SET NULL,
  active boolean NOT NULL DEFAULT true,
  created_by uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.map_objects TO authenticated;
GRANT ALL ON public.map_objects TO service_role;
ALTER TABLE public.map_objects ENABLE ROW LEVEL SECURITY;
CREATE POLICY "map_objects_read" ON public.map_objects FOR SELECT TO authenticated
  USING (public.can_see_store(store_id));
CREATE POLICY "map_objects_write" ON public.map_objects FOR ALL TO authenticated
  USING (public.is_platform_admin(auth.uid()) OR public.has_role(auth.uid(), 'admin'))
  WITH CHECK (public.is_platform_admin(auth.uid()) OR public.has_role(auth.uid(), 'admin'));

CREATE INDEX idx_floor_plans_store ON public.floor_plans(store_id);
CREATE INDEX idx_map_zones_plan ON public.map_zones(floor_plan_id);
CREATE INDEX idx_map_objects_plan ON public.map_objects(floor_plan_id);
CREATE INDEX idx_map_objects_zone ON public.map_objects(zone_id);
CREATE INDEX idx_map_geometry_plan ON public.map_geometry(floor_plan_id);

CREATE TRIGGER trg_floor_plans_updated BEFORE UPDATE ON public.floor_plans
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
CREATE TRIGGER trg_map_zones_updated BEFORE UPDATE ON public.map_zones
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
CREATE TRIGGER trg_map_objects_updated BEFORE UPDATE ON public.map_objects
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
CREATE TRIGGER trg_map_object_types_updated BEFORE UPDATE ON public.map_object_types
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
CREATE TRIGGER trg_map_geometry_updated BEFORE UPDATE ON public.map_geometry
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- ============ Additiva tillägg på befintliga tabeller ============

ALTER TABLE public.checklist_template_items
  ADD COLUMN IF NOT EXISTS zone_id uuid REFERENCES public.map_zones(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS map_object_id uuid REFERENCES public.map_objects(id) ON DELETE SET NULL;

ALTER TABLE public.checklist_items
  ADD COLUMN IF NOT EXISTS zone_id uuid REFERENCES public.map_zones(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS map_object_id uuid REFERENCES public.map_objects(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_checklist_items_zone ON public.checklist_items(zone_id);
CREATE INDEX IF NOT EXISTS idx_checklist_items_object ON public.checklist_items(map_object_id);

ALTER TABLE public.entity_images
  ADD COLUMN IF NOT EXISTS image_kind text;

ALTER TABLE public.control_points
  ADD COLUMN IF NOT EXISTS map_object_id uuid REFERENCES public.map_objects(id) ON DELETE SET NULL;