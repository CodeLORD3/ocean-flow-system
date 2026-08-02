CREATE TABLE public.store_sidebar_prefs (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  store_id UUID NOT NULL REFERENCES public.stores(id) ON DELETE CASCADE,
  nav_url TEXT NOT NULL,
  hidden BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  UNIQUE (store_id, nav_url)
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.store_sidebar_prefs TO authenticated;
GRANT SELECT ON public.store_sidebar_prefs TO anon;
GRANT ALL ON public.store_sidebar_prefs TO service_role;

ALTER TABLE public.store_sidebar_prefs ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Anyone can read sidebar prefs"
  ON public.store_sidebar_prefs FOR SELECT
  USING (true);

CREATE POLICY "Authenticated can manage sidebar prefs"
  ON public.store_sidebar_prefs FOR ALL
  TO authenticated
  USING (true) WITH CHECK (true);

CREATE TRIGGER store_sidebar_prefs_set_updated_at
  BEFORE UPDATE ON public.store_sidebar_prefs
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();