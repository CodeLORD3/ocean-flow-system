DROP POLICY IF EXISTS "Public read contact_settings" ON public.contact_settings;
CREATE POLICY "Signed-in read contact_settings" ON public.contact_settings FOR SELECT TO authenticated USING (auth.uid() IS NOT NULL);
DROP POLICY IF EXISTS "Public read currency_settings" ON public.currency_settings;
CREATE POLICY "Signed-in read currency_settings" ON public.currency_settings FOR SELECT TO authenticated USING (auth.uid() IS NOT NULL);
REVOKE SELECT ON public.contact_settings FROM anon;
REVOKE SELECT ON public.currency_settings FROM anon;