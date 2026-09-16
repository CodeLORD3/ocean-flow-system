ALTER TABLE public.entity_images
  ADD COLUMN IF NOT EXISTS norm_x numeric,
  ADD COLUMN IF NOT EXISTS norm_y numeric,
  ADD COLUMN IF NOT EXISTS floor_plan_id uuid REFERENCES public.floor_plans(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS entity_images_floor_plan_idx ON public.entity_images(floor_plan_id);

ALTER TABLE public.floor_plans
  ADD COLUMN IF NOT EXISTS calibration jsonb;