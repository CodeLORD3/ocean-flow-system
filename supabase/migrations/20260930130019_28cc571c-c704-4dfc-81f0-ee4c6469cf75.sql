CREATE OR REPLACE FUNCTION public.pk_reconcile_check(_ts timestamptz DEFAULT now())
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
#variable_conflict use_column
DECLARE d jsonb; v_n int; v_today date := (now() AT TIME ZONE 'Europe/Stockholm')::date;
BEGIN
  WITH pk AS (
    SELECT l.id, coalesce(l.real_start,l.start) s, coalesce(l.real_stop,l.stop) e
    FROM pk_logged_times l
    WHERE NOT l.is_canceled AND l.start >= '2026-09-15 22:00+00' AND (l.start AT TIME ZONE 'Europe/Stockholm')::date < v_today
  ), a AS (
    SELECT 'ej_forklarad' typ, count(*) n, jsonb_agg(jsonb_build_object('pass', pk.id, 'dag', (pk.s AT TIME ZONE 'Europe/Stockholm')::date, 'status', i.status)) x
    FROM pk LEFT JOIN pk_time_imports i ON i.pk_logged_time_id = pk.id
    WHERE i.pk_logged_time_id IS NULL OR i.status IN ('fel','ej_mappad','avbokad')
       OR (i.status IN ('importerad','saknar_utstampling') AND (i.imported_start IS DISTINCT FROM pk.s OR i.imported_stop IS DISTINCT FROM pk.e))
  ), b AS (
    SELECT 'status_over_24h' typ, count(*) n, jsonb_agg(jsonb_build_object('pass', pk_logged_time_id, 'dag', work_date, 'status', status)) x
    FROM pk_time_imports WHERE status IN ('konflikt','saknar_utstampling','ej_kopplad','vantar_attest') AND created_at < _ts - interval '24 hours'
  ), c AS (
    SELECT 'clock_sync_fel_over_24h' typ, count(*) n, jsonb_agg(jsonb_build_object('id', id, 'tid', occurred_at)) x
    FROM clock_sync_failures WHERE status = 'open' AND created_at < _ts - interval '24 hours'
  ), eff AS (
    SELECT t.* FROM time_entries t JOIN employees e ON e.id = t.employee_id AND NOT coalesce(e.is_test,false)
    WHERE t.occurred_at >= '2026-09-15 22:00+00' AND t.correction_kind IS DISTINCT FROM 'void'
      AND NOT EXISTS (SELECT 1 FROM time_entries c2 WHERE c2.corrects_entry_id = t.id)
  ), dd AS (
    SELECT 'fel_arbetsstalle' typ, count(*) n, jsonb_agg(jsonb_build_object('post', eff.id, 'tid', eff.occurred_at, 'arbetsstalle', w.name)) x
    FROM eff JOIN work_sites w ON w.id = eff.work_site_id
    WHERE NOT w.is_active OR (w.legal_entity_id = 'de-no1' AND w.name ILIKE 'Administration%')
  ), ee AS (
    SELECT 'in_utan_ut_over_16h' typ, count(*) n, jsonb_agg(jsonb_build_object('anstalld', q.employee_id, 'in', q.occurred_at)) x
    FROM (SELECT DISTINCT ON (employee_id) employee_id, type, occurred_at FROM eff WHERE type IN ('in','ut')
          ORDER BY employee_id, occurred_at DESC, id DESC) q
    WHERE q.type = 'in' AND q.occurred_at < _ts - interval '16 hours'
  )
  SELECT jsonb_object_agg(typ, jsonb_build_object('antal', n, 'rader', coalesce(x, '[]'::jsonb))), sum(n)::int INTO d, v_n
  FROM (SELECT * FROM a UNION ALL SELECT * FROM b UNION ALL SELECT * FROM c UNION ALL SELECT * FROM dd UNION ALL SELECT * FROM ee) z;
  INSERT INTO system_checks(run_at, check_name, status, count, details)
  VALUES (_ts, 'pk_klocka_avstamning', CASE WHEN v_n = 0 THEN 'ok' ELSE 'fel' END, v_n, d);
  RETURN jsonb_build_object('antal', v_n, 'detaljer', d);
END $$;
REVOKE ALL ON FUNCTION public.pk_reconcile_check(timestamptz) FROM PUBLIC, anon, authenticated;