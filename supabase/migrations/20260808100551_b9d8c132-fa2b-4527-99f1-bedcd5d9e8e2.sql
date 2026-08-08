DO $$
DECLARE
  t text;
  p record;
BEGIN
  FOREACH t IN ARRAY ARRAY['landing_settings','about_us_settings','contact_settings',
                           'currency_settings','portal_settings','map_settings','legal_entities'] LOOP
    FOR p IN SELECT policyname FROM pg_policies WHERE schemaname='public' AND tablename=t LOOP
      EXECUTE format('DROP POLICY %I ON public.%I', p.policyname, t);
    END LOOP;
    EXECUTE format('GRANT SELECT ON public.%I TO anon', t);
    EXECUTE format('CREATE POLICY "Public read %1$s" ON public.%1$I FOR SELECT USING (true)', t);
    EXECUTE format('CREATE POLICY "Managers manage %1$s" ON public.%1$I FOR ALL TO authenticated USING (public.is_staff_manager()) WITH CHECK (public.is_staff_manager())', t);
  END LOOP;
END $$;