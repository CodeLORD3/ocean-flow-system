CREATE OR REPLACE FUNCTION public.is_auction_user()
RETURNS boolean
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $$
  SELECT public.is_platform_admin(auth.uid())
      OR public.has_role(auth.uid(), 'admin')
      OR EXISTS (
        SELECT 1 FROM public.user_scopes
        WHERE user_id = auth.uid()
          AND scope_type = 'portal'
          AND scope_value IN ('production', 'wholesale', 'admin')
      )
$$;

DROP POLICY IF EXISTS "Personal kan se auktionsinkop" ON public.auction_purchases;
DROP POLICY IF EXISTS "Personal kan registrera auktionsinkop" ON public.auction_purchases;
DROP POLICY IF EXISTS "Personal kan andra auktionsinkop" ON public.auction_purchases;

CREATE POLICY "Grossist och inkop kan se auktionsinkop"
  ON public.auction_purchases FOR SELECT TO authenticated
  USING (public.is_auction_user());

CREATE POLICY "Grossist och inkop kan registrera auktionsinkop"
  ON public.auction_purchases FOR INSERT TO authenticated
  WITH CHECK (public.is_auction_user());

CREATE POLICY "Grossist och inkop kan andra auktionsinkop"
  ON public.auction_purchases FOR UPDATE TO authenticated
  USING (public.is_auction_user())
  WITH CHECK (public.is_auction_user());