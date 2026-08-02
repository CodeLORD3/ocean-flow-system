CREATE POLICY "Authenticated can read produktbilder"
ON storage.objects FOR SELECT TO authenticated
USING (bucket_id = 'produktbilder');

CREATE POLICY "Authenticated can upload produktbilder"
ON storage.objects FOR INSERT TO authenticated
WITH CHECK (bucket_id = 'produktbilder');

CREATE POLICY "Authenticated can update produktbilder"
ON storage.objects FOR UPDATE TO authenticated
USING (bucket_id = 'produktbilder');

CREATE POLICY "Authenticated can delete produktbilder"
ON storage.objects FOR DELETE TO authenticated
USING (bucket_id = 'produktbilder');