CREATE OR REPLACE FUNCTION public.recompute_weekly_store_report(_store_id uuid, _date date)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $fn$
DECLARE
  v_week_start date := date_trunc('week', _date)::date;
  v_week_end date := v_week_start + 6;
  v_iso_year integer := EXTRACT(isoyear FROM _date)::int;
  v_iso_week integer := EXTRACT(week FROM _date)::int;
  v_last_dow smallint;
  v_region text;
  v_total numeric(14,2) := 0;
  v_hours numeric(10,2) := 0;
  v_shifts integer := 0;
  v_count integer := 0;
  v_expected integer;
  v_existing public.weekly_store_reports;
  v_closed boolean;
  v_should_lock boolean;
  v_avg numeric(14,2);
  v_changed boolean;
BEGIN
  SELECT s.week_last_open_dow, s.region INTO v_last_dow, v_region
  FROM public.stores s WHERE s.id = _store_id;
  IF v_last_dow IS NULL THEN v_last_dow := 7; END IF;
  v_expected := v_last_dow;

  SELECT EXISTS (
    SELECT 1 FROM public.weekly_store_report_closures c
    WHERE c.store_id = _store_id AND c.iso_year = v_iso_year AND c.iso_week = v_iso_week
  ) INTO v_closed;

  SELECT
    COALESCE(SUM(COALESCE(dr.net_sales, 0)), 0),
    COALESCE(SUM(e.hours), 0),
    COALESCE(SUM(e.shifts), 0),
    COUNT(*)
  INTO v_total, v_hours, v_shifts, v_count
  FROM public.daily_reports dr
  LEFT JOIN LATERAL (
    SELECT
      COALESCE(SUM(GREATEST(0, EXTRACT(epoch FROM ((x->>'end')::time - (x->>'start')::time)) / 3600.0)), 0) AS hours,
      COUNT(*) AS shifts
    FROM jsonb_array_elements(COALESCE(dr.staff_entries, '[]'::jsonb)) AS x
    WHERE (x->>'start') IS NOT NULL AND (x->>'end') IS NOT NULL
      AND (x->>'start') <> '' AND (x->>'end') <> ''
  ) e ON true
  WHERE dr.store_id = _store_id AND dr.report_date BETWEEN v_week_start AND v_week_end;

  v_avg := CASE WHEN v_count > 0 THEN ROUND(v_total / v_count, 2) ELSE 0 END;

  SELECT * INTO v_existing FROM public.weekly_store_reports
  WHERE store_id = _store_id AND iso_year = v_iso_year AND iso_week = v_iso_week;

  IF v_existing.id IS NOT NULL AND v_existing.status IN ('last','stangd_denna_vecka') THEN
    v_changed := v_existing.total_sales_sek <> v_total
      OR v_existing.staff_hours <> v_hours
      OR v_existing.staff_shifts <> v_shifts
      OR v_existing.daily_reports_count <> v_count;

    IF v_changed THEN
      INSERT INTO public.weekly_report_relocks (
        store_id, iso_year, iso_week,
        prev_total_sales_sek, prev_staff_hours, prev_staff_shifts, prev_daily_reports_count,
        new_total_sales_sek, new_staff_hours, new_staff_shifts, new_daily_reports_count,
        changed_by
      ) VALUES (
        _store_id, v_iso_year, v_iso_week,
        v_existing.total_sales_sek, v_existing.staff_hours, v_existing.staff_shifts, v_existing.daily_reports_count,
        v_total, v_hours, v_shifts, v_count,
        auth.uid()
      );
    END IF;

    UPDATE public.weekly_store_reports
    SET total_sales_sek = v_total,
        avg_sales_per_day_sek = v_avg,
        staff_hours = v_hours,
        staff_shifts = v_shifts,
        daily_reports_count = v_count,
        expected_open_days = v_expected,
        region = v_region,
        drift_after_lock = false,
        drift_note = NULL,
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

  INSERT INTO public.weekly_store_reports (
    store_id, region, iso_year, iso_week, week_start, week_end,
    daily_reports_count, expected_open_days, status,
    total_sales_sek, avg_sales_per_day_sek, staff_hours, staff_shifts, locked_at
  ) VALUES (
    _store_id, v_region, v_iso_year, v_iso_week, v_week_start, v_week_end,
    v_count, v_expected,
    CASE WHEN v_closed THEN 'stangd_denna_vecka' WHEN v_should_lock THEN 'last' ELSE 'pagaende' END,
    v_total, v_avg, v_hours, v_shifts,
    CASE WHEN v_should_lock THEN now() ELSE NULL END
  )
  ON CONFLICT (store_id, iso_year, iso_week) DO UPDATE
  SET region = EXCLUDED.region,
      daily_reports_count = EXCLUDED.daily_reports_count,
      expected_open_days = EXCLUDED.expected_open_days,
      status = EXCLUDED.status,
      total_sales_sek = EXCLUDED.total_sales_sek,
      avg_sales_per_day_sek = EXCLUDED.avg_sales_per_day_sek,
      staff_hours = EXCLUDED.staff_hours,
      staff_shifts = EXCLUDED.staff_shifts,
      locked_at = EXCLUDED.locked_at,
      drift_after_lock = false,
      drift_note = NULL,
      updated_at = now();
