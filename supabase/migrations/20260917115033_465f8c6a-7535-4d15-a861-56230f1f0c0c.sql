ALTER TABLE public.map_zones
  ADD COLUMN IF NOT EXISTS description text,
  ADD COLUMN IF NOT EXISTS zone_kind text;