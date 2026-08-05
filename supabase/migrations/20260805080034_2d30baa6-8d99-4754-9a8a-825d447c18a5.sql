ALTER TABLE public.checklist_days
  ADD COLUMN IF NOT EXISTS page_comments jsonb NOT NULL DEFAULT '{}'::jsonb;