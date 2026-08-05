ALTER TABLE public.entity_images
  ADD COLUMN IF NOT EXISTS uploaded_by uuid,
  ADD COLUMN IF NOT EXISTS uploaded_by_name text;

CREATE TABLE IF NOT EXISTS public.entity_image_favorites (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  image_id uuid NOT NULL REFERENCES public.entity_images(id) ON DELETE CASCADE,
  user_id uuid NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (image_id, user_id)
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.entity_image_favorites TO authenticated;
GRANT SELECT ON public.entity_image_favorites TO anon;
GRANT ALL ON public.entity_image_favorites TO service_role;
ALTER TABLE public.entity_image_favorites ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Anyone can view image favorites" ON public.entity_image_favorites FOR SELECT USING (true);
CREATE POLICY "Users manage own image favorites" ON public.entity_image_favorites FOR ALL TO authenticated
  USING (user_id = auth.uid()) WITH CHECK (user_id = auth.uid());

CREATE TABLE IF NOT EXISTS public.entity_image_comments (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  image_id uuid NOT NULL REFERENCES public.entity_images(id) ON DELETE CASCADE,
  user_id uuid,
  author_name text NOT NULL DEFAULT 'Okänd',
  body text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS entity_image_comments_image_idx ON public.entity_image_comments(image_id, created_at);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.entity_image_comments TO authenticated;
GRANT SELECT ON public.entity_image_comments TO anon;
GRANT ALL ON public.entity_image_comments TO service_role;
ALTER TABLE public.entity_image_comments ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Anyone can view image comments" ON public.entity_image_comments FOR SELECT USING (true);
CREATE POLICY "Staff can write image comments" ON public.entity_image_comments FOR INSERT TO authenticated WITH CHECK (true);
CREATE POLICY "Users manage own image comments" ON public.entity_image_comments FOR UPDATE TO authenticated
  USING (user_id = auth.uid()) WITH CHECK (user_id = auth.uid());
CREATE POLICY "Users delete own image comments" ON public.entity_image_comments FOR DELETE TO authenticated
  USING (user_id = auth.uid());