CREATE OR REPLACE VIEW public.pk_logged_times_effective
WITH (security_invoker = on) AS
SELECT
  lt.id, lt.connection_id, lt.staff_url, lt.costgroup_url, lt.costgroup_name,
  lt.start, lt.stop, lt.work_time_sec, lt.is_canceled,
  (lt.start AT TIME ZONE 'Europe/Stockholm')::date AS work_date,
  round(COALESCE(lt.work_time_sec,0) / 3600.0, 2) AS hours,
  ps.employee_id,
  cg.store_id AS raw_store_id,
  a.is_admin,
  CASE WHEN a.is_admin THEN COALESCE(pl.store_id, em.store_id, cg.store_id) ELSE cg.store_id END AS effective_store_id,
  CASE WHEN NOT a.is_admin THEN 'kostnadsgrupp'
       WHEN pl.store_id IS NOT NULL THEN 'planerat_pass'
       WHEN em.store_id IS NOT NULL THEN 'anstallning'
       ELSE 'ej_fordelad' END AS allocation_source
FROM public.pk_logged_times lt
LEFT JOIN public.pk_costgroups cg ON cg.connection_id = lt.connection_id AND cg.url = lt.costgroup_url
LEFT JOIN public.stores cs ON cs.id = cg.store_id
LEFT JOIN public.pk_staff ps ON ps.connection_id = lt.connection_id AND ps.url = lt.staff_url
LEFT JOIN public.employees e ON e.id = ps.employee_id
CROSS JOIN LATERAL (SELECT (COALESCE(cg.name, lt.costgroup_name, '') ILIKE 'Administration%' OR cs.unit_type = 'overhead') AS is_admin) a
LEFT JOIN LATERAL (
  SELECT sp.store_id FROM public.staff_planned_shifts sp
  JOIN public.stores s ON s.id = sp.store_id AND COALESCE(s.unit_type,'') <> 'overhead'
  WHERE a.is_admin AND e.staff_id IS NOT NULL AND sp.staff_id = e.staff_id
    AND sp.shift_date = (lt.start AT TIME ZONE 'Europe/Stockholm')::date
  ORDER BY sp.start_time LIMIT 1
) pl ON true
LEFT JOIN LATERAL (
  SELECT em.store_id FROM public.employments em
  JOIN public.stores s ON s.id = em.store_id AND COALESCE(s.unit_type,'') <> 'overhead'
  WHERE a.is_admin AND em.employee_id = ps.employee_id
    AND em.start_date <= (lt.start AT TIME ZONE 'Europe/Stockholm')::date
    AND (em.end_date IS NULL OR em.end_date >= (lt.start AT TIME ZONE 'Europe/Stockholm')::date)
  ORDER BY em.start_date DESC LIMIT 1
) em ON true;

GRANT SELECT ON public.pk_logged_times_effective TO authenticated;
GRANT ALL ON public.pk_logged_times_effective TO service_role;

CREATE OR REPLACE FUNCTION public.recompute_weekly_store_report(_store_id uuid, _date date)
 RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $function$
DECLARE
  v_week_start date := date_trunc('week', _date)::date;
  v_week_end date := v_week_start + 6;
  v_iso_year integer := EXTRACT(isoyear FROM _date)::int;
  v_iso_week integer := EXTRACT(week FROM _date)::int;
  v_last_dow smallint; v_region text;
  v_total numeric(14,2) := 0; v_hours numeric(10,2) := 0; v_shifts integer := 0; v_count integer := 0;
  v_pk_hours numeric(10,2); v_pk_rows integer;
  v_expected integer; v_existing public.weekly_store_reports;
  v_closed boolean; v_should_lock boolean; v_avg numeric(14,2); v_changed boolean;
