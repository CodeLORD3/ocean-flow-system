REVOKE EXECUTE ON FUNCTION public.flag_wrong_system_punches(date, date) FROM authenticated;

CREATE OR REPLACE FUNCTION public.clock_ops_day(_day date DEFAULT NULL)
RETURNS TABLE(
  store_id uuid,
  store_name text,
  legal_entity_id text,
  clock_active_from date,
  punches integer,
  employees_punched integer,
  warnings integer,
  scheduled_shifts integer,
  tone text
)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  WITH d AS (SELECT coalesce(_day, (now() AT TIME ZONE 'Europe/Stockholm')::date - 1) AS day),
  st AS (
    SELECT s.id, s.name, s.legal_entity_id, s.clock_active_from
    FROM public.stores s
    WHERE public.is_staff()
      AND coalesce(s.country,'SE') = 'SE' AND coalesce(s.active,true) = true
      AND s.clock_active_from IS NOT NULL
      AND public.can_see_store(s.id)
  ),
  p AS (
    SELECT te.store_id, count(*)::int AS punches, count(DISTINCT te.employee_id)::int AS emps
    FROM public.time_entries te
    JOIN public.employees e ON e.id = te.employee_id
    JOIN d ON true
    WHERE te.arbetsdag = d.day AND coalesce(e.is_test, false) = false
    GROUP BY te.store_id
  ),
  w AS (
    SELECT x.store_id, count(*)::int AS warnings
    FROM public.wrong_system_punches x JOIN d ON true
    WHERE x.work_date = d.day GROUP BY x.store_id
  ),
  sc AS (
    SELECT sh.store_id, count(*)::int AS shifts
    FROM public.shifts sh JOIN d ON true
    WHERE sh.date = d.day AND coalesce(sh.status,'') <> 'cancelled'
    GROUP BY sh.store_id
  )
  SELECT st.id, st.name, st.legal_entity_id, st.clock_active_from,
         coalesce(p.punches,0), coalesce(p.emps,0),
         coalesce(w.warnings,0), coalesce(sc.shifts,0),
         CASE
           WHEN (SELECT day FROM d) < st.clock_active_from THEN 'pending'
           WHEN coalesce(p.punches,0) = 0 AND coalesce(sc.shifts,0) > 0 THEN 'red'
           WHEN coalesce(w.warnings,0) > 0 THEN 'yellow'
           WHEN coalesce(p.punches,0) > 0 THEN 'green'
           ELSE 'none'
         END
  FROM st
  LEFT JOIN p ON p.store_id = st.id
  LEFT JOIN w ON w.store_id = st.id
  LEFT JOIN sc ON sc.store_id = st.id
  ORDER BY st.name;
$$;