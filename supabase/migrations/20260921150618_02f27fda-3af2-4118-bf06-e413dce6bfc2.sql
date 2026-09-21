-- 1. Utöka entity_images
ALTER TABLE public.entity_images
  ADD COLUMN IF NOT EXISTS description text,
  ADD COLUMN IF NOT EXISTS media_kind text,
  ADD COLUMN IF NOT EXISTS status text NOT NULL DEFAULT 'unclassified',
  ADD COLUMN IF NOT EXISTS captured_at timestamptz,
  ADD COLUMN IF NOT EXISTS tags text[] NOT NULL DEFAULT '{}',
  ADD COLUMN IF NOT EXISTS uploaded_by_staff_id uuid REFERENCES public.staff(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS last_edited_by_staff_id uuid REFERENCES public.staff(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS last_edited_at timestamptz;

CREATE INDEX IF NOT EXISTS entity_images_status_idx ON public.entity_images(status);
CREATE INDEX IF NOT EXISTS entity_images_media_kind_idx ON public.entity_images(media_kind);
CREATE INDEX IF NOT EXISTS entity_images_created_at_idx ON public.entity_images(created_at DESC);

-- 2. image_links
CREATE TABLE IF NOT EXISTS public.image_links (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  media_id uuid NOT NULL REFERENCES public.entity_images(id) ON DELETE CASCADE,
  entity_type text NOT NULL,
  entity_id uuid NOT NULL,
  relation_type text NOT NULL DEFAULT 'documentation',
  created_by_staff_id uuid REFERENCES public.staff(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT image_links_unique UNIQUE (media_id, entity_type, entity_id, relation_type)
);
CREATE INDEX IF NOT EXISTS image_links_media_idx ON public.image_links(media_id);
CREATE INDEX IF NOT EXISTS image_links_entity_idx ON public.image_links(entity_type, entity_id);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.image_links TO authenticated;
GRANT ALL ON public.image_links TO service_role;
ALTER TABLE public.image_links ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Staff can read image links" ON public.image_links FOR SELECT TO authenticated USING (true);
CREATE POLICY "Staff can create image links" ON public.image_links FOR INSERT TO authenticated WITH CHECK (true);
CREATE POLICY "Staff can update image links" ON public.image_links FOR UPDATE TO authenticated USING (true) WITH CHECK (true);
CREATE POLICY "Staff can delete image links" ON public.image_links FOR DELETE TO authenticated USING (true);

CREATE TRIGGER image_links_touch BEFORE UPDATE ON public.image_links
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- 3. image_activity (append-only)
CREATE TABLE IF NOT EXISTS public.image_activity (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  media_id uuid NOT NULL REFERENCES public.entity_images(id) ON DELETE CASCADE,
  staff_id uuid REFERENCES public.staff(id) ON DELETE SET NULL,
  actor_name text,
  action_type text NOT NULL,
  change_group_id uuid,
  field_name text,
  old_value text,
  new_value text,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS image_activity_media_idx ON public.image_activity(media_id, created_at DESC);

GRANT SELECT, INSERT ON public.image_activity TO authenticated;
GRANT ALL ON public.image_activity TO service_role;
ALTER TABLE public.image_activity ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Staff can read image activity" ON public.image_activity FOR SELECT TO authenticated USING (true);
CREATE POLICY "Staff can add image activity" ON public.image_activity FOR INSERT TO authenticated WITH CHECK (true);

-- 4. image_observations
CREATE TABLE IF NOT EXISTS public.image_observations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  store_id uuid,
  zone_id uuid REFERENCES public.map_zones(id) ON DELETE SET NULL,
  resource_location_id uuid,
  observation_type text NOT NULL,
  comment text,
  created_by_staff_id uuid REFERENCES public.staff(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS image_observations_store_idx ON public.image_observations(store_id);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.image_observations TO authenticated;
GRANT ALL ON public.image_observations TO service_role;
ALTER TABLE public.image_observations ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Staff can read observations" ON public.image_observations FOR SELECT TO authenticated USING (true);
CREATE POLICY "Staff can create observations" ON public.image_observations FOR INSERT TO authenticated WITH CHECK (true);
CREATE POLICY "Staff can update observations" ON public.image_observations FOR UPDATE TO authenticated USING (true) WITH CHECK (true);
CREATE POLICY "Staff can delete observations" ON public.image_observations FOR DELETE TO authenticated USING (true);

CREATE TRIGGER image_observations_touch BEFORE UPDATE ON public.image_observations
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- 5. Backfill: hemvist -> första image_link (rör inte befintliga kolumner)
INSERT INTO public.image_links (media_id, entity_type, entity_id, relation_type)
SELECT ei.id,
       CASE ei.entity_type WHEN 'map_zone' THEN 'zone' ELSE ei.entity_type END,
       ei.entity_id,
       CASE WHEN ei.is_cover THEN 'overview' ELSE 'documentation' END
FROM public.entity_images ei
WHERE ei.entity_id IS NOT NULL
ON CONFLICT DO NOTHING;

-- 6. Härled status/media_kind för befintliga bilder utifrån faktisk hemvist
UPDATE public.entity_images ei
SET media_kind = CASE
      WHEN ei.entity_type = 'map_zone' THEN 'area'
      WHEN ei.entity_type = 'product' THEN 'product'
      WHEN ei.entity_type IN ('store','portal') THEN 'other'
      ELSE 'other'
    END,
    status = CASE
      WHEN ei.entity_id IS NULL THEN 'unclassified'
      WHEN ei.entity_type = 'map_zone' AND EXISTS (SELECT 1 FROM public.map_zones z WHERE z.id = ei.entity_id) THEN 'classified'
      WHEN ei.entity_type = 'product' AND EXISTS (SELECT 1 FROM public.products p WHERE p.id = ei.entity_id) THEN 'classified'
      WHEN ei.entity_type IN ('store','portal','shop_order_line') THEN 'classified'
      ELSE 'partial'
    END
WHERE ei.media_kind IS NULL;

-- 7. Koppla uppladdare till staff endast vid säker matchning
UPDATE public.entity_images ei
SET uploaded_by_staff_id = s.id
FROM public.staff s
WHERE ei.uploaded_by IS NOT NULL
  AND s.user_id = ei.uploaded_by
  AND ei.uploaded_by_staff_id IS NULL;