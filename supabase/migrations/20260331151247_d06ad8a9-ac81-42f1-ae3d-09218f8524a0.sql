
DROP POLICY IF EXISTS "Admins can manage map_settings" ON public.map_settings;

CREATE POLICY "Public can manage map_settings" ON public.map_settings
  FOR ALL TO public USING (true) WITH CHECK (true);