END;
$fn$;

REVOKE EXECUTE ON FUNCTION public.recompute_weekly_store_report(uuid, date) FROM PUBLIC, anon, authenticated;

CREATE OR REPLACE VIEW public.monthly_store_reports
WITH (security_invoker = true) AS
WITH eligible AS (
  SELECT s.id, s.name, s.region, s.active, s.week_last_open_dow
  FROM public.stores s
  WHERE s.region IS NOT NULL AND s.weekly_report_enabled AND NOT s.is_wholesale
), months AS (
  SELECT DISTINCT date_trunc('month', dr.report_date)::date AS month_start
  FROM public.daily_reports dr
), grid AS (
  SELECT e.id AS store_id, e.name AS store_name, e.region, e.active,
         COALESCE(e.week_last_open_dow, 7)::int AS last_dow,
         m.month_start,
         (m.month_start + interval '1 month - 1 day')::date AS month_end
  FROM months m CROSS JOIN eligible e
), daily AS (
  SELECT dr.store_id,
         date_trunc('month', dr.report_date)::date AS month_start,
         COALESCE(SUM(COALESCE(dr.net_sales, 0)), 0)::numeric(14,2) AS total_sales_sek,
         COUNT(*)::int AS daily_reports_count,
         COALESCE(SUM(e.hours), 0)::numeric(10,2) AS staff_hours,
         COALESCE(SUM(e.shifts), 0)::int AS staff_shifts
  FROM public.daily_reports dr
  LEFT JOIN LATERAL (
    SELECT COALESCE(SUM(GREATEST(0, EXTRACT(epoch FROM ((x->>'end')::time - (x->>'start')::time)) / 3600.0)), 0) AS hours,
           COUNT(*) AS shifts
    FROM jsonb_array_elements(COALESCE(dr.staff_entries, '[]'::jsonb)) AS x
    WHERE (x->>'start') IS NOT NULL AND (x->>'end') IS NOT NULL
      AND (x->>'start') <> '' AND (x->>'end') <> ''
  ) e ON true
  GROUP BY dr.store_id, date_trunc('month', dr.report_date)::date
)
SELECT
  g.store_id, g.store_name, g.region, g.active,
  EXTRACT(year FROM g.month_start)::int AS year,
  EXTRACT(month FROM g.month_start)::int AS month,
  g.month_start, g.month_end,
  COALESCE(d.total_sales_sek, 0)::numeric(14,2) AS total_sales_sek,
  CASE WHEN COALESCE(d.daily_reports_count, 0) > 0
       THEN ROUND(d.total_sales_sek / d.daily_reports_count, 2)
       ELSE 0 END::numeric(14,2) AS avg_sales_per_day_sek,
  COALESCE(d.staff_hours, 0)::numeric(10,2) AS staff_hours,
  COALESCE(d.staff_shifts, 0)::int AS staff_shifts,
  COALESCE(d.daily_reports_count, 0)::int AS daily_reports_count,
  (SELECT COUNT(*)::int FROM generate_series(g.month_start, LEAST(g.month_end, CURRENT_DATE), interval '1 day') dd
   WHERE EXTRACT(isodow FROM dd)::int <= g.last_dow) AS expected_open_days,
  EXISTS (SELECT 1 FROM public.daily_report_edits ed
          WHERE ed.store_id = g.store_id AND ed.report_date BETWEEN g.month_start AND g.month_end) AS corrected,
  CASE
    WHEN g.month_end >= CURRENT_DATE THEN 'preliminar'
    WHEN COALESCE(d.daily_reports_count, 0) >= (
      SELECT COUNT(*)::int FROM generate_series(g.month_start, g.month_end, interval '1 day') dd
      WHERE EXTRACT(isodow FROM dd)::int <= g.last_dow
    ) THEN 'klar'
    ELSE 'preliminar'
  END AS status
