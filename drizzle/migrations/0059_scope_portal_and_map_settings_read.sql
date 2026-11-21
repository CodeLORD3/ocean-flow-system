CREATE OR REPLACE FUNCTION public.is_internal_user()
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path TO 'public'
AS $$
  SELECT auth.uid() IS NOT NULL AND (
    EXISTS (SELECT 1 FROM public.staff s WHERE s.user_id = auth.uid())
    OR EXISTS (SELECT 1 FROM public.user_roles r WHERE r.user_id = auth.uid())
    OR EXISTS (SELECT 1 FROM public.user_scopes us WHERE us.user_id = auth.uid())
  )
$$;

REVOKE EXECUTE ON FUNCTION public.is_internal_user() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.is_internal_user() TO authenticated, service_role;

DROP POLICY IF EXISTS "Signed-in read portal_settings" ON public.portal_settings;
CREATE POLICY "Internal users read portal_settings"
ON public.portal_settings
FOR SELECT
TO authenticated
USING (public.is_internal_user());

DROP POLICY IF EXISTS "Signed-in read map_settings" ON public.map_settings;
CREATE POLICY "Internal users and onboarded investors read map_settings"
ON public.map_settings
FOR SELECT
TO authenticated
USING (
  public.is_internal_user()
  OR EXISTS (
    SELECT 1 FROM public.investor_profiles ip
    WHERE ip.user_id = auth.uid() AND ip.kyc_completed = true
  )
);