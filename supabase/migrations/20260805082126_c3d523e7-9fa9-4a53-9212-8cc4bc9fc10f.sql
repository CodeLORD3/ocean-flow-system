ALTER TABLE public.entity_images
  ADD COLUMN IF NOT EXISTS caption_edited_by uuid,
  ADD COLUMN IF NOT EXISTS caption_edited_by_name text,
  ADD COLUMN IF NOT EXISTS caption_edited_at timestamptz;

ALTER TABLE public.entity_image_comments
  ADD COLUMN IF NOT EXISTS edited_by uuid,
  ADD COLUMN IF NOT EXISTS edited_by_name text,
  ADD COLUMN IF NOT EXISTS edited_at timestamptz;