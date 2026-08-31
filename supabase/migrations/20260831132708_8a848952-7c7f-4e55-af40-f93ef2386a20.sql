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
  v_drift boolean;
  v_note text;
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
    COALESCE(SUM(COALESCE(dr.gross_sales, 0)), 0),
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

  IF v_existing.id IS NOT NULL AND v_existing.status = 'last' THEN
    v_drift := v_existing.drift_after_lock;
    v_note := v_existing.drift_note;
    IF v_existing.total_sales_sek <> v_total OR v_existing.staff_hours <> v_hours
       OR v_existing.staff_shifts <> v_shifts OR v_existing.daily_reports_count <> v_count THEN
      v_drift := true;
      v_note := format('Ändrad efter låsning. Tidigare: %s kr / %s h / %s pass / %s rapporter. Nu: %s kr / %s h / %s pass / %s rapporter.',
        v_existing.total_sales_sek, v_existing.staff_hours, v_existing.staff_shifts, v_existing.daily_reports_count,
        v_total, v_hours, v_shifts, v_count);
    END IF;
    UPDATE public.weekly_store_reports
    SET total_sales_sek = v_total,
        avg_sales_per_day_sek = v_avg,
        staff_hours = v_hours,
        staff_shifts = v_shifts,
        daily_reports_count = v_count,
        expected_open_days = v_expected,
        region = v_region,
        drift_after_lock = v_drift,
        drift_note = v_note,
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
      updated_at = now();
END;
$fn$;

REVOKE EXECUTE ON FUNCTION public.recompute_weekly_store_report(uuid, date) FROM PUBLIC, anon, authenticated;