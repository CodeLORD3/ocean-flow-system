DROP POLICY IF EXISTS "Public read legal_entities" ON public.legal_entities;
REVOKE ALL ON public.legal_entities FROM anon;
CREATE POLICY "Staff read legal_entities" ON public.legal_entities
  FOR SELECT TO authenticated USING (public.is_staff());

DO $$
DECLARE p record;
BEGIN
  FOR p IN SELECT policyname, cmd FROM pg_policies
           WHERE schemaname='storage' AND tablename='objects'
             AND cmd <> 'SELECT'
             AND (COALESCE(qual,'') ~ '(staff-photos|produktbilder|logos)'
               OR COALESCE(with_check,'') ~ '(staff-photos|produktbilder|logos)')
  LOOP
    EXECUTE format('DROP POLICY %I ON storage.objects', p.policyname);
  END LOOP;
END $$;

CREATE POLICY "Staff manage staff photos" ON storage.objects
  FOR ALL TO authenticated
  USING (bucket_id = 'staff-photos' AND public.is_staff())
  WITH CHECK (bucket_id = 'staff-photos' AND public.is_staff());

CREATE POLICY "Staff manage product images" ON storage.objects
  FOR ALL TO authenticated
  USING (bucket_id = 'produktbilder' AND public.is_staff())
  WITH CHECK (bucket_id = 'produktbilder' AND public.is_staff());

CREATE POLICY "Managers manage logos" ON storage.objects
  FOR ALL TO authenticated
  USING (bucket_id = 'logos' AND public.is_staff_manager())
  WITH CHECK (bucket_id = 'logos' AND public.is_staff_manager());