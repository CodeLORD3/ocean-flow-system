ALTER TABLE public.map_zones
  ADD COLUMN IF NOT EXISTS parent_zone_id uuid REFERENCES public.map_zones(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS tags text[] NOT NULL DEFAULT '{}';

CREATE INDEX IF NOT EXISTS map_zones_parent_zone_id_idx ON public.map_zones(parent_zone_id);
CREATE INDEX IF NOT EXISTS map_zones_tags_idx ON public.map_zones USING gin(tags);