BEGIN
  SELECT s.week_last_open_dow, s.region INTO v_last_dow, v_region FROM public.stores s WHERE s.id = _store_id;
  IF v_last_dow IS NULL THEN v_last_dow := 7; END IF;
  v_expected := v_last_dow;

  SELECT EXISTS (SELECT 1 FROM public.weekly_store_report_closures c
    WHERE c.store_id = _store_id AND c.iso_year = v_iso_year AND c.iso_week = v_iso_week) INTO v_closed;

  SELECT COALESCE(SUM(COALESCE(dr.net_sales, 0)), 0), COALESCE(SUM(e.hours), 0), COALESCE(SUM(e.shifts), 0), COUNT(*)
  INTO v_total, v_hours, v_shifts, v_count
  FROM public.daily_reports dr
  LEFT JOIN LATERAL (
    SELECT COALESCE(SUM(GREATEST(0, EXTRACT(epoch FROM ((x->>'end')::time - (x->>'start')::time)) / 3600.0)), 0) AS hours,
           COUNT(*) AS shifts
    FROM jsonb_array_elements(COALESCE(dr.staff_entries, '[]'::jsonb)) AS x
    WHERE (x->>'start') IS NOT NULL AND (x->>'end') IS NOT NULL AND (x->>'start') <> '' AND (x->>'end') <> ''
  ) e ON true
  WHERE dr.store_id = _store_id AND dr.report_date BETWEEN v_week_start AND v_week_end;

  -- Personalkollens stämplade timmar (Administration fördelad) går före dagsrapportens personalrader.
  SELECT COALESCE(SUM(v.hours),0), COUNT(*) INTO v_pk_hours, v_pk_rows
  FROM public.pk_logged_times_effective v
  WHERE v.effective_store_id = _store_id AND COALESCE(v.is_canceled,false) = false
    AND v.work_date BETWEEN v_week_start AND v_week_end;
  IF v_pk_rows > 0 THEN v_hours := v_pk_hours; END IF;

  v_avg := CASE WHEN v_count > 0 THEN ROUND(v_total / v_count, 2) ELSE 0 END;

  SELECT * INTO v_existing FROM public.weekly_store_reports
  WHERE store_id = _store_id AND iso_year = v_iso_year AND iso_week = v_iso_week;

  IF v_existing.id IS NOT NULL AND v_existing.status IN ('last','stangd_denna_vecka') THEN
    v_changed := v_existing.total_sales_sek <> v_total OR v_existing.staff_hours <> v_hours
      OR v_existing.staff_shifts <> v_shifts OR v_existing.daily_reports_count <> v_count;
    IF v_changed THEN
      INSERT INTO public.weekly_report_relocks (store_id, iso_year, iso_week,
        prev_total_sales_sek, prev_staff_hours, prev_staff_shifts, prev_daily_reports_count,
        new_total_sales_sek, new_staff_hours, new_staff_shifts, new_daily_reports_count, changed_by)
      VALUES (_store_id, v_iso_year, v_iso_week,
        v_existing.total_sales_sek, v_existing.staff_hours, v_existing.staff_shifts, v_existing.daily_reports_count,
        v_total, v_hours, v_shifts, v_count, auth.uid());
    END IF;
    UPDATE public.weekly_store_reports
    SET total_sales_sek = v_total, avg_sales_per_day_sek = v_avg, staff_hours = v_hours, staff_shifts = v_shifts,
        daily_reports_count = v_count, expected_open_days = v_expected, region = v_region,
        drift_after_lock = false, drift_note = NULL,
        corrected = CASE WHEN v_changed THEN true ELSE corrected END,
        corrected_at = CASE WHEN v_changed THEN now() ELSE corrected_at END,
        relocked_at = CASE WHEN v_changed THEN now() ELSE relocked_at END,
        relock_count = CASE WHEN v_changed THEN relock_count + 1 ELSE relock_count END,
        locked_at = CASE WHEN v_changed THEN now() ELSE locked_at END,
        updated_at = now()
    WHERE id = v_existing.id;
    RETURN;
  END IF;

  v_should_lock := v_closed OR CURRENT_DATE >= (v_week_start + (v_last_dow - 1));

  INSERT INTO public.weekly_store_reports (store_id, region, iso_year, iso_week, week_start, week_end,
    daily_reports_count, expected_open_days, status, total_sales_sek, avg_sales_per_day_sek, staff_hours, staff_shifts, locked_at)
  VALUES (_store_id, v_region, v_iso_year, v_iso_week, v_week_start, v_week_end, v_count, v_expected,
    CASE WHEN v_closed THEN 'stangd_denna_vecka' WHEN v_should_lock THEN 'last' ELSE 'pagaende' END,
    v_total, v_avg, v_hours, v_shifts, CASE WHEN v_should_lock THEN now() ELSE NULL END)
  ON CONFLICT (store_id, iso_year, iso_week) DO UPDATE
  SET region = EXCLUDED.region, daily_reports_count = EXCLUDED.daily_reports_count,
      expected_open_days = EXCLUDED.expected_open_days, status = EXCLUDED.status,
      total_sales_sek = EXCLUDED.total_sales_sek, avg_sales_per_day_sek = EXCLUDED.avg_sales_per_day_sek,
      staff_hours = EXCLUDED.staff_hours, staff_shifts = EXCLUDED.staff_shifts, locked_at = EXCLUDED.locked_at,
      drift_after_lock = false, drift_note = NULL, updated_at = now();
END;
$function$;

CREATE OR REPLACE FUNCTION public.weekly_open_days_count(_from date, _to date)
RETURNS TABLE(store_id uuid, open_days integer)
LANGUAGE sql STABLE SECURITY INVOKER SET search_path TO 'public'
AS $$
  SELECT h.store_id, COUNT(*)::int
  FROM generate_series(_from, _to, interval '1 day') d
  JOIN public.store_opening_hours h ON h.weekday = extract(dow from d)::int AND COALESCE(h.closed,false) = false
  WHERE NOT EXISTS (SELECT 1 FROM public.store_closed_days c WHERE c.store_id = h.store_id AND c.date = d::date)
  GROUP BY h.store_id
$$;
GRANT EXECUTE ON FUNCTION public.weekly_open_days_count(date, date) TO authenticated;