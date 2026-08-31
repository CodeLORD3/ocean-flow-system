-- 1. Audit trail för dagsrapporter
CREATE TABLE IF NOT EXISTS public.daily_report_edits (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  report_id uuid NOT NULL REFERENCES public.daily_reports(id) ON DELETE CASCADE,
  store_id uuid NOT NULL,
  report_date date NOT NULL,
  field text NOT NULL,
  old_value text,
  new_value text,
  changed_by uuid,
  changed_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT ON public.daily_report_edits TO authenticated;
GRANT ALL ON public.daily_report_edits TO service_role;
ALTER TABLE public.daily_report_edits ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Staff can read edits for visible stores"
ON public.daily_report_edits FOR SELECT TO authenticated
USING (public.is_staff() AND public.can_see_store(store_id));

CREATE INDEX IF NOT EXISTS daily_report_edits_report_idx ON public.daily_report_edits(report_id);
CREATE INDEX IF NOT EXISTS daily_report_edits_date_idx ON public.daily_report_edits(store_id, report_date);

-- 2. Admin-gate för efterhandsredigering
CREATE OR REPLACE FUNCTION public.can_edit_daily_report_admin()
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT public.has_role(auth.uid(), 'admin')
     OR public.is_platform_admin(auth.uid())
     OR EXISTS (
       SELECT 1 FROM public.user_scopes us
       WHERE us.user_id = auth.uid() AND us.scope_type = 'portal' AND us.scope_value = 'admin'
     )
$$;

DROP POLICY IF EXISTS "Authenticated can manage daily reports" ON public.daily_reports;

CREATE POLICY "Staff can read daily reports"
ON public.daily_reports FOR SELECT TO authenticated
USING (public.is_staff() AND public.can_see_store(store_id));

CREATE POLICY "Staff can create daily reports"
ON public.daily_reports FOR INSERT TO authenticated
WITH CHECK (public.is_staff() AND public.can_see_store(store_id));

CREATE POLICY "Staff can edit recent, admin can edit all"
ON public.daily_reports FOR UPDATE TO authenticated
USING (
  public.is_staff() AND public.can_see_store(store_id)
  AND (report_date >= CURRENT_DATE - 1 OR public.can_edit_daily_report_admin())
)
WITH CHECK (
  public.is_staff() AND public.can_see_store(store_id)
  AND (report_date >= CURRENT_DATE - 1 OR public.can_edit_daily_report_admin())
);

CREATE POLICY "Admins can delete daily reports"
ON public.daily_reports FOR DELETE TO authenticated
USING (public.is_staff() AND public.can_see_store(store_id) AND public.can_edit_daily_report_admin());

-- 3. Logga ändringar
CREATE OR REPLACE FUNCTION public.log_daily_report_edit()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_actor uuid := auth.uid();
BEGIN
  IF NEW.gross_sales IS DISTINCT FROM OLD.gross_sales THEN
    INSERT INTO public.daily_report_edits(report_id, store_id, report_date, field, old_value, new_value, changed_by)
    VALUES (NEW.id, NEW.store_id, NEW.report_date, 'gross_sales', OLD.gross_sales::text, NEW.gross_sales::text, v_actor);
  END IF;
  IF NEW.net_sales IS DISTINCT FROM OLD.net_sales THEN
    INSERT INTO public.daily_report_edits(report_id, store_id, report_date, field, old_value, new_value, changed_by)
    VALUES (NEW.id, NEW.store_id, NEW.report_date, 'net_sales', OLD.net_sales::text, NEW.net_sales::text, v_actor);
  END IF;
  IF NEW.receipt_count IS DISTINCT FROM OLD.receipt_count THEN
    INSERT INTO public.daily_report_edits(report_id, store_id, report_date, field, old_value, new_value, changed_by)
    VALUES (NEW.id, NEW.store_id, NEW.report_date, 'receipt_count', OLD.receipt_count::text, NEW.receipt_count::text, v_actor);
  END IF;
  IF NEW.largest_sale IS DISTINCT FROM OLD.largest_sale THEN
    INSERT INTO public.daily_report_edits(report_id, store_id, report_date, field, old_value, new_value, changed_by)
    VALUES (NEW.id, NEW.store_id, NEW.report_date, 'largest_sale', OLD.largest_sale::text, NEW.largest_sale::text, v_actor);
  END IF;
  IF COALESCE(NEW.staff_entries, '[]'::jsonb) IS DISTINCT FROM COALESCE(OLD.staff_entries, '[]'::jsonb) THEN
    INSERT INTO public.daily_report_edits(report_id, store_id, report_date, field, old_value, new_value, changed_by)
    VALUES (NEW.id, NEW.store_id, NEW.report_date, 'staff_entries', COALESCE(OLD.staff_entries, '[]'::jsonb)::text, COALESCE(NEW.staff_entries, '[]'::jsonb)::text, v_actor);
  END IF;
  IF COALESCE(NEW.waste_items, '[]'::jsonb) IS DISTINCT FROM COALESCE(OLD.waste_items, '[]'::jsonb) THEN
    INSERT INTO public.daily_report_edits(report_id, store_id, report_date, field, old_value, new_value, changed_by)
    VALUES (NEW.id, NEW.store_id, NEW.report_date, 'waste_items', COALESCE(OLD.waste_items, '[]'::jsonb)::text, COALESCE(NEW.waste_items, '[]'::jsonb)::text, v_actor);
  END IF;
  IF NEW.staff_notes IS DISTINCT FROM OLD.staff_notes THEN
    INSERT INTO public.daily_report_edits(report_id, store_id, report_date, field, old_value, new_value, changed_by)
    VALUES (NEW.id, NEW.store_id, NEW.report_date, 'staff_notes', OLD.staff_notes, NEW.staff_notes, v_actor);
  END IF;
  IF NEW.comment IS DISTINCT FROM OLD.comment THEN
    INSERT INTO public.daily_report_edits(report_id, store_id, report_date, field, old_value, new_value, changed_by)
    VALUES (NEW.id, NEW.store_id, NEW.report_date, 'comment', OLD.comment, NEW.comment, v_actor);
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_log_daily_report_edit ON public.daily_reports;
CREATE TRIGGER trg_log_daily_report_edit
AFTER UPDATE ON public.daily_reports
FOR EACH ROW EXECUTE FUNCTION public.log_daily_report_edit();

-- 4. "Korrigerad" på veckorapporten
ALTER TABLE public.weekly_store_reports
  ADD COLUMN IF NOT EXISTS corrected boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS corrected_at timestamptz;

CREATE OR REPLACE FUNCTION public.refresh_weekly_corrected_flag(_store_id uuid, _date date)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_week_start date := date_trunc('week', _date)::date;
  v_corrected boolean;
BEGIN
  SELECT EXISTS (
    SELECT 1 FROM public.daily_report_edits e
    WHERE e.store_id = _store_id AND e.report_date BETWEEN v_week_start AND v_week_start + 6
  ) INTO v_corrected;

  UPDATE public.weekly_store_reports
  SET corrected = v_corrected,
      corrected_at = CASE WHEN v_corrected THEN now() ELSE NULL END,
      updated_at = now()
  WHERE store_id = _store_id
    AND iso_year = EXTRACT(isoyear FROM _date)::int
    AND iso_week = EXTRACT(week FROM _date)::int;
END;
$$;

CREATE OR REPLACE FUNCTION public.trg_mark_week_corrected()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  PERFORM public.recompute_weekly_store_report(NEW.store_id, NEW.report_date);
  PERFORM public.refresh_weekly_corrected_flag(NEW.store_id, NEW.report_date);
  RETURN NULL;
END;
$$;

DROP TRIGGER IF EXISTS trg_edit_marks_week_corrected ON public.daily_report_edits;
CREATE TRIGGER trg_edit_marks_week_corrected
AFTER INSERT ON public.daily_report_edits
FOR EACH ROW EXECUTE FUNCTION public.trg_mark_week_corrected();

-- Backfyll flaggan för befintliga veckor
UPDATE public.weekly_store_reports w
SET corrected = true, corrected_at = now()
WHERE EXISTS (
  SELECT 1 FROM public.daily_report_edits e
  WHERE e.store_id = w.store_id AND e.report_date BETWEEN w.week_start AND w.week_end
);

-- 5. Månadsrapporter per butik
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
         COALESCE(SUM(COALESCE(dr.gross_sales, 0)), 0)::numeric(14,2) AS total_sales_sek,
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
  g.store_id,
  g.store_name,
  g.region,
  g.active,
  EXTRACT(year FROM g.month_start)::int AS year,
  EXTRACT(month FROM g.month_start)::int AS month,
  g.month_start,
  g.month_end,
  COALESCE(d.total_sales_sek, 0)::numeric(14,2) AS total_sales_sek,
  CASE WHEN COALESCE(d.daily_reports_count, 0) > 0
       THEN ROUND(d.total_sales_sek / d.daily_reports_count, 2)
       ELSE 0 END::numeric(14,2) AS avg_sales_per_day_sek,
  COALESCE(d.staff_hours, 0)::numeric(10,2) AS staff_hours,
  COALESCE(d.staff_shifts, 0)::int AS staff_shifts,
  COALESCE(d.daily_reports_count, 0)::int AS daily_reports_count,
  (
    SELECT COUNT(*)::int FROM generate_series(g.month_start, LEAST(g.month_end, CURRENT_DATE), interval '1 day') dd
    WHERE EXTRACT(isodow FROM dd)::int <= g.last_dow
  ) AS expected_open_days,
  EXISTS (
    SELECT 1 FROM public.daily_report_edits ed
    WHERE ed.store_id = g.store_id AND ed.report_date BETWEEN g.month_start AND g.month_end
  ) AS corrected,
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

-- 6. Månadsrapporter per region och Sverige totalt
CREATE OR REPLACE VIEW public.monthly_region_reports
WITH (security_invoker = true) AS
WITH base AS (
  SELECT * FROM public.monthly_store_reports
), grouped AS (
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