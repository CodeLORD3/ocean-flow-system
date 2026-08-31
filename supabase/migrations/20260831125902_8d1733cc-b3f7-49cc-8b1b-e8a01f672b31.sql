CREATE TABLE public.weekly_store_report_closures (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  store_id uuid NOT NULL REFERENCES public.stores(id) ON DELETE CASCADE,
  iso_year integer NOT NULL,
  iso_week integer NOT NULL,
  reason text,
  closed_by uuid REFERENCES auth.users(id),
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT weekly_store_report_closures_week_chk CHECK (iso_week BETWEEN 1 AND 53),
  CONSTRAINT weekly_store_report_closures_year_chk CHECK (iso_year BETWEEN 2000 AND 2200),
  CONSTRAINT weekly_store_report_closures_uniq UNIQUE (store_id, iso_year, iso_week)
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.weekly_store_report_closures TO authenticated;
GRANT ALL ON public.weekly_store_report_closures TO service_role;

ALTER TABLE public.weekly_store_report_closures ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Staff can read weekly closures"
ON public.weekly_store_report_closures
FOR SELECT
TO authenticated
USING (public.is_staff() AND public.can_see_store(store_id));

CREATE POLICY "Staff can manage weekly closures"
ON public.weekly_store_report_closures
FOR ALL
TO authenticated
USING (public.is_staff() AND public.can_see_store(store_id))
WITH CHECK (public.is_staff() AND public.can_see_store(store_id));

CREATE OR REPLACE FUNCTION public.recompute_weekly_store_report(_store_id uuid, _date date)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
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

  SELECT * INTO v_existing FROM public.weekly_store_reports
  WHERE store_id = _store_id AND iso_year = v_iso_year AND iso_week = v_iso_week;

  IF v_existing.id IS NOT NULL AND v_existing.status = 'last' THEN
    IF v_existing.total_sales_sek <> v_total OR v_existing.staff_hours <> v_hours
       OR v_existing.staff_shifts <> v_shifts OR v_existing.daily_reports_count <> v_count THEN
      UPDATE public.weekly_store_reports
      SET drift_after_lock = true,
          drift_note = format('Låst: %s kr / %s h / %s pass / %s rapporter. Nu: %s kr / %s h / %s pass / %s rapporter.',
            v_existing.total_sales_sek, v_existing.staff_hours, v_existing.staff_shifts, v_existing.daily_reports_count,
            v_total, v_hours, v_shifts, v_count)
      WHERE id = v_existing.id;
    END IF;
    RETURN;
  END IF;

  IF v_existing.id IS NOT NULL AND v_existing.status = 'stangd_denna_vecka' AND NOT v_closed THEN
    NULL;
  END IF;

  v_should_lock := v_closed OR CURRENT_DATE >= (v_week_start + (v_last_dow - 1));

  INSERT INTO public.weekly_store_reports (
    store_id, region, iso_year, iso_week, week_start, week_end,
    daily_reports_count, expected_open_days, status,
    total_sales_sek, avg_sales_per_day_sek, staff_hours, staff_shifts, locked_at
  ) VALUES (
    _store_id, v_region, v_iso_year, v_iso_week, v_week_start, v_week_end,
    v_count, v_expected, CASE WHEN v_closed THEN 'stangd_denna_vecka' WHEN v_should_lock THEN 'last' ELSE 'pagaende' END,
    v_total, CASE WHEN v_count > 0 THEN ROUND(v_total / v_count, 2) ELSE 0 END,
    v_hours, v_shifts, CASE WHEN v_should_lock THEN now() ELSE NULL END
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
      locked_at = COALESCE(public.weekly_store_reports.locked_at, EXCLUDED.locked_at);
END;
$$;

CREATE OR REPLACE FUNCTION public.daily_report_touch_weekly()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  PERFORM public.recompute_weekly_store_report(NEW.store_id, NEW.report_date);
  IF TG_OP = 'UPDATE' AND (OLD.report_date <> NEW.report_date OR OLD.store_id <> NEW.store_id) THEN
    PERFORM public.recompute_weekly_store_report(OLD.store_id, OLD.report_date);
  END IF;
  RETURN NEW;
END;
$$;

CREATE OR REPLACE VIEW public.weekly_region_reports AS
WITH weeks AS (
  SELECT DISTINCT iso_year, iso_week, week_start, week_end FROM public.weekly_store_reports
), eligible_stores AS (
  SELECT s.id, s.name, s.region, s.active
  FROM public.stores s
  WHERE s.region IS NOT NULL AND s.weekly_report_enabled AND NOT s.is_wholesale
), scoped AS (
  SELECT
    es.id AS store_id, es.name AS store_name, es.region, es.active,
    w.iso_year, w.iso_week, w.week_start, w.week_end,
    COALESCE(r.daily_reports_count, 0) AS daily_reports_count,
    COALESCE(r.expected_open_days, es.id IS NOT NULL::int) AS expected_open_days,
    COALESCE(r.status, 'pagaende') AS store_status,
    COALESCE(r.total_sales_sek, 0) AS total_sales_sek,
    COALESCE(r.avg_sales_per_day_sek, 0) AS avg_sales_per_day_sek,
    COALESCE(r.staff_hours, 0) AS staff_hours,
    COALESCE(r.staff_shifts, 0) AS staff_shifts,
    r.locked_at, COALESCE(r.drift_after_lock, false) AS drift_after_lock,
    r.drift_note,
    (c.id IS NOT NULL) AS closed_this_week
  FROM weeks w
  CROSS JOIN eligible_stores es
  LEFT JOIN public.weekly_store_reports r
    ON r.store_id = es.id AND r.iso_year = w.iso_year AND r.iso_week = w.iso_week
  LEFT JOIN public.weekly_store_report_closures c
    ON c.store_id = es.id AND c.iso_year = w.iso_year AND c.iso_week = w.iso_week
), groups AS (
  SELECT region AS group_key,
    CASE region WHEN 'vast' THEN 'Göteborg' WHEN 'stockholm' THEN 'Stockholm' WHEN 'schweiz' THEN 'Schweiz' ELSE region END AS group_label,
    * FROM scoped
  UNION ALL
  SELECT 'SE_TOTAL', 'Sverige totalt', * FROM scoped WHERE region IN ('vast','stockholm')
), agg AS (
  SELECT group_key, group_label, iso_year, iso_week, MIN(week_start) AS week_start, MAX(week_end) AS week_end,
    SUM(total_sales_sek)::numeric(14,2) AS total_sales_sek,
    SUM(staff_hours)::numeric(10,2) AS staff_hours, SUM(staff_shifts)::int AS staff_shifts,
    SUM(daily_reports_count)::int AS daily_reports_count, SUM(expected_open_days)::int AS expected_open_days,
    COUNT(*) FILTER (WHERE store_status = 'pagaende' AND NOT closed_this_week AND active) AS pending_stores,
    ARRAY_REMOVE(ARRAY_AGG(store_name ORDER BY store_name) FILTER (WHERE store_status = 'pagaende' AND NOT closed_this_week AND active), NULL) AS missing_stores
  FROM groups GROUP BY group_key, group_label, iso_year, iso_week
)
SELECT a.group_key, a.group_label, a.iso_year, a.iso_week, a.week_start, a.week_end,
  a.total_sales_sek,
  CASE WHEN a.daily_reports_count > 0 THEN ROUND(a.total_sales_sek / a.daily_reports_count, 2) ELSE 0 END AS avg_sales_per_day_sek,
  a.staff_hours, a.staff_shifts, a.daily_reports_count, a.expected_open_days,
  CASE WHEN a.pending_stores = 0 THEN 'klar' ELSE 'preliminar' END AS status,
  a.missing_stores, p.total_sales_sek AS prev_total_sales_sek,
  (a.total_sales_sek - COALESCE(p.total_sales_sek, 0))::numeric(14,2) AS diff_kr,
  CASE WHEN COALESCE(p.total_sales_sek, 0) > 0 THEN ROUND((a.total_sales_sek - p.total_sales_sek) / p.total_sales_sek * 100, 1) ELSE NULL END AS diff_procent
FROM agg a
LEFT JOIN agg p ON p.group_key = a.group_key AND p.week_start = a.week_start - 7;