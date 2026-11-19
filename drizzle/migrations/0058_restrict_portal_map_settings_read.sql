DROP POLICY IF EXISTS "Public read portal_settings" ON public.portal_settings;
CREATE POLICY "Signed-in read portal_settings" ON public.portal_settings
  FOR SELECT TO authenticated
  USING (auth.uid() IS NOT NULL);
REVOKE SELECT ON public.portal_settings FROM anon;

DROP POLICY IF EXISTS "Public read map_settings" ON public.map_settings;
CREATE POLICY "Signed-in read map_settings" ON public.map_settings
  FOR SELECT TO authenticated
  USING (auth.uid() IS NOT NULL);
REVOKE SELECT ON public.map_settings FROM anon;