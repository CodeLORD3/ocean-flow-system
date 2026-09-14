CREATE OR REPLACE FUNCTION public.payroll_basis_period(_legal_entity_id text, _period text)
 RETURNS TABLE(employee_id uuid, employment_id uuid, full_name text, employment_number text, pay_type text, form text, store_name text, period_start date, period_end date, worked_hours numeric, ob50_hours numeric, ob70_hours numeric, ob100_hours numeric, mertid_hours numeric, overtime_hours numeric, absence_days numeric, absence_hours numeric, unattested_days integer)
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  WITH b AS (
    SELECT public.payroll_period_start(_period) AS f, public.payroll_period_end(_period) AS t
  ),
  emp AS (
    SELECT em.id AS employment_id, em.employee_id, em.employment_number, em.pay_type, em.form,
           em.ob_50, em.ob_70, em.ob_100,
           trim(coalesce(e.first_name,'') || ' ' || coalesce(e.last_name,'')) AS full_name,
           s.name AS store_name
    FROM public.employments em
    JOIN public.employees e ON e.id = em.employee_id
    LEFT JOIN public.stores s ON s.id = em.store_id
    CROSS JOIN b
    WHERE public.is_staff()
      AND public.can_see_company(_legal_entity_id)
      AND em.legal_entity_id = _legal_entity_id
      AND coalesce(e.is_test, false) = false
      AND em.start_date <= b.t
      AND (em.end_date IS NULL OR em.end_date >= b.f)
  ),
  att AS (
    SELECT a.employee_id,
           sum(coalesce(a.approved_minutes, 0)) FILTER (WHERE a.status = 'approved')::numeric AS approved_minutes,
           count(*) FILTER (WHERE a.status <> 'approved')::int AS unattested
    FROM public.attestations a CROSS JOIN b
    WHERE a.legal_entity_id = _legal_entity_id AND a.date BETWEEN b.f AND b.t
    GROUP BY a.employee_id
  ),
  ob AS (
    SELECT emp.employee_id,
           sum(d.ob50_minutes)::numeric AS ob50,
           sum(d.ob70_minutes)::numeric AS ob70,
           sum(d.ob100_minutes)::numeric AS ob100,
           sum(d.mertid_minutes)::numeric AS mertid,
           sum(d.overtime_minutes)::numeric AS overtime
    FROM emp CROSS JOIN b
    CROSS JOIN LATERAL public.berakna_arbetstid(emp.employee_id, b.f, b.t) d
    GROUP BY emp.employee_id
  ),
  abs AS (
    SELECT ad.employee_id, count(*)::numeric AS dagar, sum(coalesce(ad.hours,0))::numeric AS timmar
    FROM public.absence_days ad CROSS JOIN b
    WHERE ad.date BETWEEN b.f AND b.t
    GROUP BY ad.employee_id
  )
  SELECT emp.employee_id, emp.employment_id, emp.full_name, emp.employment_number,
         emp.pay_type, emp.form, emp.store_name,
         b.f, b.t,
         -- Lönekörningen får bara räkna attesterad tid.
         round(coalesce(att.approved_minutes, 0) / 60.0, 2),
         -- OB läses per anställning, aldrig bolagsdefault.
         round(CASE WHEN emp.ob_50 THEN coalesce(ob.ob50, 0) ELSE 0 END / 60.0, 2),
         round(CASE WHEN emp.ob_70 THEN coalesce(ob.ob70, 0) ELSE 0 END / 60.0, 2),
         round(CASE WHEN emp.ob_100 THEN coalesce(ob.ob100, 0) ELSE 0 END / 60.0, 2),
         round(coalesce(ob.mertid, 0) / 60.0, 2),
         round(coalesce(ob.overtime, 0) / 60.0, 2),
         coalesce(abs.dagar, 0),
         round(coalesce(abs.timmar, 0), 2),
         coalesce(att.unattested, 0)
  FROM emp
  CROSS JOIN b
  LEFT JOIN att ON att.employee_id = emp.employee_id
  LEFT JOIN ob ON ob.employee_id = emp.employee_id
  LEFT JOIN abs ON abs.employee_id = emp.employee_id
  ORDER BY emp.full_name;
$function$;