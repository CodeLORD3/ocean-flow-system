ALTER TABLE public.store_sidebar_prefs ADD COLUMN IF NOT EXISTS sort_order INTEGER;

CREATE TABLE IF NOT EXISTS public.store_sidebar_sections (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  store_id UUID NOT NULL REFERENCES public.stores(id) ON DELETE CASCADE,
  section_key TEXT NOT NULL,
  label TEXT,
  sort_order INTEGER,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  UNIQUE (store_id, section_key)
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.store_sidebar_sections TO authenticated;
GRANT ALL ON public.store_sidebar_sections TO service_role;

ALTER TABLE public.store_sidebar_sections ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Staff can read sidebar sections" ON public.store_sidebar_sections FOR SELECT TO authenticated USING (is_staff());
CREATE POLICY "Staff can manage sidebar sections" ON public.store_sidebar_sections FOR ALL TO authenticated USING (is_staff()) WITH CHECK (is_staff());

CREATE TRIGGER update_store_sidebar_sections_updated_at BEFORE UPDATE ON public.store_sidebar_sections FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();