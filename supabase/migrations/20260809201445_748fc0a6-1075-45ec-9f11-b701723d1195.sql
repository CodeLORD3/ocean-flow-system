CREATE POLICY "lot_docs_read" ON storage.objects
  FOR SELECT TO authenticated
  USING (bucket_id = 'lot-documents' AND public.is_staff());
CREATE POLICY "lot_docs_insert" ON storage.objects
  FOR INSERT TO authenticated
  WITH CHECK (bucket_id = 'lot-documents' AND public.is_staff());
CREATE POLICY "lot_docs_update" ON storage.objects
  FOR UPDATE TO authenticated
  USING (bucket_id = 'lot-documents' AND public.is_staff())
  WITH CHECK (bucket_id = 'lot-documents' AND public.is_staff());
CREATE POLICY "lot_docs_delete" ON storage.objects
  FOR DELETE TO authenticated
  USING (bucket_id = 'lot-documents' AND public.is_staff_manager());