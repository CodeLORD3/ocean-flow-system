CREATE POLICY "Personal ser filer viktiga papper" ON storage.objects
  FOR SELECT TO authenticated
  USING (bucket_id = 'viktiga-papper' AND public.is_staff());

CREATE POLICY "Personal laddar upp viktiga papper" ON storage.objects
  FOR INSERT TO authenticated
  WITH CHECK (bucket_id = 'viktiga-papper' AND public.is_staff());

CREATE POLICY "Personal andrar filer viktiga papper" ON storage.objects
  FOR UPDATE TO authenticated
  USING (bucket_id = 'viktiga-papper' AND public.is_staff());

CREATE POLICY "Personal tar bort filer viktiga papper" ON storage.objects
  FOR DELETE TO authenticated
  USING (bucket_id = 'viktiga-papper' AND public.is_staff());