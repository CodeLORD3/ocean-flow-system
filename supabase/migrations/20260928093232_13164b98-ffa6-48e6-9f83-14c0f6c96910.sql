ALTER TABLE public.weekly_store_reports
  ADD COLUMN IF NOT EXISTS currency text,
  ADD COLUMN IF NOT EXISTS total_sales_sek_converted numeric(14,2);

-- Öppna dagar för en butik och period enligt öppettider och stängda dagar.
-- Saknar butiken öppettider används week_last_open_dow som tidigare.
CREATE OR REPLACE FUNCTION public.store_expected_open_days(_store_id uuid, _from date, _to date)
RETURNS integer LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO 'public'
AS $$
  SELECT CASE
    WHEN EXISTS (SELECT 1 FROM store_opening_hours h WHERE h.store_id = _store_id) THEN (
      SELECT COUNT(*)::int FROM generate_series(_from, _to, interval '1 day') d
      JOIN store_opening_hours h ON h.store_id = _store_id AND h.weekday = extract(dow from d)::int AND COALESCE(h.closed,false) = false
      WHERE NOT EXISTS (SELECT 1 FROM store_closed_days c WHERE c.store_id = _store_id AND c.date = d::date))
    ELSE (SELECT COALESCE(week_last_open_dow, 7)::int FROM stores WHERE id = _store_id)
  END
$$;

-- Växelkurs till SEK: senaste kurs på eller före datumet.
CREATE OR REPLACE FUNCTION public.fx_to_sek(_currency text, _on date)
RETURNS numeric LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO 'public'
AS $$
  SELECT CASE WHEN COALESCE(_currency,'SEK') = 'SEK' THEN 1::numeric ELSE (
    SELECT r.rate FROM fx_daily_rates r
    WHERE r.base_currency = _currency AND r.quote_currency = 'SEK' AND r.rate_date <= _on
    ORDER BY r.rate_date DESC LIMIT 1) END
$$;

CREATE OR REPLACE FUNCTION public.weekly_report_fill_currency()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $$
BEGIN
  SELECT COALESCE(s.currency,'SEK') INTO NEW.currency FROM stores s WHERE s.id = NEW.store_id;
  NEW.expected_open_days := public.store_expected_open_days(NEW.store_id, NEW.week_start, NEW.week_end);
  NEW.total_sales_sek_converted := ROUND(COALESCE(NEW.total_sales_sek,0) * public.fx_to_sek(NEW.currency, NEW.week_end), 2);
  RETURN NEW;
END $$;

DROP TRIGGER IF EXISTS trg_weekly_report_fill_currency ON public.weekly_store_reports;
CREATE TRIGGER trg_weekly_report_fill_currency
BEFORE INSERT OR UPDATE OF total_sales_sek, week_start, week_end, expected_open_days, store_id
ON public.weekly_store_reports FOR EACH ROW EXECUTE FUNCTION public.weekly_report_fill_currency();

-- Måndagslåsning 12:00 svensk tid för föregående vecka + avvikelserapport till Driftchef.
CREATE OR REPLACE FUNCTION public.lock_weekly_reports(_force boolean DEFAULT false)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $$
DECLARE
  _local timestamp := now() AT TIME ZONE 'Europe/Stockholm';
  _prev_start date := date_trunc('week', _local::date)::date - 7;
  _s record; _locked int := 0; _notified int := 0; _lines text[] := '{}'; _msg text;
BEGIN
  IF NOT _force AND (extract(isodow from _local) <> 1 OR extract(hour from _local) <> 12) THEN
    RETURN jsonb_build_object('skipped', 'inte måndag 12:00');
  END IF;

  FOR _s IN SELECT id FROM stores WHERE active LOOP
    PERFORM public.recompute_weekly_store_report(_s.id, _prev_start);
  END LOOP;

  UPDATE weekly_store_reports SET status = 'last', locked_at = COALESCE(locked_at, now()), updated_at = now()
  WHERE status NOT IN ('last','stangd_denna_vecka','klar') AND week_end < _local::date;
  GET DIAGNOSTICS _locked = ROW_COUNT;

  SELECT COALESCE(array_agg(line ORDER BY line), '{}') INTO _lines FROM (
    SELECT s.name || ': ' || concat_ws(', ',
      CASE WHEN w.daily_reports_count < w.expected_open_days
        THEN (w.expected_open_days - w.daily_reports_count) || ' dagsrapporter saknas' END,
      CASE WHEN COALESCE(w.staff_hours,0) = 0 AND w.expected_open_days > 0 THEN '0 timmar' END,
      CASE WHEN t.target_sales_ex_vat > 0 AND abs(w.total_sales_sek - t.target_sales_ex_vat) / t.target_sales_ex_vat > 0.15
        THEN round((w.total_sales_sek / t.target_sales_ex_vat - 1) * 100) || ' % mot mål' END) AS line
    FROM weekly_store_reports w
    JOIN stores s ON s.id = w.store_id AND s.active
    LEFT JOIN store_targets t ON t.store_id = w.store_id AND t.iso_year = w.iso_year AND t.iso_week = w.iso_week
    WHERE w.week_start = _prev_start AND w.status <> 'stangd_denna_vecka'
      AND (w.daily_reports_count < w.expected_open_days
        OR (COALESCE(w.staff_hours,0) = 0 AND w.expected_open_days > 0)
        OR (t.target_sales_ex_vat > 0 AND abs(w.total_sales_sek - t.target_sales_ex_vat) / t.target_sales_ex_vat > 0.15))
  ) x;

  IF array_length(_lines, 1) > 0 THEN
    _msg := 'Veckorapporter v' || extract(week FROM _prev_start) || ' låsta — avvikelser: ' || array_to_string(_lines, '; ');
    INSERT INTO notifications (portal, target_page, user_id, message, entity_type, entity_id, dedupe_key)
    SELECT 'shop', '/reports', r.user_id, _msg, 'veckorapport_avvikelse', _prev_start::text,
           'veckolasning-' || _prev_start || '-' || r.user_id
    FROM (
      SELECT DISTINCT st.user_id FROM employments em
      JOIN employees e ON e.id = em.employee_id
      JOIN staff st ON st.id = e.staff_id AND st.user_id IS NOT NULL
      WHERE (em.job_title ILIKE 'drift%' OR em.job_title ILIKE '%driftchef%')
        AND (em.end_date IS NULL OR em.end_date >= _local::date)
    ) r
    WHERE NOT EXISTS (SELECT 1 FROM notifications n WHERE n.dedupe_key = 'veckolasning-' || _prev_start || '-' || r.user_id);
    GET DIAGNOSTICS _notified = ROW_COUNT;
  END IF;

  RETURN jsonb_build_object('week_start', _prev_start, 'locked', _locked, 'deviations', coalesce(array_length(_lines,1),0), 'notified', _notified);
END $$;

REVOKE EXECUTE ON FUNCTION public.lock_weekly_reports(boolean) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.store_expected_open_days(uuid, date, date) TO authenticated;
GRANT EXECUTE ON FUNCTION public.fx_to_sek(text, date) TO authenticated;