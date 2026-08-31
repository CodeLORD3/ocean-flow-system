CREATE OR REPLACE FUNCTION public.preliminar_manadskostnad(_store_id UUID, _month DATE)
RETURNS TABLE (
  store_id UUID,
  month DATE,
  minutes INTEGER,
  lonekostnad NUMERIC,
  arbetsgivaravgift NUMERIC,
  total NUMERIC,
  ar_preliminar BOOLEAN
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  start_d DATE := date_trunc('month', _month)::date;
  end_d DATE := (date_trunc('month', _month) + interval '1 month - 1 day')::date;
BEGIN
  RETURN QUERY
  WITH rader AS (
    SELECT COALESCE(a.approved_minutes, NULLIF(a.computed->>'minutes','')::int, 0) AS min,
           COALESCE(
             em.hourly_rate,
             CASE WHEN em.monthly_salary IS NOT NULL THEN em.monthly_salary / 165.0 ELSE NULL END
           ) AS timlon,
           EXTRACT(YEAR FROM e.birth_date)::int AS birth_year
      FROM public.attestations a
      JOIN public.employees e ON e.id = a.employee_id
      LEFT JOIN LATERAL (
        SELECT emp.hourly_rate, emp.monthly_salary
          FROM public.employments emp
         WHERE emp.employee_id = a.employee_id
           AND emp.is_active
         ORDER BY emp.start_date DESC NULLS LAST
         LIMIT 1
      ) em ON true
     WHERE a.store_id = _store_id
       AND a.date BETWEEN start_d AND end_d
  ), berakn AS (
    SELECT min,
           min * COALESCE(timlon, 0) / 60.0 AS lon,
           CASE
             WHEN birth_year IS NULL THEN 0.3142
             WHEN (EXTRACT(YEAR FROM start_d)::int - birth_year) BETWEEN 15 AND 18 THEN 0.0
             WHEN (EXTRACT(YEAR FROM start_d)::int - birth_year) < 23 THEN 0.1949
             ELSE 0.3142
           END AS avgift
      FROM rader
  )
  SELECT _store_id,
         start_d,
         COALESCE(SUM(min), 0)::int,
         ROUND(COALESCE(SUM(lon), 0), 2),
         ROUND(COALESCE(SUM(lon * avgift), 0), 2),
         ROUND(COALESCE(SUM(lon * (1 + avgift)), 0), 2),
         true
    FROM berakn;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.preliminar_manadskostnad(UUID, DATE) FROM anon;
REVOKE EXECUTE ON FUNCTION public.absence_generate_days(UUID) FROM anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.absence_requests_sync_days() FROM anon, authenticated;