-- Kontrollpunkter per standarduppgift
CREATE TABLE public.task_checkpoints (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  template_item_id UUID REFERENCES public.checklist_template_items(id) ON DELETE CASCADE,
  store_id UUID,
  label TEXT NOT NULL,
  sort_order INTEGER NOT NULL DEFAULT 0,
  required BOOLEAN NOT NULL DEFAULT true,
  active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.task_checkpoints TO authenticated;
GRANT ALL ON public.task_checkpoints TO service_role;
ALTER TABLE public.task_checkpoints ENABLE ROW LEVEL SECURITY;
CREATE POLICY "task_checkpoints_read" ON public.task_checkpoints FOR SELECT TO authenticated USING (true);
CREATE POLICY "task_checkpoints_write" ON public.task_checkpoints FOR ALL TO authenticated
  USING (public.has_role(auth.uid(), 'admin') OR public.has_role(auth.uid(), 'store_manager') OR public.is_platform_admin(auth.uid()))
  WITH CHECK (public.has_role(auth.uid(), 'admin') OR public.has_role(auth.uid(), 'store_manager') OR public.is_platform_admin(auth.uid()));

-- En rad per bock vid varje utförande (bevis)
CREATE TABLE public.task_checkpoint_results (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  checklist_item_id UUID NOT NULL REFERENCES public.checklist_items(id) ON DELETE CASCADE,
  checkpoint_id UUID REFERENCES public.task_checkpoints(id) ON DELETE SET NULL,
  label TEXT NOT NULL,
  checked BOOLEAN NOT NULL DEFAULT true,
  checked_by_staff_id UUID,
  checked_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  note TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.task_checkpoint_results TO authenticated;
GRANT ALL ON public.task_checkpoint_results TO service_role;
ALTER TABLE public.task_checkpoint_results ENABLE ROW LEVEL SECURITY;
CREATE POLICY "task_checkpoint_results_all" ON public.task_checkpoint_results FOR ALL TO authenticated USING (true) WITH CHECK (true);
CREATE UNIQUE INDEX task_checkpoint_results_unique ON public.task_checkpoint_results (checklist_item_id, checkpoint_id) WHERE checkpoint_id IS NOT NULL;

-- Tider på dagens uppgift
ALTER TABLE public.checklist_items
  ADD COLUMN IF NOT EXISTS started_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS started_by_staff_id UUID,
  ADD COLUMN IF NOT EXISTS finished_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS actual_minutes NUMERIC,
  ADD COLUMN IF NOT EXISTS active_minutes NUMERIC,
  ADD COLUMN IF NOT EXISTS paused_minutes NUMERIC,
  ADD COLUMN IF NOT EXISTS time_source TEXT,
  ADD COLUMN IF NOT EXISTS run_status TEXT NOT NULL DEFAULT 'ej_startad';

-- Pauser med orsak
CREATE TABLE public.task_pauses (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  checklist_item_id UUID NOT NULL REFERENCES public.checklist_items(id) ON DELETE CASCADE,
  reason TEXT NOT NULL,
  reason_note TEXT,
  paused_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  resumed_at TIMESTAMPTZ,
  staff_id UUID,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.task_pauses TO authenticated;
GRANT ALL ON public.task_pauses TO service_role;
ALTER TABLE public.task_pauses ENABLE ROW LEVEL SECURITY;
CREATE POLICY "task_pauses_all" ON public.task_pauses FOR ALL TO authenticated USING (true) WITH CHECK (true);

-- Standardtid i fem delar på standarduppgiften
ALTER TABLE public.checklist_template_items
  ADD COLUMN IF NOT EXISTS std_fetch_minutes NUMERIC,
  ADD COLUMN IF NOT EXISTS std_prepare_minutes NUMERIC,
  ADD COLUMN IF NOT EXISTS std_do_minutes NUMERIC,
  ADD COLUMN IF NOT EXISTS std_check_minutes NUMERIC,
  ADD COLUMN IF NOT EXISTS std_restore_minutes NUMERIC,
  ADD COLUMN IF NOT EXISTS auto_start BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS standard_id UUID,
  ADD COLUMN IF NOT EXISTS variant_of UUID,
  ADD COLUMN IF NOT EXISTS variant_note TEXT;

-- Generell resursmodell
CREATE TABLE public.resource_items (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  image TEXT,
  resource_type TEXT NOT NULL DEFAULT 'utrustning',
  category TEXT,
  unit TEXT,
  total_count NUMERIC,
  unit_value NUMERIC,
  supplier TEXT,
  supplier_article_no TEXT,
  reusable BOOLEAN NOT NULL DEFAULT true,
  active BOOLEAN NOT NULL DEFAULT true,
  note TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.resource_items TO authenticated;
GRANT ALL ON public.resource_items TO service_role;
ALTER TABLE public.resource_items ENABLE ROW LEVEL SECURITY;
CREATE POLICY "resource_items_read" ON public.resource_items FOR SELECT TO authenticated USING (true);
CREATE POLICY "resource_items_write" ON public.resource_items FOR ALL TO authenticated
  USING (public.has_role(auth.uid(), 'admin') OR public.has_role(auth.uid(), 'store_manager') OR public.is_platform_admin(auth.uid()))
  WITH CHECK (public.has_role(auth.uid(), 'admin') OR public.has_role(auth.uid(), 'store_manager') OR public.is_platform_admin(auth.uid()));

CREATE TABLE public.resource_locations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  resource_id UUID NOT NULL REFERENCES public.resource_items(id) ON DELETE CASCADE,
  store_id UUID NOT NULL,
  map_zone_id UUID REFERENCES public.map_zones(id) ON DELETE SET NULL,
  location_text TEXT,
  position_code TEXT,
  quantity NUMERIC,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (resource_id, store_id)
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.resource_locations TO authenticated;
GRANT ALL ON public.resource_locations TO service_role;
ALTER TABLE public.resource_locations ENABLE ROW LEVEL SECURITY;
CREATE POLICY "resource_locations_read" ON public.resource_locations FOR SELECT TO authenticated USING (true);
CREATE POLICY "resource_locations_write" ON public.resource_locations FOR ALL TO authenticated
  USING (public.has_role(auth.uid(), 'admin') OR public.has_role(auth.uid(), 'store_manager') OR public.is_platform_admin(auth.uid()))
  WITH CHECK (public.has_role(auth.uid(), 'admin') OR public.has_role(auth.uid(), 'store_manager') OR public.is_platform_admin(auth.uid()));

CREATE TABLE public.task_resource_requirements (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  task_template_id UUID REFERENCES public.checklist_template_items(id) ON DELETE CASCADE,
  checklist_item_id UUID REFERENCES public.checklist_items(id) ON DELETE CASCADE,
  requirement_type TEXT NOT NULL DEFAULT 'utrustning',
  requirement_name TEXT NOT NULL,
  quantity_required NUMERIC,
  required BOOLEAN NOT NULL DEFAULT true,
  usage_note TEXT,
  sort_order INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.task_resource_requirements TO authenticated;
GRANT ALL ON public.task_resource_requirements TO service_role;
ALTER TABLE public.task_resource_requirements ENABLE ROW LEVEL SECURITY;
CREATE POLICY "task_resource_requirements_read" ON public.task_resource_requirements FOR SELECT TO authenticated USING (true);
CREATE POLICY "task_resource_requirements_write" ON public.task_resource_requirements FOR ALL TO authenticated
  USING (public.has_role(auth.uid(), 'admin') OR public.has_role(auth.uid(), 'store_manager') OR public.is_platform_admin(auth.uid()))
  WITH CHECK (public.has_role(auth.uid(), 'admin') OR public.has_role(auth.uid(), 'store_manager') OR public.is_platform_admin(auth.uid()));

CREATE TABLE public.store_resource_mappings (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  requirement_id UUID NOT NULL REFERENCES public.task_resource_requirements(id) ON DELETE CASCADE,
  store_id UUID NOT NULL,
  resource_id UUID NOT NULL REFERENCES public.resource_items(id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (requirement_id, store_id)
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.store_resource_mappings TO authenticated;
GRANT ALL ON public.store_resource_mappings TO service_role;
ALTER TABLE public.store_resource_mappings ENABLE ROW LEVEL SECURITY;
CREATE POLICY "store_resource_mappings_read" ON public.store_resource_mappings FOR SELECT TO authenticated USING (true);
CREATE POLICY "store_resource_mappings_write" ON public.store_resource_mappings FOR ALL TO authenticated
  USING (public.has_role(auth.uid(), 'admin') OR public.has_role(auth.uid(), 'store_manager') OR public.is_platform_admin(auth.uid()))
  WITH CHECK (public.has_role(auth.uid(), 'admin') OR public.has_role(auth.uid(), 'store_manager') OR public.is_platform_admin(auth.uid()));

CREATE TABLE public.improvement_suggestions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  store_id UUID,
  template_item_id UUID REFERENCES public.checklist_template_items(id) ON DELETE SET NULL,
  checklist_item_id UUID REFERENCES public.checklist_items(id) ON DELETE SET NULL,
  resource_id UUID REFERENCES public.resource_items(id) ON DELETE SET NULL,
  observation TEXT NOT NULL,
  proposed_change TEXT,
  status TEXT NOT NULL DEFAULT 'forslag',
  created_by_staff_id UUID,
  decided_by_staff_id UUID,
  decided_at TIMESTAMPTZ,
  decision_note TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.improvement_suggestions TO authenticated;
GRANT ALL ON public.improvement_suggestions TO service_role;
ALTER TABLE public.improvement_suggestions ENABLE ROW LEVEL SECURITY;
CREATE POLICY "improvement_suggestions_read" ON public.improvement_suggestions FOR SELECT TO authenticated USING (true);
CREATE POLICY "improvement_suggestions_insert" ON public.improvement_suggestions FOR INSERT TO authenticated WITH CHECK (true);
CREATE POLICY "improvement_suggestions_update" ON public.improvement_suggestions FOR UPDATE TO authenticated
  USING (public.has_role(auth.uid(), 'admin') OR public.has_role(auth.uid(), 'store_manager') OR public.is_platform_admin(auth.uid()))
  WITH CHECK (public.has_role(auth.uid(), 'admin') OR public.has_role(auth.uid(), 'store_manager') OR public.is_platform_admin(auth.uid()));

CREATE TRIGGER update_resource_items_updated_at BEFORE UPDATE ON public.resource_items FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
CREATE TRIGGER update_resource_locations_updated_at BEFORE UPDATE ON public.resource_locations FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
CREATE TRIGGER update_task_resource_requirements_updated_at BEFORE UPDATE ON public.task_resource_requirements FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
CREATE TRIGGER update_store_resource_mappings_updated_at BEFORE UPDATE ON public.store_resource_mappings FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
CREATE TRIGGER update_task_checkpoints_updated_at BEFORE UPDATE ON public.task_checkpoints FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
CREATE TRIGGER update_improvement_suggestions_updated_at BEFORE UPDATE ON public.improvement_suggestions FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();