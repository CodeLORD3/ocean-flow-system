CREATE TABLE public.image_groups (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  entity_type text NOT NULL,
  entity_id uuid NOT NULL,
  name text NOT NULL DEFAULT '',
  description text,
  kind text NOT NULL DEFAULT 'manual',
  day_key text,
  created_by uuid,
  created_by_name text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX image_groups_day_unique ON public.image_groups (entity_type, entity_id, day_key) WHERE kind = 'day';
CREATE INDEX image_groups_entity_idx ON public.image_groups (entity_type, entity_id, created_at DESC);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.image_groups TO authenticated;
GRANT ALL ON public.image_groups TO service_role;
ALTER TABLE public.image_groups ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Staff can view image groups" ON public.image_groups FOR SELECT TO authenticated USING (is_staff());
CREATE POLICY "Staff can manage image groups" ON public.image_groups FOR ALL TO authenticated USING (is_staff()) WITH CHECK (is_staff());

CREATE TABLE public.image_group_items (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  group_id uuid NOT NULL REFERENCES public.image_groups(id) ON DELETE CASCADE,
  image_id uuid NOT NULL REFERENCES public.entity_images(id) ON DELETE CASCADE,
  sort_order integer NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (group_id, image_id)
);
CREATE INDEX image_group_items_image_idx ON public.image_group_items (image_id);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.image_group_items TO authenticated;
GRANT ALL ON public.image_group_items TO service_role;
ALTER TABLE public.image_group_items ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Staff can view image group items" ON public.image_group_items FOR SELECT TO authenticated USING (is_staff());
CREATE POLICY "Staff can manage image group items" ON public.image_group_items FOR ALL TO authenticated USING (is_staff()) WITH CHECK (is_staff());