DROP POLICY IF EXISTS "tg settings read" ON public.telegram_settings;
CREATE POLICY "tg settings read" ON public.telegram_settings
  FOR SELECT TO authenticated
  USING (public.is_telegram_admin());