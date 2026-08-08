DROP POLICY IF EXISTS "Authenticated can read offers" ON public.trade_offers;

CREATE OR REPLACE FUNCTION public.is_investor()
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.investor_profiles ip WHERE ip.user_id = auth.uid()
  )
$$;

CREATE POLICY "Staff and investors can read offers"
ON public.trade_offers
FOR SELECT
TO authenticated
USING (public.is_staff() OR public.is_investor());