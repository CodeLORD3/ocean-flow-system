CREATE OR REPLACE FUNCTION public.pk_neutralize_lone_inside()
RETURNS integer LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE n int;
BEGIN
  WITH lone AS (
    SELECT DISTINCT coalesce(o.in_id, o.ut_id) id
    FROM pk_time_imports i
    CROSS JOIN LATERAL pk_own_journal(i.employee_id, i.imported_start - interval '1 day', i.imported_stop + interval '1 day') o
    WHERE i.status = 'importerad' AND i.imported_stop IS NOT NULL AND o.kind <> 'par'
      AND i.work_date < (now() AT TIME ZONE 'Europe/Stockholm')::date
      AND coalesce(o.s, o.e) BETWEEN i.imported_start AND i.imported_stop
  ), ins AS (
    INSERT INTO time_entries (employee_id, store_id, work_site_id, cost_center, type, occurred_at, registered_at, source, correction_kind, corrects_entry_id, note)
    SELECT t.employee_id, t.store_id, t.work_site_id, t.cost_center, t.type, t.occurred_at, now(), 'correction', 'void', t.id,
           'PK-import: ensam egen stämpling inom importerat PK-pass neutraliserad – granska i attesten'
    FROM lone l JOIN time_entries t ON t.id = l.id
    RETURNING employee_id, (occurred_at AT TIME ZONE 'Europe/Stockholm') ts, type
  ), fl AS (
    INSERT INTO employee_day_flags (employee_id, date, comment)
    SELECT employee_id, ts::date, 'PK-import: ensam egen ' || type || '-stämpling kl ' || to_char(ts, 'HH24:MI') ||
           ' låg inom PK-passet och neutraliserades (rättelse, inget raderat) – granska i attesten' FROM ins
    RETURNING 1
  )
  SELECT count(*) INTO n FROM ins;
  RETURN n;
END $$;
REVOKE ALL ON FUNCTION public.pk_neutralize_lone_inside() FROM PUBLIC, anon, authenticated;