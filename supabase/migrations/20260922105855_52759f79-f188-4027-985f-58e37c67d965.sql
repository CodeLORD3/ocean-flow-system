ALTER TABLE public.resource_items ADD COLUMN IF NOT EXISTS brand text;

CREATE TABLE IF NOT EXISTS public.task_prep_checks (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  checklist_item_id uuid NOT NULL REFERENCES public.checklist_items(id) ON DELETE CASCADE,
  requirement_id uuid REFERENCES public.task_resource_requirements(id) ON DELETE CASCADE,
  resource_id uuid REFERENCES public.resource_items(id) ON DELETE SET NULL,
  item_name text NOT NULL,
  status text NOT NULL DEFAULT 'finns',
  note text,
  checked_by_staff_id uuid REFERENCES public.staff(id) ON DELETE SET NULL,
  checked_at timestamptz NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS task_prep_checks_unique
  ON public.task_prep_checks (checklist_item_id, requirement_id);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.task_prep_checks TO authenticated;
GRANT ALL ON public.task_prep_checks TO service_role;
ALTER TABLE public.task_prep_checks ENABLE ROW LEVEL SECURITY;
CREATE POLICY task_prep_checks_read ON public.task_prep_checks FOR SELECT TO authenticated USING (true);
CREATE POLICY task_prep_checks_write ON public.task_prep_checks FOR ALL TO authenticated USING (true) WITH CHECK (true);

CREATE TABLE IF NOT EXISTS public.resource_shortage_reports (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  store_id uuid REFERENCES public.stores(id) ON DELETE SET NULL,
  resource_id uuid REFERENCES public.resource_items(id) ON DELETE SET NULL,
  requirement_id uuid REFERENCES public.task_resource_requirements(id) ON DELETE SET NULL,
  checklist_item_id uuid REFERENCES public.checklist_items(id) ON DELETE SET NULL,
  item_name text NOT NULL,
  level text NOT NULL DEFAULT 'tar_slut',
  note text,
  status text NOT NULL DEFAULT 'oppen',
  reported_by_staff_id uuid REFERENCES public.staff(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  resolved_at timestamptz,
  resolved_by_staff_id uuid REFERENCES public.staff(id) ON DELETE SET NULL
);

GRANT SELECT, INSERT, UPDATE ON public.resource_shortage_reports TO authenticated;
GRANT ALL ON public.resource_shortage_reports TO service_role;
ALTER TABLE public.resource_shortage_reports ENABLE ROW LEVEL SECURITY;
CREATE POLICY resource_shortage_reports_read ON public.resource_shortage_reports FOR SELECT TO authenticated USING (true);
CREATE POLICY resource_shortage_reports_insert ON public.resource_shortage_reports FOR INSERT TO authenticated WITH CHECK (true);
CREATE POLICY resource_shortage_reports_update ON public.resource_shortage_reports FOR UPDATE TO authenticated USING (true) WITH CHECK (true);