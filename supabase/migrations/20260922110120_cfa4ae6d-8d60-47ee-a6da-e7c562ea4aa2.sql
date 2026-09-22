ALTER TABLE public.task_prep_checks ADD COLUMN IF NOT EXISTS step_no integer;
CREATE UNIQUE INDEX IF NOT EXISTS task_prep_checks_step_unique
  ON public.task_prep_checks (checklist_item_id, step_no) WHERE step_no IS NOT NULL;