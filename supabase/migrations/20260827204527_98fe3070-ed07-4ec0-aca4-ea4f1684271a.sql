CREATE OR REPLACE FUNCTION public.can_see_clock_store(_store_id uuid, _legal_entity_id text DEFAULT NULL)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path TO 'public'
AS $$
  SELECT
    -- Uttalade bolags-/koncernroller: insyn över butiksgränser
    public.is_platform_admin(auth.uid())
    OR public.has_role(auth.uid(), 'admin')
    OR (
      (
        public.has_role(auth.uid(), 'multi_store_manager')
        OR public.has_role(auth.uid(), 'company_admin')
        OR public.has_role(auth.uid(), 'region_admin')
        OR public.has_role(auth.uid(), 'group_admin')
      )
      AND public.has_company_access(
            auth.uid(),
            coalesce(
              _legal_entity_id,
              (SELECT s.legal_entity_id FROM public.stores s WHERE s.id = _store_id)
            )
          )
    )
    -- Butiksnivå: exakt butiksbehörighet krävs
    OR (
      _store_id IS NOT NULL
      AND public.has_scope(auth.uid(), 'store', _store_id::text)
    )
$$;

REVOKE ALL ON FUNCTION public.can_see_clock_store(uuid, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.can_see_clock_store(uuid, text) TO authenticated, service_role;

DROP POLICY IF EXISTS time_entries_read ON public.time_entries;
CREATE POLICY time_entries_read ON public.time_entries
  FOR SELECT TO authenticated
  USING (
    public.can_see_clock_store(store_id, legal_entity_id)
    OR public.employee_is_self(employee_id)
  );

DROP POLICY IF EXISTS time_entries_manual_insert ON public.time_entries;
CREATE POLICY time_entries_manual_insert ON public.time_entries
  FOR INSERT TO authenticated
  WITH CHECK (
    source = ANY (ARRAY['manual'::text, 'correction'::text])
    AND (
      public.is_platform_admin(auth.uid())
      OR public.has_role(auth.uid(), 'admin')
      OR (
        (
          public.has_role(auth.uid(), 'store_manager')
          OR public.has_role(auth.uid(), 'multi_store_manager')
        )
        AND store_id IS NOT NULL
        AND public.can_see_clock_store(store_id, legal_entity_id)
      )
    )
  );

DROP POLICY IF EXISTS clock_stations_read ON public.clock_stations;
CREATE POLICY clock_stations_read ON public.clock_stations
  FOR SELECT TO authenticated
  USING (public.can_see_clock_store(store_id, legal_entity_id));

DROP POLICY IF EXISTS clock_pending_read ON public.clock_pending_registrations;
CREATE POLICY clock_pending_read ON public.clock_pending_registrations
  FOR SELECT TO authenticated
  USING (public.can_see_clock_store(store_id, legal_entity_id));