CREATE TABLE public.pk_costgroups (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  connection_id uuid NOT NULL REFERENCES public.pk_connections(id) ON DELETE CASCADE,
  url text NOT NULL,
  short_identifier integer,
  name text,
  workplace_url text,
  store_id uuid REFERENCES public.stores(id),
  store_id_manual boolean NOT NULL DEFAULT false,
  raw jsonb,
  synced_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (connection_id, url)
);

GRANT SELECT, UPDATE ON public.pk_costgroups TO authenticated;
GRANT ALL ON public.pk_costgroups TO service_role;

ALTER TABLE public.pk_costgroups ENABLE ROW LEVEL SECURITY;

CREATE POLICY "pk_costgroups_read" ON public.pk_costgroups FOR SELECT TO authenticated USING (public.pk_can_read());
CREATE POLICY "pk_costgroups_map" ON public.pk_costgroups FOR UPDATE TO authenticated USING (public.pk_can_read_salary()) WITH CHECK (public.pk_can_read_salary());

-- Vyn: butiken hämtas från kostnadsgruppen, arbetsplatsen är reserv.
DROP VIEW IF EXISTS public.v_pk_clocked_in_now;
CREATE VIEW public.v_pk_clocked_in_now
WITH (security_invoker = true) AS
WITH today AS (SELECT (now() AT TIME ZONE 'Europe/Stockholm')::date AS d),
wp AS (
  SELECT p.connection_id, p.url AS work_period_url, p.staff_url, p.staff_name,
         p.workplace_url, p.costgroup_url, p.costgroup_name, p.start, p."end", p.estimated_cost
  FROM public.pk_work_periods p, today t
  WHERE p.date = t.d AND p.is_published AND NOT p.is_deleted
),
lt AS (
  SELECT l.* FROM public.pk_logged_times l, today t
  WHERE NOT l.is_canceled
    AND ((l.start AT TIME ZONE 'Europe/Stockholm')::date = t.d
         OR (l.stop IS NULL AND l.start IS NOT NULL))
),
joined AS (
  SELECT
    COALESCE(wp.connection_id, lt.connection_id) AS connection_id,
    COALESCE(wp.workplace_url, lt.workplace_url) AS workplace_url,
    COALESCE(lt.costgroup_url, wp.costgroup_url) AS costgroup_url,
    COALESCE(lt.costgroup_name, wp.costgroup_name) AS costgroup_name,
    COALESCE(wp.staff_url, lt.staff_url) AS staff_url,
    wp.work_period_url,
    lt.url AS logged_time_url,
    wp.start AS scheduled_start,
    wp."end" AS scheduled_end,
    wp.estimated_cost,
    lt.real_start, lt.real_stop, lt.stop, lt.start AS logged_start,
    lt.is_guest, lt.guest_name, wp.staff_name
  FROM wp
  FULL OUTER JOIN lt
    ON lt.connection_id = wp.connection_id
   AND (lt.work_period_url = wp.work_period_url
        OR (lt.work_period_url IS NULL AND lt.staff_url = wp.staff_url AND lt.workplace_url = wp.workplace_url))
)
SELECT
  j.connection_id,
  COALESCE(cg.store_id, w.store_id) AS store_id,
  s.name AS store_name,
  j.workplace_url,
  w.name AS workplace_name,
  j.costgroup_url,
  j.costgroup_name,
  j.staff_url,
  CASE WHEN j.is_guest THEN COALESCE(j.guest_name, 'Gäst')
       ELSE COALESCE(NULLIF(TRIM(CONCAT(ps.first_name, ' ', ps.last_name)), ''), j.staff_name, 'Okänd') END AS display_name,
  j.is_guest,
  j.scheduled_start,
  j.scheduled_end,
  j.estimated_cost,
  COALESCE(j.real_start, j.logged_start) AS clocked_in_at,
  COALESCE(j.real_stop, j.stop) AS clocked_out_at,
  CASE
    WHEN j.logged_time_url IS NOT NULL AND j.stop IS NULL THEN 'pa_plats'
    WHEN j.logged_time_url IS NOT NULL AND j.stop IS NOT NULL THEN 'avslutad'
    WHEN j.work_period_url IS NULL THEN 'oplanerad'
    WHEN j.scheduled_start IS NOT NULL AND j.scheduled_start < now() - interval '10 minutes' THEN 'ej_instamplad'
    ELSE 'kommer'
  END AS status,
  CASE WHEN j.stop IS NULL AND j.logged_time_url IS NOT NULL
       THEN EXTRACT(EPOCH FROM (now() - COALESCE(j.real_start, j.logged_start)))::int END AS ongoing_seconds
FROM joined j
LEFT JOIN public.pk_costgroups cg ON cg.connection_id = j.connection_id AND cg.url = j.costgroup_url
LEFT JOIN public.pk_workplaces w ON w.connection_id = j.connection_id AND w.url = j.workplace_url
LEFT JOIN public.stores s ON s.id = COALESCE(cg.store_id, w.store_id)
LEFT JOIN public.pk_staff ps ON ps.connection_id = j.connection_id AND ps.url = j.staff_url
ORDER BY s.name NULLS LAST, j.costgroup_name NULLS LAST, j.scheduled_start NULLS LAST;

GRANT SELECT ON public.v_pk_clocked_in_now TO authenticated;

-- Daglig personalkostnad per butik, via kostnadsgrupp (arbetsplats som reserv).
CREATE OR REPLACE FUNCTION public.pk_daily_labor_cost(_store_id uuid, _date date)
RETURNS TABLE (
  store_id uuid, day date, variable_cost numeric, fixed_cost numeric,
  actual_cost numeric, scheduled_cost numeric, work_time_sec bigint
)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  WITH cgs AS (
    SELECT connection_id, url FROM public.pk_costgroups WHERE store_id = _store_id
  ),
  wps AS (
    SELECT connection_id, url FROM public.pk_workplaces WHERE store_id = _store_id
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
      AND (EXISTS (SELECT 1 FROM cgs WHERE cgs.connection_id = s.connection_id AND cgs.url = s.default_cost_group)
        OR EXISTS (SELECT 1 FROM wps WHERE wps.connection_id = s.connection_id AND wps.url = s.workplace_url))
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
  FROM var, fixed, sched;
$$;

REVOKE ALL ON FUNCTION public.pk_daily_labor_cost(uuid, date) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.pk_daily_labor_cost(uuid, date) TO authenticated, service_role;