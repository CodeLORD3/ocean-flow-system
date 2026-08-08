DO $$
DECLARE p record;
BEGIN
  FOR p IN SELECT policyname FROM pg_policies
           WHERE schemaname='storage' AND tablename='objects'
             AND (COALESCE(qual,'') ILIKE '%trade-offers%' OR COALESCE(with_check,'') ILIKE '%trade-offers%'
               OR COALESCE(qual,'') ILIKE '%purchase-documents%' OR COALESCE(with_check,'') ILIKE '%purchase-documents%')
  LOOP
    EXECUTE format('DROP POLICY %I ON storage.objects', p.policyname);
  END LOOP;
END $$;

CREATE POLICY "Authenticated read trade-offers files" ON storage.objects
  FOR SELECT TO authenticated USING (bucket_id = 'trade-offers');
CREATE POLICY "Staff manage trade-offers files" ON storage.objects
  FOR ALL TO authenticated
  USING (bucket_id = 'trade-offers' AND public.is_staff())
  WITH CHECK (bucket_id = 'trade-offers' AND public.is_staff());

CREATE POLICY "Staff manage purchase documents" ON storage.objects
  FOR ALL TO authenticated
  USING (bucket_id = 'purchase-documents' AND public.is_staff())
  WITH CHECK (bucket_id = 'purchase-documents' AND public.is_staff());