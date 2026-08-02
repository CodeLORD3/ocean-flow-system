ALTER TABLE public.entity_images ADD COLUMN IF NOT EXISTS is_cover boolean NOT NULL DEFAULT false;

CREATE UNIQUE INDEX IF NOT EXISTS entity_images_one_cover_per_entity
  ON public.entity_images (entity_type, entity_id)
  WHERE is_cover;