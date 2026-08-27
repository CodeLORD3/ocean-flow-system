-- 1. Periodlås gäller ALLA nya tidsstämplingar, oavsett source
DROP TRIGGER IF EXISTS time_entries_lock_guard ON public.time_entries;
CREATE TRIGGER time_entries_lock_guard
BEFORE INSERT ON public.time_entries
FOR EACH ROW EXECUTE FUNCTION public.block_locked_time_entry();

-- 2. Anställda ser bara publicerade pass (utkast är chefens arbetsyta)
DROP POLICY IF EXISTS "shifts employee read" ON public.shifts;
CREATE POLICY "shifts employee read" ON public.shifts
FOR SELECT TO authenticated
USING (
  (status = 'published' AND public.employee_is_self(employee_id))
  OR (status = 'published' AND employee_id IS NULL
      AND store_id IN (SELECT public.my_employee_store_ids()))
);

-- 5. Deny-by-default: RLS på + inga app-rättigheter på de sju tabellerna
ALTER TABLE public.store_configs ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.price_overrides ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.fortnox_oauth_states ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.shopify_oauth_states ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.shopify_oauth_tokens ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.booking_otp ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.booking_rate_limits ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.store_configs FROM anon, authenticated;
REVOKE ALL ON public.price_overrides FROM anon, authenticated;
REVOKE ALL ON public.fortnox_oauth_states FROM anon, authenticated;
REVOKE ALL ON public.shopify_oauth_states FROM anon, authenticated;
REVOKE ALL ON public.shopify_oauth_tokens FROM anon, authenticated;
REVOKE ALL ON public.booking_otp FROM anon, authenticated;
REVOKE ALL ON public.booking_rate_limits FROM anon, authenticated;
GRANT ALL ON public.store_configs TO service_role;
GRANT ALL ON public.price_overrides TO service_role;
GRANT ALL ON public.fortnox_oauth_states TO service_role;
GRANT ALL ON public.shopify_oauth_states TO service_role;
GRANT ALL ON public.shopify_oauth_tokens TO service_role;
GRANT ALL ON public.booking_otp TO service_role;
GRANT ALL ON public.booking_rate_limits TO service_role;