FROM grid g
LEFT JOIN daily d ON d.store_id = g.store_id AND d.month_start = g.month_start;

GRANT SELECT ON public.monthly_store_reports TO authenticated;
GRANT SELECT ON public.monthly_store_reports TO service_role;

CREATE OR REPLACE VIEW public.monthly_region_reports
WITH (security_invoker = true) AS
WITH base AS (SELECT * FROM public.monthly_store_reports),
grouped AS (
  SELECT region AS group_key,
         CASE region WHEN 'vast' THEN 'Göteborg' WHEN 'stockholm' THEN 'Stockholm' WHEN 'schweiz' THEN 'Schweiz' ELSE region END AS group_label,
         b.*
  FROM base b
  UNION ALL
  SELECT 'SE_TOTAL', 'Sverige totalt', b.* FROM base b WHERE b.region IN ('vast', 'stockholm')
), agg AS (
  SELECT group_key, group_label, year, month, min(month_start) AS month_start, max(month_end) AS month_end,
         SUM(total_sales_sek)::numeric(14,2) AS total_sales_sek,
         SUM(staff_hours)::numeric(10,2) AS staff_hours,
         SUM(staff_shifts)::int AS staff_shifts,
         SUM(daily_reports_count)::int AS daily_reports_count,
         SUM(expected_open_days)::int AS expected_open_days,
         bool_or(corrected) AS corrected,
         count(*) FILTER (WHERE status = 'preliminar' AND active) AS pending_stores,
         array_remove(array_agg(store_name ORDER BY store_name) FILTER (WHERE status = 'preliminar' AND active), NULL) AS missing_stores
  FROM grouped
  GROUP BY group_key, group_label, year, month
)
SELECT a.group_key, a.group_label, a.year, a.month, a.month_start, a.month_end,
  a.total_sales_sek,
  CASE WHEN a.daily_reports_count > 0 THEN ROUND(a.total_sales_sek / a.daily_reports_count, 2) ELSE 0 END::numeric(14,2) AS avg_sales_per_day_sek,
  a.staff_hours, a.staff_shifts, a.daily_reports_count, a.expected_open_days, a.corrected,
  CASE WHEN a.pending_stores = 0 THEN 'klar' ELSE 'preliminar' END AS status,
  a.missing_stores,
  prev.total_sales_sek AS prev_total_sales_sek,
  (a.total_sales_sek - COALESCE(prev.total_sales_sek, 0))::numeric(14,2) AS diff_kr,
  CASE WHEN COALESCE(prev.total_sales_sek, 0) > 0
       THEN ROUND((a.total_sales_sek - prev.total_sales_sek) / prev.total_sales_sek * 100, 1)
       ELSE NULL END AS diff_procent
FROM agg a
LEFT JOIN agg prev ON prev.group_key = a.group_key AND prev.month_start = (a.month_start - interval '1 month')::date;

GRANT SELECT ON public.monthly_region_reports TO authenticated;
GRANT SELECT ON public.monthly_region_reports TO service_role;

DO $$
DECLARE r record;
BEGIN
  FOR r IN SELECT DISTINCT store_id, report_date FROM public.daily_reports LOOP
    PERFORM public.recompute_weekly_store_report(r.store_id, r.report_date);
  END LOOP;
END $$;