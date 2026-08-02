CREATE TABLE public.entity_images (
  id uuid primary key default gen_random_uuid(),
  entity_type text not null,
  entity_id uuid not null,
  url text not null,
  caption text,
  sort_order integer not null default 0,
  created_at timestamptz not null default now()
);
CREATE INDEX idx_entity_images_lookup ON public.entity_images(entity_type, entity_id, sort_order);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.entity_images TO authenticated;
GRANT SELECT ON public.entity_images TO anon;
GRANT ALL ON public.entity_images TO service_role;
ALTER TABLE public.entity_images ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Anyone can view entity images" ON public.entity_images FOR SELECT USING (true);
CREATE POLICY "Staff can manage entity images" ON public.entity_images FOR ALL TO authenticated USING (true) WITH CHECK (true);