
CREATE TABLE public.about_us_settings (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  hero_title text DEFAULT 'About Ocean Trade',
  hero_subtitle text DEFAULT 'Who we are and what drives us',
  hero_description text DEFAULT '',
  mission_text text DEFAULT '',
  values_json jsonb DEFAULT '[]'::jsonb,
  team_json jsonb DEFAULT '[]'::jsonb,
  updated_at timestamp with time zone NOT NULL DEFAULT now()
);

ALTER TABLE public.about_us_settings ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Public read about_us_settings" ON public.about_us_settings FOR SELECT TO public USING (true);
CREATE POLICY "Public write about_us_settings" ON public.about_us_settings FOR ALL TO public USING (true) WITH CHECK (true);
