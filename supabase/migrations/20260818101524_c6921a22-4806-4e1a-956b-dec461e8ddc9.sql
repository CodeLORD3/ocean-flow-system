CREATE OR REPLACE FUNCTION public.pk_daily_labor_cost(_store_id uuid, _date date)
 RETURNS TABLE(store_id uuid, day date, variable_cost numeric, fixed_cost numeric, actual_cost numeric, scheduled_cost numeric, work_time_sec bigint)
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  WITH cgs AS (
    SELECT connection_id, url, short_identifier, name FROM public.pk_costgroups WHERE store_id = _store_id
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
  FROM var, fixed, sched;
$function$;