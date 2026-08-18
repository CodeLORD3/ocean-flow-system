ALTER TABLE public.stores
  ADD COLUMN IF NOT EXISTS unit_type text NOT NULL DEFAULT 'butik';

ALTER TABLE public.stores
  DROP CONSTRAINT IF EXISTS stores_unit_type_check;
ALTER TABLE public.stores
  ADD CONSTRAINT stores_unit_type_check CHECK (unit_type IN ('butik','grossist','overhead'));

UPDATE public.stores SET unit_type = 'grossist' WHERE is_wholesale AND unit_type = 'butik';

INSERT INTO public.stores (name, city, slug, legal_entity_id, unit_type, is_wholesale, active, country, currency, locale)
SELECT 'Administration DE No.1', 'Stockholm', 'administration-de-no1', 'de-no1', 'overhead', false, true, 'SE', 'SEK', 'sv-SE'
WHERE NOT EXISTS (SELECT 1 FROM public.stores WHERE name = 'Administration DE No.1');

-- Overhead ska aldrig läsas som butikskostnad.
CREATE OR REPLACE FUNCTION public.pk_daily_labor_cost(_store_id uuid, _date date)
RETURNS TABLE(store_id uuid, day date, variable_cost numeric, fixed_cost numeric, actual_cost numeric, scheduled_cost numeric, work_time_sec bigint)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
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
  SELECT _store_id, _date, var.c, fixed.c, var.c + fixed.c, sched.c, var.secs
  FROM var, fixed, sched
  WHERE NOT EXISTS (SELECT 1 FROM guard);
$$;

-- Overhead per bolag och dag, på egen rad.
CREATE OR REPLACE FUNCTION public.pk_overhead_daily_cost(_date date)
RETURNS TABLE(legal_entity_id text, unit_id uuid, unit_name text, variable_cost numeric, fixed_cost numeric, actual_cost numeric, scheduled_cost numeric, work_time_sec bigint)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  WITH units AS (
    SELECT s.id, s.name, s.legal_entity_id FROM public.stores s WHERE s.unit_type = 'overhead'
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
         COALESCE(var.c, 0) + COALESCE(fixed.c, 0),
         COALESCE(sched.c, 0), COALESCE(var.secs, 0)::bigint
  FROM units u
  LEFT JOIN var ON var.store_id = u.id
  LEFT JOIN fixed ON fixed.store_id = u.id
  LEFT JOIN sched ON sched.store_id = u.id;
$$;

GRANT EXECUTE ON FUNCTION public.pk_overhead_daily_cost(date) TO authenticated;