CREATE OR REPLACE FUNCTION public.is_staff_manager()
RETURNS boolean
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path = public
AS $$
  SELECT public.has_role(auth.uid(), 'admin')
      OR EXISTS (
        SELECT 1 FROM public.staff s
        WHERE s.user_id = auth.uid()
          AND s.portal_access && ARRAY['admin','wholesale','production']
      )
$$;

CREATE OR REPLACE FUNCTION public.staff_has_store(_store uuid)
RETURNS boolean
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path = public
AS $$
  SELECT public.is_staff_manager()
      OR EXISTS (
        SELECT 1 FROM public.staff s
        WHERE s.user_id = auth.uid()
          AND (_store = ANY(COALESCE(s.allowed_store_ids, '{}'::uuid[])) OR s.store_id = _store)
      )
$$;

-- Investerarprofiler
DROP POLICY IF EXISTS "Public select investor_profiles" ON public.investor_profiles;
DROP POLICY IF EXISTS "Public insert investor_profiles" ON public.investor_profiles;
DROP POLICY IF EXISTS "Public update investor_profiles" ON public.investor_profiles;
DROP POLICY IF EXISTS "Public delete investor_profiles" ON public.investor_profiles;
DROP POLICY IF EXISTS "Admins can manage profiles" ON public.investor_profiles;
CREATE POLICY "Managers can manage investor profiles" ON public.investor_profiles
  FOR ALL TO authenticated USING (public.is_staff_manager()) WITH CHECK (public.is_staff_manager());
CREATE POLICY "Users can update own profile" ON public.investor_profiles
  FOR UPDATE TO authenticated USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

-- Åtaganden
DROP POLICY IF EXISTS "Public read pledges" ON public.pledges;
DROP POLICY IF EXISTS "Public insert pledges" ON public.pledges;
DROP POLICY IF EXISTS "Public update pledges" ON public.pledges;
DROP POLICY IF EXISTS "Admins can manage pledges" ON public.pledges;
DROP POLICY IF EXISTS "Admins can read all pledges" ON public.pledges;
CREATE POLICY "Managers can manage pledges" ON public.pledges
  FOR ALL TO authenticated USING (public.is_staff_manager()) WITH CHECK (public.is_staff_manager());

-- Erbjudanden
DROP POLICY IF EXISTS "Public insert trade_offers" ON public.trade_offers;
DROP POLICY IF EXISTS "Public update trade_offers" ON public.trade_offers;
DROP POLICY IF EXISTS "Public delete trade_offers" ON public.trade_offers;
DROP POLICY IF EXISTS "Admins can manage offers" ON public.trade_offers;
CREATE POLICY "Managers can manage offers" ON public.trade_offers
  FOR ALL TO authenticated USING (public.is_staff_manager()) WITH CHECK (public.is_staff_manager());

-- Personal
DROP POLICY IF EXISTS "Public access" ON public.staff;
CREATE POLICY "Staff readable by authenticated" ON public.staff
  FOR SELECT TO authenticated USING (true);
CREATE POLICY "Managers manage staff" ON public.staff
  FOR ALL TO authenticated USING (public.is_staff_manager()) WITH CHECK (public.is_staff_manager());
CREATE POLICY "Staff update own record" ON public.staff
  FOR UPDATE TO authenticated USING (user_id = auth.uid()) WITH CHECK (user_id = auth.uid());

-- Kunder
DROP POLICY IF EXISTS "Public access" ON public.customers;
CREATE POLICY "Store scoped customers" ON public.customers
  FOR ALL TO authenticated
  USING (public.staff_has_store(store_id)) WITH CHECK (public.staff_has_store(store_id));

-- Bolag och juridiska enheter
DROP POLICY IF EXISTS "Public access" ON public.companies;
CREATE POLICY "Managers manage companies" ON public.companies
  FOR ALL TO authenticated USING (public.is_staff_manager()) WITH CHECK (public.is_staff_manager());
DROP POLICY IF EXISTS "Public manage legal_entities" ON public.legal_entities;
DROP POLICY IF EXISTS "Public read legal_entities" ON public.legal_entities;
CREATE POLICY "Managers manage legal entities" ON public.legal_entities
  FOR ALL TO authenticated USING (public.is_staff_manager()) WITH CHECK (public.is_staff_manager());

-- Kassörer
DROP POLICY IF EXISTS "Public access" ON public.pos_cashiers;
CREATE POLICY "Managers manage cashiers" ON public.pos_cashiers
  FOR ALL TO authenticated USING (public.is_staff_manager()) WITH CHECK (public.is_staff_manager());