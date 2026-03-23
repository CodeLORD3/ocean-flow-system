DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_policies
    WHERE schemaname = 'storage'
      AND tablename = 'objects'
      AND policyname = 'Public upload trade-offers'
  ) THEN
    CREATE POLICY "Public upload trade-offers"
    ON storage.objects
    FOR INSERT
    TO public
    WITH CHECK (bucket_id = 'trade-offers');
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM pg_policies
    WHERE schemaname = 'storage'
      AND tablename = 'objects'
      AND policyname = 'Public update trade-offers'
  ) THEN
    CREATE POLICY "Public update trade-offers"
    ON storage.objects
    FOR UPDATE
    TO public
    USING (bucket_id = 'trade-offers')
    WITH CHECK (bucket_id = 'trade-offers');
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM pg_policies
    WHERE schemaname = 'storage'
      AND tablename = 'objects'
      AND policyname = 'Public delete trade-offers'
  ) THEN
    CREATE POLICY "Public delete trade-offers"
    ON storage.objects
    FOR DELETE
    TO public
    USING (bucket_id = 'trade-offers');
  END IF;
END
$$;