CREATE OR REPLACE FUNCTION public.pk_own_journal(_emp uuid, _from timestamptz, _to timestamptz)
RETURNS TABLE(kind text, in_id uuid, ut_id uuid, s timestamptz, e timestamptz)
LANGUAGE sql STABLE SET search_path = public AS $$
  WITH RECURSIVE j AS (
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
    SELECT j.*, lead(type) OVER w nt, lead(at) OVER w na, lead(id) OVER w nid, lag(type) OVER w pt
    FROM j WINDOW w AS (ORDER BY at, id)
  )
  SELECT 'par', id, nid, at, na FROM o WHERE type='in' AND nt='ut'
  UNION ALL SELECT 'ensam_in', id, NULL, at, NULL FROM o WHERE type='in' AND coalesce(nt,'in') <> 'ut'
  UNION ALL SELECT 'ensam_ut', NULL, id, NULL, at FROM o WHERE type='ut' AND coalesce(pt,'ut') <> 'in'
$$;
REVOKE ALL ON FUNCTION public.pk_own_journal(uuid, timestamptz, timestamptz) FROM PUBLIC, anon;