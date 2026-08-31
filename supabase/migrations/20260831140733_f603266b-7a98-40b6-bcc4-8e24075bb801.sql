-- 1) Historik för omlåsningar
CREATE TABLE IF NOT EXISTS public.weekly_report_relocks (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  store_id uuid NOT NULL REFERENCES public.stores(id) ON DELETE CASCADE,
  iso_year integer NOT NULL,
  iso_week integer NOT NULL,
  prev_total_sales_sek numeric(14,2),
  prev_staff_hours numeric(10,2),
  prev_staff_shifts integer,
  prev_daily_reports_count integer,
  new_total_sales_sek numeric(14,2),
  new_staff_hours numeric(10,2),
  new_staff_shifts integer,
  new_daily_reports_count integer,
  changed_by uuid,
  created_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT ON public.weekly_report_relocks TO authenticated;
GRANT ALL ON public.weekly_report_relocks TO service_role;
ALTER TABLE public.weekly_report_relocks ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Staff can read weekly relocks" ON public.weekly_report_relocks;
CREATE POLICY "Staff can read weekly relocks"
ON public.weekly_report_relocks FOR SELECT TO authenticated
USING (public.is_staff() AND public.can_see_store(store_id));

CREATE INDEX IF NOT EXISTS weekly_report_relocks_week_idx
  ON public.weekly_report_relocks (store_id, iso_year, iso_week);

-- 2) Spårbarhet på veckoraden
ALTER TABLE public.weekly_store_reports
  ADD COLUMN IF NOT EXISTS relocked_at timestamptz,
  ADD COLUMN IF NOT EXISTS relock_count integer NOT NULL DEFAULT 0;

-- 3) Räkna om även låsta veckor: lås upp -> uppdatera -> lås igen
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

  -- Redan låst (eller stängd) vecka: lås upp, skriv nya sanningen, lås igen.
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

-- 4) Trigger: hantera även borttagna dagsrapporter
CREATE OR REPLACE FUNCTION public.daily_report_touch_weekly()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF TG_OP = 'DELETE' THEN
    PERFORM public.recompute_weekly_store_report(OLD.store_id, OLD.report_date);
    RETURN OLD;
  END IF;

  PERFORM public.recompute_weekly_store_report(NEW.store_id, NEW.report_date);
  IF TG_OP = 'UPDATE' AND (OLD.report_date <> NEW.report_date OR OLD.store_id <> NEW.store_id) THEN
    PERFORM public.recompute_weekly_store_report(OLD.store_id, OLD.report_date);
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_daily_reports_weekly ON public.daily_reports;
CREATE TRIGGER trg_daily_reports_weekly
AFTER INSERT OR UPDATE OR DELETE ON public.daily_reports
FOR EACH ROW EXECUTE FUNCTION public.daily_report_touch_weekly();

-- 5) Backfill: räkna om alla veckor så gamla låsta felvärden rättas
DO $$
DECLARE r record;
BEGIN
  FOR r IN
    SELECT DISTINCT store_id, date_trunc('week', report_date)::date AS wk
    FROM public.daily_reports
  LOOP
    PERFORM public.recompute_weekly_store_report(r.store_id, r.wk);
  END LOOP;
END $$;

UPDATE public.weekly_store_reports
SET drift_after_lock = false, drift_note = NULL
WHERE drift_after_lock;