-- 6a. lookup_employee_by_pnr: bara service role (kiosken går via clock-punch)
REVOKE EXECUTE ON FUNCTION public.lookup_employee_by_pnr(text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.lookup_employee_by_pnr(text) TO service_role;

-- 6b. Bolags-/butiksfilter på personalkostnadsfunktionerna
CREATE OR REPLACE FUNCTION public.cost_read_allowed(_store_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $$
  SELECT auth.uid() IS NOT NULL
     AND (public.has_role(auth.uid(), 'admin')
          OR public.is_platform_admin(auth.uid())
          OR public.can_see_store(_store_id))
$$;
REVOKE EXECUTE ON FUNCTION public.cost_read_allowed(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.cost_read_allowed(uuid) TO authenticated, service_role;

CREATE OR REPLACE FUNCTION public.pk_daily_labor_cost(_store_id uuid, _date date)
 RETURNS TABLE(store_id uuid, day date, variable_cost numeric, fixed_cost numeric, actual_cost numeric, scheduled_cost numeric, work_time_sec bigint, ongoing_cost numeric, ongoing_sec bigint, ongoing_count integer)
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  WITH guard AS (
    SELECT 1 FROM public.stores s WHERE s.id = _store_id AND s.unit_type = 'overhead'
  ),
  cgs AS (
    SELECT connection_id, url, short_identifier, name FROM public.pk_costgroups
    WHERE store_id = _store_id AND NOT EXISTS (SELECT 1 FROM guard)
  ),
  wps AS (
    SELECT connection_id, url FROM public.pk_workplaces
    WHERE store_id = _store_id AND NOT EXISTS (SELECT 1 FROM guard)
  ),
  var AS (
    SELECT COALESCE(SUM(l.cost), 0) AS c, COALESCE(SUM(l.work_time_sec), 0)::bigint AS secs
    FROM public.pk_logged_times l
    WHERE l.stop IS NOT NULL AND NOT l.is_canceled AND NOT l.is_guest
      AND (l.start AT TIME ZONE 'Europe/Stockholm')::date = _date
      AND (EXISTS (SELECT 1 FROM cgs WHERE cgs.connection_id = l.connection_id AND cgs.url = l.costgroup_url)
        OR (l.costgroup_url IS NULL AND EXISTS (
              SELECT 1 FROM wps WHERE wps.connection_id = l.connection_id AND wps.url = l.workplace_url)))
  ),
  ongoing AS (
    SELECT
      COALESCE(SUM(GREATEST(0, EXTRACT(EPOCH FROM (LEAST(now(), (_date + 1)::timestamptz) - l.start)))), 0)::bigint AS secs,
      COALESCE(SUM(
        GREATEST(0, EXTRACT(EPOCH FROM (LEAST(now(), (_date + 1)::timestamptz) - l.start))) / 3600.0
        * COALESCE(NULLIF(e.hourly_salary, 0), NULLIF(e.monthly_salary, 0) / 165.0, 0)
      ), 0) AS c,
      COUNT(*)::integer AS n
    FROM public.pk_logged_times l
    LEFT JOIN public.pk_staff_employments e
      ON e.connection_id = l.connection_id AND e.staff_url = l.staff_url
     AND e.start <= _date AND (e."end" IS NULL OR e."end" >= _date)
    WHERE l.stop IS NULL AND NOT l.is_canceled AND NOT l.is_guest
      AND (l.start AT TIME ZONE 'Europe/Stockholm')::date = _date
      AND (EXISTS (SELECT 1 FROM cgs WHERE cgs.connection_id = l.connection_id AND cgs.url = l.costgroup_url)
        OR (l.costgroup_url IS NULL AND EXISTS (
              SELECT 1 FROM wps WHERE wps.connection_id = l.connection_id AND wps.url = l.workplace_url)))
  ),
  fixed AS (
    SELECT COALESCE(SUM(e.fixed_cost_per_day), 0) AS c
    FROM public.pk_staff s
    JOIN public.pk_staff_employments e
      ON e.connection_id = s.connection_id AND e.staff_url = s.url
     AND e.start <= _date AND (e."end" IS NULL OR e."end" >= _date)
    WHERE COALESCE(e.fixed_cost_per_day, 0) > 0
      AND (EXISTS (SELECT 1 FROM cgs
                    WHERE cgs.connection_id = s.connection_id
                      AND (cgs.short_identifier::text = s.default_cost_group
                           OR cgs.url = s.default_cost_group
                           OR cgs.name = s.default_cost_group))
        OR (s.default_cost_group IS NULL AND EXISTS (
              SELECT 1 FROM wps WHERE wps.connection_id = s.connection_id AND wps.url = s.workplace_url)))
  ),
  sched AS (
    SELECT COALESCE(SUM(p.estimated_cost), 0) AS c
    FROM public.pk_work_periods p
    WHERE p.date = _date AND p.is_published AND NOT p.is_deleted
      AND (EXISTS (SELECT 1 FROM cgs WHERE cgs.connection_id = p.connection_id AND cgs.url = p.costgroup_url)
        OR (p.costgroup_url IS NULL AND EXISTS (
              SELECT 1 FROM wps WHERE wps.connection_id = p.connection_id AND wps.url = p.workplace_url)))
  )
  SELECT _store_id, _date, var.c, fixed.c, var.c + fixed.c + ongoing.c, sched.c,
         var.secs + ongoing.secs, ongoing.c, ongoing.secs, ongoing.n
  FROM var, fixed, sched, ongoing
  WHERE NOT EXISTS (SELECT 1 FROM guard)
    AND (auth.uid() IS NULL OR public.cost_read_allowed(_store_id));
$function$;
REVOKE EXECUTE ON FUNCTION public.pk_daily_labor_cost(uuid, date) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.pk_daily_labor_cost(uuid, date) TO authenticated, service_role;

CREATE OR REPLACE FUNCTION public.pk_overhead_daily_cost(_date date)
 RETURNS TABLE(legal_entity_id text, unit_id uuid, unit_name text, variable_cost numeric, fixed_cost numeric, actual_cost numeric, scheduled_cost numeric, work_time_sec bigint, ongoing_cost numeric, ongoing_sec bigint)
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  WITH units AS (
    SELECT s.id, s.name, s.legal_entity_id FROM public.stores s
    WHERE s.unit_type = 'overhead'
      AND (auth.uid() IS NULL
           OR public.has_role(auth.uid(), 'admin')
           OR public.is_platform_admin(auth.uid())
           OR public.can_see_company(s.legal_entity_id))
  ),
  cgs AS (
    SELECT c.connection_id, c.url, c.short_identifier, c.name, c.store_id
    FROM public.pk_costgroups c JOIN units u ON u.id = c.store_id
  ),
  var AS (
    SELECT cgs.store_id, COALESCE(SUM(l.cost), 0) AS c, COALESCE(SUM(l.work_time_sec), 0)::bigint AS secs
    FROM public.pk_logged_times l
    JOIN cgs ON cgs.connection_id = l.connection_id AND cgs.url = l.costgroup_url
    WHERE l.stop IS NOT NULL AND NOT l.is_canceled AND NOT l.is_guest
      AND (l.start AT TIME ZONE 'Europe/Stockholm')::date = _date
    GROUP BY 1
  ),
  ongoing AS (
    SELECT cgs.store_id,
      COALESCE(SUM(GREATEST(0, EXTRACT(EPOCH FROM (LEAST(now(), (_date + 1)::timestamptz) - l.start)))), 0)::bigint AS secs,
      COALESCE(SUM(
        GREATEST(0, EXTRACT(EPOCH FROM (LEAST(now(), (_date + 1)::timestamptz) - l.start))) / 3600.0
        * COALESCE(NULLIF(e.hourly_salary, 0), NULLIF(e.monthly_salary, 0) / 165.0, 0)
      ), 0) AS c
    FROM public.pk_logged_times l
    JOIN cgs ON cgs.connection_id = l.connection_id AND cgs.url = l.costgroup_url
    LEFT JOIN public.pk_staff_employments e
      ON e.connection_id = l.connection_id AND e.staff_url = l.staff_url
     AND e.start <= _date AND (e."end" IS NULL OR e."end" >= _date)
    WHERE l.stop IS NULL AND NOT l.is_canceled AND NOT l.is_guest
      AND (l.start AT TIME ZONE 'Europe/Stockholm')::date = _date
    GROUP BY 1
  ),
  fixed AS (
    SELECT cgs.store_id, COALESCE(SUM(e.fixed_cost_per_day), 0) AS c
    FROM public.pk_staff s
    JOIN public.pk_staff_employments e
      ON e.connection_id = s.connection_id AND e.staff_url = s.url
     AND e.start <= _date AND (e."end" IS NULL OR e."end" >= _date)
    JOIN cgs ON cgs.connection_id = s.connection_id
      AND (cgs.short_identifier::text = s.default_cost_group
           OR cgs.url = s.default_cost_group
           OR cgs.name = s.default_cost_group)
    WHERE COALESCE(e.fixed_cost_per_day, 0) > 0
    GROUP BY 1
  ),
  sched AS (
    SELECT cgs.store_id, COALESCE(SUM(p.estimated_cost), 0) AS c
    FROM public.pk_work_periods p
    JOIN cgs ON cgs.connection_id = p.connection_id AND cgs.url = p.costgroup_url
    WHERE p.date = _date AND p.is_published AND NOT p.is_deleted
    GROUP BY 1
  )
  SELECT u.legal_entity_id, u.id, u.name,
         COALESCE(var.c, 0), COALESCE(fixed.c, 0),
         COALESCE(var.c, 0) + COALESCE(fixed.c, 0) + COALESCE(ongoing.c, 0),
         COALESCE(sched.c, 0), COALESCE(var.secs, 0)::bigint + COALESCE(ongoing.secs, 0)::bigint,
         COALESCE(ongoing.c, 0), COALESCE(ongoing.secs, 0)::bigint
  FROM units u
  LEFT JOIN var ON var.store_id = u.id
  LEFT JOIN ongoing ON ongoing.store_id = u.id
  LEFT JOIN fixed ON fixed.store_id = u.id
  LEFT JOIN sched ON sched.store_id = u.id;
$function$;
REVOKE EXECUTE ON FUNCTION public.pk_overhead_daily_cost(date) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.pk_overhead_daily_cost(date) TO authenticated, service_role;

-- 6c. Intern behörighetskontroll på muterande funktioner (wrapper runt befintlig logik)
CREATE OR REPLACE FUNCTION public.stock_write_allowed()
RETURNS boolean
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $$
  SELECT auth.uid() IS NULL
      OR public.has_role(auth.uid(), 'admin')
      OR public.is_platform_admin(auth.uid())
      OR public.is_staff()
$$;
REVOKE EXECUTE ON FUNCTION public.stock_write_allowed() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.stock_write_allowed() TO authenticated, service_role;

ALTER FUNCTION public.post_purchase_report(uuid, uuid, jsonb) RENAME TO post_purchase_report_internal;
REVOKE ALL ON FUNCTION public.post_purchase_report_internal(uuid, uuid, jsonb) FROM PUBLIC, anon, authenticated;
CREATE OR REPLACE FUNCTION public.post_purchase_report(p_report_id uuid, p_location_id uuid, p_lots jsonb)
RETURNS uuid[]
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
BEGIN
  IF NOT public.stock_write_allowed() THEN
    RAISE EXCEPTION 'Behörighet saknas';
  END IF;
  RETURN public.post_purchase_report_internal(p_report_id, p_location_id, p_lots);
END; $$;
REVOKE EXECUTE ON FUNCTION public.post_purchase_report(uuid, uuid, jsonb) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.post_purchase_report(uuid, uuid, jsonb) TO authenticated, service_role;

ALTER FUNCTION public.reclassify_lot_product(uuid, uuid) RENAME TO reclassify_lot_product_internal;
REVOKE ALL ON FUNCTION public.reclassify_lot_product_internal(uuid, uuid) FROM PUBLIC, anon, authenticated;
CREATE OR REPLACE FUNCTION public.reclassify_lot_product(_lot_id uuid, _new_product_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
BEGIN
  IF NOT public.stock_write_allowed() THEN
    RAISE EXCEPTION 'Behörighet saknas';
  END IF;
  RETURN public.reclassify_lot_product_internal(_lot_id, _new_product_id);
END; $$;
REVOKE EXECUTE ON FUNCTION public.reclassify_lot_product(uuid, uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.reclassify_lot_product(uuid, uuid) TO authenticated, service_role;

ALTER FUNCTION public.staff_shifts_rebuild_from_clock(uuid, date) RENAME TO staff_shifts_rebuild_from_clock_internal;
REVOKE ALL ON FUNCTION public.staff_shifts_rebuild_from_clock_internal(uuid, date) FROM PUBLIC, anon, authenticated;
CREATE OR REPLACE FUNCTION public.staff_shifts_rebuild_from_clock(_employee_id uuid, _day date)
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
BEGIN
  IF NOT (auth.uid() IS NULL
          OR public.has_role(auth.uid(), 'admin')
          OR public.is_platform_admin(auth.uid())
          OR public.is_staff_manager()) THEN
    RAISE EXCEPTION 'Behörighet saknas';
  END IF;
  RETURN public.staff_shifts_rebuild_from_clock_internal(_employee_id, _day);
END; $$;
REVOKE EXECUTE ON FUNCTION public.staff_shifts_rebuild_from_clock(uuid, date) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.staff_shifts_rebuild_from_clock(uuid, date) TO authenticated, service_role;

CREATE OR REPLACE FUNCTION public.staff_shifts_rebuild_range(_from date, _to date)
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_row record;
  v_total integer := 0;
BEGIN
  IF NOT (auth.uid() IS NULL
          OR public.has_role(auth.uid(), 'admin')
          OR public.is_platform_admin(auth.uid())
          OR public.is_staff_manager()) THEN
    RAISE EXCEPTION 'Behörighet saknas';
  END IF;
  FOR v_row IN
    SELECT DISTINCT te.employee_id,
           (te.occurred_at AT TIME ZONE 'Europe/Stockholm')::date AS day
      FROM public.time_entries te
     WHERE te.type IN ('in','ut')
       AND (te.occurred_at AT TIME ZONE 'Europe/Stockholm')::date BETWEEN _from AND _to
  LOOP
    v_total := v_total + public.staff_shifts_rebuild_from_clock_internal(v_row.employee_id, v_row.day);
  END LOOP;
  RETURN v_total;
END; $$;
REVOKE EXECUTE ON FUNCTION public.staff_shifts_rebuild_range(date, date) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.staff_shifts_rebuild_range(date, date) TO authenticated, service_role;