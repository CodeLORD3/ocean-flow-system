ALTER TABLE public.checklist_items
  ADD COLUMN IF NOT EXISTS requires_note boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS requires_value boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS value_label text,
  ADD COLUMN IF NOT EXISTS completion_note text,
  ADD COLUMN IF NOT EXISTS completion_value numeric;

ALTER TABLE public.checklist_template_items
  ADD COLUMN IF NOT EXISTS requires_note boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS requires_value boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS value_label text;