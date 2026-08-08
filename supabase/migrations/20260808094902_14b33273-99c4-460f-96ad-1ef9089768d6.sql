DO $$
DECLARE
  anon_read_ok text[] := ARRAY[
    'landing_settings','currency_settings','contact_settings','about_us_settings',
    'map_settings','portal_settings','trade_offers','offer_documents'
  ];
  p record;
BEGIN
  FOR p IN
    SELECT schemaname, tablename, policyname, cmd, roles
    FROM pg_policies
    WHERE schemaname = 'public'
      AND (roles::text[] && ARRAY['public','anon'])
  LOOP
    EXECUTE format('ALTER POLICY %I ON %I.%I TO authenticated',
                   p.policyname, p.schemaname, p.tablename);

    IF p.tablename = ANY(anon_read_ok) AND p.cmd IN ('SELECT','ALL') THEN
      IF NOT EXISTS (
        SELECT 1 FROM pg_policies
        WHERE schemaname = 'public' AND tablename = p.tablename
          AND policyname = 'anon_read_' || p.tablename
      ) THEN
        EXECUTE format(
          'CREATE POLICY %I ON public.%I FOR SELECT TO anon USING (true)',
          'anon_read_' || p.tablename, p.tablename);
      END IF;
    END IF;
  END LOOP;

  -- Storage: ta bort anonym skriv/läs-åtkomst till känsliga buckets.
  FOR p IN
    SELECT policyname, cmd
    FROM pg_policies
    WHERE schemaname = 'storage' AND tablename = 'objects'
      AND (roles::text[] && ARRAY['public','anon'])
      AND (qual ILIKE '%purchase-documents%' OR with_check ILIKE '%purchase-documents%'
        OR qual ILIKE '%staff-photos%'       OR with_check ILIKE '%staff-photos%'
        OR qual ILIKE '%logos%'              OR with_check ILIKE '%logos%'
        OR qual ILIKE '%trade-offers%'       OR with_check ILIKE '%trade-offers%')
  LOOP
    IF p.cmd = 'SELECT' THEN
      CONTINUE; -- publika bilder/logotyper ska fortsatt kunna visas
    END IF;
    EXECUTE format('ALTER POLICY %I ON storage.objects TO authenticated', p.policyname);
  END LOOP;
END $$;

-- Läsning av inköpsdokument kräver inloggning (bucketen är inte publik).
DO $$
DECLARE p record;
BEGIN
  FOR p IN
    SELECT policyname FROM pg_policies
    WHERE schemaname='storage' AND tablename='objects'
      AND (roles::text[] && ARRAY['public','anon'])
      AND cmd='SELECT'
      AND (qual ILIKE '%purchase-documents%' OR with_check ILIKE '%purchase-documents%')
  LOOP
    EXECUTE format('ALTER POLICY %I ON storage.objects TO authenticated', p.policyname);
  END LOOP;
END $$;

REVOKE ALL ON ALL TABLES IN SCHEMA public FROM anon;
GRANT SELECT ON public.landing_settings, public.currency_settings, public.contact_settings,
  public.about_us_settings, public.map_settings, public.portal_settings,
  public.trade_offers, public.offer_documents TO anon;