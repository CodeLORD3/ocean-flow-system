DO $$
DECLARE p record;
BEGIN
  FOR p IN SELECT tablename, policyname FROM pg_policies
           WHERE schemaname='public' AND tablename IN ('user_sessions','page_visits','company_documents')
  LOOP
    EXECUTE format('DROP POLICY %I ON public.%I', p.policyname, p.tablename);
  END LOOP;
END $$;

CREATE POLICY "Own or manager sessions" ON public.user_sessions
  FOR ALL TO authenticated
  USING (user_id = auth.uid() OR public.is_staff_manager())
  WITH CHECK (user_id = auth.uid() OR public.is_staff_manager());

CREATE POLICY "Own or manager page visits" ON public.page_visits
  FOR ALL TO authenticated
  USING (user_id = auth.uid() OR public.is_staff_manager())
  WITH CHECK (user_id = auth.uid() OR public.is_staff_manager());

CREATE POLICY "Staff read company documents" ON public.company_documents
  FOR SELECT TO authenticated USING (public.is_staff());
CREATE POLICY "Managers manage company documents" ON public.company_documents
  FOR ALL TO authenticated USING (public.is_staff_manager()) WITH CHECK (public.is_staff_manager());

DO $$
DECLARE p record;
BEGIN
  FOR p IN SELECT policyname FROM pg_policies
           WHERE schemaname='storage' AND tablename='objects'
             AND roles::text[] && ARRAY['public','anon']
             AND (qual ILIKE '%trade-offers%' OR with_check ILIKE '%trade-offers%')
  LOOP
    EXECUTE format('ALTER POLICY %I ON storage.objects TO authenticated', p.policyname);
  END LOOP;
END $$;