ALTER TABLE public.entity_image_comments
  ADD COLUMN IF NOT EXISTS region_x numeric,
  ADD COLUMN IF NOT EXISTS region_y numeric,
  ADD COLUMN IF NOT EXISTS region_w numeric,
  ADD COLUMN IF NOT EXISTS region_h numeric;