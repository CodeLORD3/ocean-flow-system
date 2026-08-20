-- 1. Views: enforce the querying user's own RLS instead of the creator's
ALTER VIEW public.staff_access SET (security_invoker = on);
ALTER VIEW public.pos_price_overview SET (security_invoker = on);
ALTER VIEW public.v_pk_clocked_in_now SET (security_invoker = on);
ALTER VIEW public.actor_names SET (security_invoker = on);
ALTER VIEW public.retail_customer_duplicates SET (security_invoker = on);

-- 2. Pin search_path on the remaining functions
ALTER FUNCTION public.generate_payment_reference() SET search_path = public;
ALTER FUNCTION public.last_name_key(text) SET search_path = public;
ALTER FUNCTION public.notify_change_request() SET search_path = public;
ALTER FUNCTION public.notify_new_delivery_note() SET search_path = public;
ALTER FUNCTION public.notify_new_order_lines() SET search_path = public;
ALTER FUNCTION public.notify_new_production_report() SET search_path = public;
ALTER FUNCTION public.notify_new_purchase_report() SET search_path = public;
ALTER FUNCTION public.notify_new_shop_order() SET search_path = public;
ALTER FUNCTION public.notify_order_shipped() SET search_path = public;
ALTER FUNCTION public.pos_set_updated_at() SET search_path = public;
ALTER FUNCTION public.prevent_legal_entity_change() SET search_path = public;
ALTER FUNCTION public.set_updated_at() SET search_path = public;

-- 3. SECURITY DEFINER functions: no anonymous execution at all,
--    and no signed-in execution of trigger/maintenance-only functions.
DO $$
DECLARE
  f record;
  maintenance text[] := ARRAY[
    'autofeature_daily_images','ledger_zero_empty_costs','preview_stock_zeroing',
    'purge_booking_otp','purge_sms_log_phones','zero_stale_day_prices',
    'zero_stale_day_prices_midnight','zero_stock_balances','set_user_scopes',
    'notify_event','next_series_number','recalc_product_day_price',
    'nimpos_health','pos_fefo_lots'
  ];
BEGIN
  FOR f IN
    SELECT p.oid,
           p.proname,
           p.prorettype::regtype::text AS rettype,
           format('public.%I(%s)', p.proname, pg_get_function_identity_arguments(p.oid)) AS sig
    FROM pg_proc p
    JOIN pg_namespace n ON n.oid = p.pronamespace
    WHERE n.nspname = 'public' AND p.prosecdef
  LOOP
    EXECUTE format('REVOKE ALL ON FUNCTION %s FROM PUBLIC, anon', f.sig);
    EXECUTE format('GRANT EXECUTE ON FUNCTION %s TO service_role', f.sig);
    IF f.rettype = 'trigger' OR f.proname = ANY(maintenance) THEN
      EXECUTE format('REVOKE ALL ON FUNCTION %s FROM authenticated', f.sig);
    ELSE
      EXECUTE format('GRANT EXECUTE ON FUNCTION %s TO authenticated', f.sig);
    END IF;
  END LOOP;
END $$;

-- 4. Intercompany invoices: company-scoped reads only
DROP POLICY IF EXISTS "ici_read" ON public.intercompany_invoices;
CREATE POLICY "ici_read" ON public.intercompany_invoices
FOR SELECT TO authenticated
USING (
  public.is_staff()
  AND (
    public.can_see_company(seller_legal_entity_id)
    OR public.can_see_company(buyer_legal_entity_id)
  )
);

-- 5. Offer documents: follow the parent offer's visibility
DROP POLICY IF EXISTS "Authenticated can read offer_documents" ON public.offer_documents;
CREATE POLICY "Offer documents follow offer visibility" ON public.offer_documents
FOR SELECT TO authenticated
USING (
  public.is_staff()
  OR public.has_role(auth.uid(), 'admin'::app_role)
  OR (
    public.is_investor()
    AND EXISTS (
      SELECT 1 FROM public.trade_offers o
      WHERE o.id = offer_documents.offer_id
        AND COALESCE(o.visibility, 'all') = 'all'
    )
  )
);

-- 6. Size grade register: staff only
DROP POLICY IF EXISTS "Inloggade kan läsa sorteringsregistret" ON public.size_grades;
CREATE POLICY "Personal kan läsa sorteringsregistret" ON public.size_grades
FOR SELECT TO authenticated
USING (public.is_staff());

-- 7. Notifications: broadcast rows scoped to staff who can see the store,
--    and only the owner (or an admin) may modify them.
DROP POLICY IF EXISTS "Public can read non-user notifications" ON public.notifications;
DROP POLICY IF EXISTS "Users can read own notifications" ON public.notifications;
CREATE POLICY "Users can read own or scoped notifications" ON public.notifications
FOR SELECT TO authenticated
USING (
  user_id = auth.uid()
  OR (
    user_id IS NULL
    AND public.is_staff()
    AND (store_id IS NULL OR public.can_see_store(store_id))
  )
);

DROP POLICY IF EXISTS "Users can update own notifications" ON public.notifications;
CREATE POLICY "Users can update own notifications" ON public.notifications
FOR UPDATE TO authenticated
USING (user_id = auth.uid())
WITH CHECK (user_id = auth.uid());

DROP POLICY IF EXISTS "Users can delete own notifications" ON public.notifications;
CREATE POLICY "Users can delete own notifications" ON public.notifications
FOR DELETE TO authenticated
USING (user_id = auth.uid());

-- 8. KYC documents: owner-enforced writes, admin review
DROP POLICY IF EXISTS "Users can upload own kyc docs" ON storage.objects;
CREATE POLICY "Users can upload own kyc docs" ON storage.objects
FOR INSERT TO authenticated
WITH CHECK (
  bucket_id = 'kyc-documents'
  AND (storage.foldername(name))[1] = auth.uid()::text
  AND owner = auth.uid()
);

CREATE POLICY "Users can update own kyc docs" ON storage.objects
FOR UPDATE TO authenticated
USING (
  bucket_id = 'kyc-documents'
  AND (storage.foldername(name))[1] = auth.uid()::text
  AND owner = auth.uid()
)
WITH CHECK (
  bucket_id = 'kyc-documents'
  AND (storage.foldername(name))[1] = auth.uid()::text
  AND owner = auth.uid()
);

CREATE POLICY "Users can delete own kyc docs" ON storage.objects
FOR DELETE TO authenticated
USING (
  bucket_id = 'kyc-documents'
  AND (storage.foldername(name))[1] = auth.uid()::text
  AND owner = auth.uid()
);