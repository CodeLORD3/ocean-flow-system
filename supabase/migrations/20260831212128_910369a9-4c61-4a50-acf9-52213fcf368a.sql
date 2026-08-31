ALTER TABLE public.legal_entities
  DROP COLUMN IF EXISTS fortnox_access_token,
  DROP COLUMN IF EXISTS fortnox_refresh_token;

DROP POLICY IF EXISTS "Authenticated read trade-offers files" ON storage.objects;
CREATE POLICY "Authenticated read trade-offers files"
  ON storage.objects
  FOR SELECT
  TO authenticated
  USING (
    bucket_id = 'trade-offers'
    AND (
      public.is_staff()
      OR public.has_role(auth.uid(), 'admin'::public.app_role)
      OR (
        public.is_investor()
        AND EXISTS (
          SELECT 1
          FROM public.trade_offers AS offer
          WHERE COALESCE(offer.visibility, 'all') = 'all'
            AND (
              COALESCE(offer.product_image_url, '') LIKE '%' || storage.objects.name
              OR COALESCE(offer.document_url, '') LIKE '%' || storage.objects.name
            )
        )
      )
    )
  );