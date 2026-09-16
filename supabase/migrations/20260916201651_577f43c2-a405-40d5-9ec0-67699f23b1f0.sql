ALTER TABLE public.checklist_items
  ADD COLUMN IF NOT EXISTS link_url text,
  ADD COLUMN IF NOT EXISTS recipe_id uuid REFERENCES public.production_recipes(id) ON DELETE SET NULL;

ALTER TABLE public.checklist_template_items
  ADD COLUMN IF NOT EXISTS link_url text,
  ADD COLUMN IF NOT EXISTS recipe_id uuid REFERENCES public.production_recipes(id) ON DELETE SET NULL;