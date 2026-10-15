ALTER TABLE public.employments ADD COLUMN IF NOT EXISTS overtime_as_comp boolean NOT NULL DEFAULT false;
COMMENT ON COLUMN public.employments.overtime_as_comp IS 'Övertid tjänas in som komp i stället för att betalas ut';
UPDATE public.employments SET overtime_as_comp = true WHERE employee_id='6abd5230-fb90-44ad-ab80-e749203554e6' AND legal_entity_id='fsab-se';