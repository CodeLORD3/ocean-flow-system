CREATE OR REPLACE VIEW public.weekly_region_reports AS
WITH weeks AS (
  SELECT DISTINCT iso_year, iso_week, week_start, week_end FROM public.weekly_store_reports
), eligible_stores AS (
  SELECT s.id, s.name, s.region, s.active, s.week_last_open_dow
  FROM public.stores s
  WHERE s.region IS NOT NULL AND s.weekly_report_enabled AND NOT s.is_wholesale
), scoped AS (
  SELECT
    es.id AS store_id, es.name AS store_name, es.region, es.active,
    w.iso_year, w.iso_week, w.week_start, w.week_end,
    COALESCE(r.daily_reports_count, 0) AS daily_reports_count,
    COALESCE(r.expected_open_days, es.week_last_open_dow)::int AS expected_open_days,
    COALESCE(r.status, 'pagaende') AS store_status,
    COALESCE(r.total_sales_sek, 0) AS total_sales_sek,
    COALESCE(r.avg_sales_per_day_sek, 0) AS avg_sales_per_day_sek,
    COALESCE(r.staff_hours, 0) AS staff_hours,
    COALESCE(r.staff_shifts, 0) AS staff_shifts,
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

ALTER VIEW public.weekly_region_reports SET (security_invoker = on);

GRANT SELECT ON public.weekly_region_reports TO authenticated;
GRANT SELECT ON public.weekly_region_reports TO service_role;