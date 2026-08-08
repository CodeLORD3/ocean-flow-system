CREATE OR REPLACE FUNCTION public.is_staff()
RETURNS boolean
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path = public
AS $$
  SELECT public.has_role(auth.uid(), 'admin')
      OR EXISTS (SELECT 1 FROM public.staff s WHERE s.user_id = auth.uid())
$$;

DO $$
DECLARE
  investor_tables text[] := ARRAY[
    'investor_profiles','pledges','trade_offers','offer_documents','suitability_responses',
    'payment_events','company_documents','companies','user_roles','user_sessions','page_visits',
    'notifications','notification_reads','notification_preferences',
    'landing_settings','currency_settings','contact_settings','about_us_settings',
    'map_settings','portal_settings','legal_entities','pos_cashiers','staff'
  ];
  p record;
BEGIN
  FOR p IN
    SELECT tablename, policyname, cmd, qual, with_check
    FROM pg_policies
    WHERE schemaname = 'public'
      AND roles::text[] = ARRAY['authenticated']
      AND NOT (tablename = ANY(investor_tables))
      AND (COALESCE(qual, 'true') = 'true' AND COALESCE(with_check, 'true') = 'true')
  LOOP
    IF p.qual IS NOT NULL AND p.with_check IS NOT NULL THEN
      EXECUTE format('ALTER POLICY %I ON public.%I USING (public.is_staff()) WITH CHECK (public.is_staff())',
                     p.policyname, p.tablename);
    ELSIF p.qual IS NOT NULL THEN
      EXECUTE format('ALTER POLICY %I ON public.%I USING (public.is_staff())',
                     p.policyname, p.tablename);
    ELSE
      EXECUTE format('ALTER POLICY %I ON public.%I WITH CHECK (public.is_staff())',
                     p.policyname, p.tablename);
    END IF;
  END LOOP;
END $$;

-- Personalregistret: bara personal ser personal.
ALTER POLICY "Staff readable by authenticated" ON public.staff USING (public.is_staff());