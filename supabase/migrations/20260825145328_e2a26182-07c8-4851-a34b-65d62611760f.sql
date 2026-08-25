CREATE POLICY "Staff read personaldokument" ON storage.objects
  FOR SELECT TO authenticated
  USING (bucket_id = 'personaldokument' AND public.is_staff());

CREATE POLICY "Managers write personaldokument" ON storage.objects
  FOR INSERT TO authenticated
  WITH CHECK (bucket_id = 'personaldokument' AND public.is_staff_manager());

CREATE POLICY "Managers update personaldokument" ON storage.objects
  FOR UPDATE TO authenticated
  USING (bucket_id = 'personaldokument' AND public.is_staff_manager())
  WITH CHECK (bucket_id = 'personaldokument' AND public.is_staff_manager());

CREATE POLICY "Managers delete personaldokument" ON storage.objects
  FOR DELETE TO authenticated
  USING (bucket_id = 'personaldokument' AND public.is_staff_manager());