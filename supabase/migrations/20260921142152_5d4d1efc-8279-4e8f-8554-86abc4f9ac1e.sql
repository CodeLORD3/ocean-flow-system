ALTER TABLE public.map_pins
  ADD COLUMN IF NOT EXISTS area_x numeric,
  ADD COLUMN IF NOT EXISTS area_y numeric,
  ADD COLUMN IF NOT EXISTS area_width numeric,
  ADD COLUMN IF NOT EXISTS area_height numeric;