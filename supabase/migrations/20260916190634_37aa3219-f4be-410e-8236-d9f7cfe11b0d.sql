ALTER TABLE public.checklist_items ADD COLUMN IF NOT EXISTS guide jsonb;
ALTER TABLE public.checklist_template_items ADD COLUMN IF NOT EXISTS guide jsonb;