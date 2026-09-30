CREATE OR REPLACE FUNCTION public.pk_own_journal(_emp uuid, _from timestamptz, _to timestamptz)
RETURNS TABLE(kind text, in_id uuid, ut_id uuid, s timestamptz, e timestamptz)
LANGUAGE sql STABLE SET search_path = public AS $$
  WITH j AS (
    SELECT te.id, te.type, coalesce(te.rounded_at, te.occurred_at) at
    FROM time_entries te
    WHERE te.employee_id = _emp AND te.type IN ('in','ut')
      AND te.occurred_at BETWEEN _from AND _to
      AND te.correction_kind IS DISTINCT FROM 'void'
      AND NOT EXISTS (SELECT 1 FROM time_entries c WHERE c.corrects_entry_id = te.id)
      AND te.source <> 'personalkollen' AND coalesce(te.note,'') NOT LIKE 'PK-import%'
      AND NOT EXISTS (
        WITH RECURSIVE chain AS (
          SELECT te.id, te.corrects_entry_id, te.note
          UNION ALL
          SELECT p.id, p.corrects_entry_id, p.note FROM time_entries p JOIN chain ch ON p.id = ch.corrects_entry_id
        ) SELECT 1 FROM chain WHERE coalesce(chain.note,'') LIKE 'Automatiskt avslutad efter 12 timmar%')
  ), o AS (
    SELECT j.*, lead(type) OVER w nt, lead(at) OVER w na, lead(id) OVER w nid, lag(type) OVER w pt, lag(at) OVER w pa
    FROM j WINDOW w AS (ORDER BY at, id)
  )
  SELECT 'par', id, nid, at, na FROM o WHERE type='in' AND nt='ut' AND na - at <= interval '16 hours'
  UNION ALL SELECT 'ensam_in', id, NULL, at, NULL FROM o WHERE type='in' AND NOT (coalesce(nt,'in') = 'ut' AND na - at <= interval '16 hours')
  UNION ALL SELECT 'ensam_ut', NULL, id, NULL, at FROM o WHERE type='ut' AND NOT (coalesce(pt,'ut') = 'in' AND at - pa <= interval '16 hours')
$$;
REVOKE ALL ON FUNCTION public.pk_own_journal(uuid, timestamptz, timestamptz) FROM PUBLIC, anon;

CREATE OR REPLACE FUNCTION public.pk_neutralize_lone_inside()
RETURNS integer LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE n int;
BEGIN
  WITH lone AS (
    SELECT DISTINCT coalesce(o.in_id, o.ut_id) id, i.employee_id, i.work_date, coalesce(o.s, o.e) at
    FROM pk_time_imports i
    CROSS JOIN LATERAL pk_own_journal(i.employee_id, i.imported_start - interval '1 day', i.imported_stop + interval '1 day') o
    WHERE i.status = 'importerad' AND i.imported_stop IS NOT NULL AND o.kind <> 'par'
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