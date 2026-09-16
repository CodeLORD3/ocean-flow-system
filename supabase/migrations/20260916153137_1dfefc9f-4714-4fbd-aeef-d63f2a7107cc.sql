CREATE TABLE IF NOT EXISTS public.task_categories (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  store_id uuid REFERENCES public.stores(id) ON DELETE CASCADE,
  name text NOT NULL,
  color text NOT NULL DEFAULT '#1f4d6b',
  icon text,
  sort_order integer NOT NULL DEFAULT 100,
  active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.task_categories TO authenticated;
GRANT ALL ON public.task_categories TO service_role;
ALTER TABLE public.task_categories ENABLE ROW LEVEL SECURITY;

CREATE POLICY "task_categories_read" ON public.task_categories
  FOR SELECT TO authenticated USING (true);
CREATE POLICY "task_categories_admin" ON public.task_categories
  FOR ALL TO authenticated
  USING (public.has_role(auth.uid(), 'admin'))
  WITH CHECK (public.has_role(auth.uid(), 'admin'));

CREATE UNIQUE INDEX IF NOT EXISTS task_categories_name_scope_idx
  ON public.task_categories (coalesce(store_id, '00000000-0000-0000-0000-000000000000'::uuid), lower(name));

CREATE TRIGGER task_categories_touch BEFORE UPDATE ON public.task_categories
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

ALTER TABLE public.checklist_items
  ADD COLUMN IF NOT EXISTS assigned_staff_id uuid REFERENCES public.staff(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS completed_by_staff_id uuid REFERENCES public.staff(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS specific_time time,
  ADD COLUMN IF NOT EXISTS time_from time,
  ADD COLUMN IF NOT EXISTS time_to time,
  ADD COLUMN IF NOT EXISTS daypart text,
  ADD COLUMN IF NOT EXISTS estimated_minutes integer,
  ADD COLUMN IF NOT EXISTS instructions jsonb,
  ADD COLUMN IF NOT EXISTS important_note text,
  ADD COLUMN IF NOT EXISTS requires_photo boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS category_id uuid REFERENCES public.task_categories(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS template_item_id uuid REFERENCES public.checklist_template_items(id) ON DELETE SET NULL;

ALTER TABLE public.checklist_template_items
  ADD COLUMN IF NOT EXISTS assigned_staff_id uuid REFERENCES public.staff(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS specific_time time,
  ADD COLUMN IF NOT EXISTS time_from time,
  ADD COLUMN IF NOT EXISTS time_to time,
  ADD COLUMN IF NOT EXISTS daypart text,
  ADD COLUMN IF NOT EXISTS estimated_minutes integer,
  ADD COLUMN IF NOT EXISTS instructions jsonb,
  ADD COLUMN IF NOT EXISTS important_note text,
  ADD COLUMN IF NOT EXISTS requires_photo boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS category_id uuid REFERENCES public.task_categories(id) ON DELETE SET NULL;

-- Flytta befintliga fritextkategorier till listan (gemensamma, ej butiksegna)
INSERT INTO public.task_categories (name, color, sort_order)
SELECT DISTINCT btrim(category), '#1f4d6b', 100
FROM (
  SELECT category FROM public.checklist_items WHERE category IS NOT NULL AND btrim(category) <> ''
  UNION
  SELECT category FROM public.checklist_template_items WHERE category IS NOT NULL AND btrim(category) <> ''
) s
ON CONFLICT DO NOTHING;

UPDATE public.checklist_items ci
SET category_id = tc.id
FROM public.task_categories tc
WHERE tc.store_id IS NULL
  AND ci.category_id IS NULL
  AND lower(btrim(ci.category)) = lower(tc.name);

UPDATE public.checklist_template_items ti
SET category_id = tc.id
FROM public.task_categories tc
WHERE tc.store_id IS NULL
  AND ti.category_id IS NULL
  AND lower(btrim(ti.category)) = lower(tc.name);

CREATE INDEX IF NOT EXISTS checklist_items_template_item_idx ON public.checklist_items (template_item_id);
CREATE INDEX IF NOT EXISTS checklist_items_assigned_idx ON public.checklist_items (assigned_staff_id);