
CREATE TABLE public.map_settings (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  center_longitude numeric NOT NULL DEFAULT 15,
  center_latitude numeric NOT NULL DEFAULT 54,
  scale numeric NOT NULL DEFAULT 320,
  updated_at timestamp with time zone NOT NULL DEFAULT now()
);

ALTER TABLE public.map_settings ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Public can read map_settings" ON public.map_settings
  FOR SELECT TO public USING (true);

CREATE POLICY "Admins can manage map_settings" ON public.map_settings
  FOR ALL TO authenticated USING (has_role(auth.uid(), 'admin')) WITH CHECK (has_role(auth.uid(), 'admin'));

INSERT INTO public.map_settings (center_longitude, center_latitude, scale) VALUES (15, 54, 320);
