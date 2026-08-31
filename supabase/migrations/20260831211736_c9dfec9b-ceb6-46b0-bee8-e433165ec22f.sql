-- Fortnox: personal + bolagsbehörighet krävs
DROP POLICY IF EXISTS "fortnox_api_log_read" ON public.fortnox_api_log;
CREATE POLICY "fortnox_api_log_read" ON public.fortnox_api_log
  FOR SELECT TO authenticated
  USING (public.is_staff() AND public.can_see_company(legal_entity_code));

DROP POLICY IF EXISTS "fortnox_connections_read" ON public.fortnox_connections;
CREATE POLICY "fortnox_connections_read" ON public.fortnox_connections
  FOR SELECT TO authenticated
  USING (public.is_staff() AND public.can_see_company(legal_entity_code));

DROP POLICY IF EXISTS "fortnox_customers_read" ON public.fortnox_customers;
CREATE POLICY "fortnox_customers_read" ON public.fortnox_customers
  FOR SELECT TO authenticated
  USING (public.is_staff() AND public.can_see_company(legal_entity_code));

DROP POLICY IF EXISTS "fortnox_article_map_read" ON public.fortnox_article_map;
CREATE POLICY "fortnox_article_map_read" ON public.fortnox_article_map
  FOR SELECT TO authenticated
  USING (public.is_staff() AND public.can_see_company(legal_entity_code));

DROP POLICY IF EXISTS "fortnox_invoice_jobs_read" ON public.fortnox_invoice_jobs;
CREATE POLICY "fortnox_invoice_jobs_read" ON public.fortnox_invoice_jobs
  FOR SELECT TO authenticated
  USING (public.is_staff() AND public.can_see_company(legal_entity_code));

DROP POLICY IF EXISTS "fortnox_customer_map_rw" ON public.fortnox_customer_map;
CREATE POLICY "fortnox_customer_map_read" ON public.fortnox_customer_map
  FOR SELECT TO authenticated
  USING (public.is_staff() AND public.can_see_company(legal_entity_code));
CREATE POLICY "fortnox_customer_map_write" ON public.fortnox_customer_map
  FOR ALL TO authenticated
  USING (public.is_staff_manager() AND public.can_see_company(legal_entity_code))
  WITH CHECK (public.is_staff_manager() AND public.can_see_company(legal_entity_code));

-- HR-konfiguration: endast personal
DROP POLICY IF EXISTS "shift_types read" ON public.shift_types;
CREATE POLICY "shift_types read" ON public.shift_types
  FOR SELECT TO authenticated
  USING (public.is_staff());

DROP POLICY IF EXISTS "absence_types_read" ON public.absence_types;
CREATE POLICY "absence_types_read" ON public.absence_types
  FOR SELECT TO authenticated
  USING (public.is_staff());

DROP POLICY IF EXISTS "absence_policies_read" ON public.absence_policies;
CREATE POLICY "absence_policies_read" ON public.absence_policies
  FOR SELECT TO authenticated
  USING (public.is_staff());

DROP POLICY IF EXISTS "staffing needs read" ON public.staffing_needs;
CREATE POLICY "staffing needs read" ON public.staffing_needs
  FOR SELECT TO authenticated
  USING (public.is_staff());

-- Frånvarodagar: egen data eller chef med behörighet till den anställde
DROP POLICY IF EXISTS "absence_days_select" ON public.absence_days;
CREATE POLICY "absence_days_select" ON public.absence_days
  FOR SELECT TO authenticated
  USING (public.is_staff() AND public.can_see_employee(employee_id));

-- Bolagsregister: personal krävs, inte bara bolagsbehörighet
DROP POLICY IF EXISTS "legal_entities_read" ON public.legal_entities;
CREATE POLICY "legal_entities_read" ON public.legal_entities
  FOR SELECT TO authenticated
  USING (public.is_staff() AND public.can_see_company(legal_entity_id));

DROP POLICY IF EXISTS "scp_read" ON public.store_company_periods;
CREATE POLICY "scp_read" ON public.store_company_periods
  FOR SELECT TO authenticated
  USING (public.is_staff() AND public.can_see_company(legal_entity_id));