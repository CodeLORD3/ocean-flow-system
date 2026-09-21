CREATE TABLE IF NOT EXISTS public.image_views (
  id uuid primary key default gen_random_uuid(),
  media_id uuid not null references public.entity_images(id) on delete cascade,
  user_id uuid,
  viewer_name text,
  created_at timestamptz not null default now(),
  unique (media_id, user_id)
);
GRANT SELECT, INSERT ON public.image_views TO authenticated;
GRANT ALL ON public.image_views TO service_role;
ALTER TABLE public.image_views ENABLE ROW LEVEL SECURITY;
CREATE POLICY "image_views_read" ON public.image_views FOR SELECT TO authenticated USING (true);
CREATE POLICY "image_views_insert" ON public.image_views FOR INSERT TO authenticated WITH CHECK (user_id = auth.uid());
CREATE INDEX IF NOT EXISTS image_views_media_idx ON public.image_views(media_id);