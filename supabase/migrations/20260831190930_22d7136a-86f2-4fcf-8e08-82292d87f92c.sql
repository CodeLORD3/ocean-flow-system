CREATE OR REPLACE FUNCTION public.berakna_arbetstid(_employee_id uuid, _from date, _to date)
RETURNS TABLE(arbetsdag date, regular_minutes integer, ob_minutes jsonb, ob50_minutes integer, ob70_minutes integer, ob100_minutes integer, mertid_minutes integer, overtime_minutes integer, break_minutes integer, total_minutes integer, missing_wage_code boolean, source jsonb)
LANGUAGE plpgsql
STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  can_read boolean;
BEGIN
  IF _employee_id IS NULL OR _from IS NULL OR _to IS NULL OR _to < _from THEN
    RAISE EXCEPTION 'Ogiltigt intervall för arbetstidsberäkning';
  END IF;
  SELECT public.employee_is_self(_employee_id)
      OR public.can_see_employee(_employee_id)
      OR public.has_role(auth.uid(), 'admin')
      OR public.has_role(auth.uid(), 'company_admin')
      OR public.has_role(auth.uid(), 'platform_admin')
    INTO can_read;
  IF auth.uid() IS NOT NULL AND NOT COALESCE(can_read, false) THEN
    RAISE EXCEPTION 'Behörighet saknas för arbetstidsberäkning';
  END IF;

  RETURN QUERY
  WITH journal AS (
    SELECT te.id, te.type, te.arbetsdag,
           COALESCE(te.rounded_at, te.occurred_at) AS calc_at
    FROM public.time_entries te
    WHERE te.employee_id = _employee_id
      AND te.occurred_at >= (_from::timestamp AT TIME ZONE 'Europe/Stockholm') - interval '2 days'
      AND te.occurred_at < ((_to + 1)::timestamp AT TIME ZONE 'Europe/Stockholm') + interval '2 days'
      AND NOT EXISTS (SELECT 1 FROM public.time_entries c WHERE c.corrects_entry_id = te.id)
      AND te.correction_kind IS DISTINCT FROM 'void'
  ),
  work_ordered AS (
    SELECT j.*, lead(j.type) OVER (ORDER BY j.calc_at, j.id) AS next_type,
           lead(j.calc_at) OVER (ORDER BY j.calc_at, j.id) AS next_at
    FROM journal j WHERE j.type IN ('in', 'ut')
  ),
  raw_intervals AS (
    SELECT w.calc_at AS started_at, w.next_at AS ended_at
    FROM work_ordered w
    WHERE w.type = 'in' AND w.next_type = 'ut' AND w.next_at > w.calc_at
  ),
  break_ordered AS (
    SELECT j.*, lead(j.type) OVER (ORDER BY j.calc_at, j.id) AS next_type,
           lead(j.calc_at) OVER (ORDER BY j.calc_at, j.id) AS next_at
    FROM journal j WHERE j.type IN ('rast_start', 'rast_slut')
  ),
  break_windows AS (
    SELECT b.calc_at AS started_at, b.next_at AS ended_at
    FROM break_ordered b
    WHERE b.type = 'rast_start' AND b.next_type = 'rast_slut' AND b.next_at > b.calc_at
      AND EXISTS (SELECT 1 FROM raw_intervals ri
                   WHERE b.calc_at >= ri.started_at AND b.next_at <= ri.ended_at)
  ),
  intervals AS (
    SELECT d.day::date AS day,
           GREATEST(ri.started_at, (d.day::date::timestamp AT TIME ZONE 'Europe/Stockholm')) AS started_at,
           LEAST(ri.ended_at, (((d.day::date + 1)::timestamp) AT TIME ZONE 'Europe/Stockholm')) AS ended_at
    FROM raw_intervals ri
    CROSS JOIN LATERAL generate_series(
      public.svensk_dag(ri.started_at)::timestamp,
      public.svensk_dag(ri.ended_at - interval '1 microsecond')::timestamp,
      interval '1 day'
    ) AS d(day)
    WHERE d.day::date BETWEEN _from AND _to
  ),
  sized AS (
    SELECT i.day, i.started_at, i.ended_at,
           GREATEST(0, floor(extract(epoch FROM (i.ended_at - i.started_at)) / 60))::integer AS raw_minutes
    FROM intervals i WHERE i.ended_at > i.started_at
  ),
  minutes AS (
    SELECT s.day, s.started_at + (g.n * interval '1 minute') AS minute_at
    FROM sized s
    CROSS JOIN LATERAL generate_series(0, s.raw_minutes - 1) AS g(n)
    WHERE s.raw_minutes > 0
      AND NOT EXISTS (
        SELECT 1 FROM break_windows bw
        WHERE s.started_at + (g.n * interval '1 minute') >= bw.started_at
          AND s.started_at + (g.n * interval '1 minute') < bw.ended_at
      )
  ),
  break_totals AS (
    SELECT s.day,
           COALESCE(SUM(GREATEST(0, floor(extract(epoch FROM (
             LEAST(bw.ended_at, s.ended_at) - GREATEST(bw.started_at, s.started_at)
           )) / 60))), 0)::integer AS break_minutes
    FROM sized s
    JOIN break_windows bw ON bw.started_at < s.ended_at AND bw.ended_at > s.started_at
    GROUP BY s.day
  ),
  employee_scope AS (
    SELECT em.legal_entity_id, COALESCE(em.employment_rate, 100)::numeric AS employment_rate
    FROM public.employments em
    WHERE em.employee_id = _employee_id AND em.is_active = true
    ORDER BY em.start_date DESC NULLS LAST, em.created_at DESC
    LIMIT 1
  ),
  classified AS (
    SELECT m.day, m.minute_at,
      w.pct, w.wage_code_id,
      CASE WHEN w.pct IS NULL THEN 'regular'
           WHEN w.pct >= 100 THEN 'ob100'
           WHEN w.pct >= 70 THEN 'ob70' ELSE 'ob50' END AS bucket
    FROM minutes m
    LEFT JOIN LATERAL (
      SELECT ow.pct, ow.wage_code_id
      FROM public.ob_windows ow
      LEFT JOIN employee_scope es ON true
      WHERE ow.is_active
        AND (ow.legal_entity_id IS NULL OR ow.legal_entity_id = es.legal_entity_id)
        AND ow.valid_from <= (m.minute_at AT TIME ZONE 'Europe/Stockholm')::date
        AND (ow.valid_to IS NULL OR ow.valid_to >= (m.minute_at AT TIME ZONE 'Europe/Stockholm')::date)
        AND ow.day_kind = COALESCE(
          (SELECT ph.treated_as FROM public.payroll_holidays ph
           WHERE ph.holiday_date = (m.minute_at AT TIME ZONE 'Europe/Stockholm')::date LIMIT 1),
          CASE extract(isodow FROM (m.minute_at AT TIME ZONE 'Europe/Stockholm')::date)
            WHEN 6 THEN 'saturday' WHEN 7 THEN 'sunday' ELSE 'weekday' END)
        AND (m.minute_at AT TIME ZONE 'Europe/Stockholm')::time >= ow.start_time
        AND (ow.end_time = '24:00:00'::time OR (m.minute_at AT TIME ZONE 'Europe/Stockholm')::time < ow.end_time)
      ORDER BY ow.pct DESC, ow.sort_order, ow.id
      LIMIT 1
    ) w ON true
  ),
  daily AS (
    SELECT c.day,
      count(*) FILTER (WHERE c.bucket = 'regular')::integer AS regular_mins,
      count(*) FILTER (WHERE c.bucket = 'ob50')::integer AS ob50_mins,
      count(*) FILTER (WHERE c.bucket = 'ob70')::integer AS ob70_mins,
      count(*) FILTER (WHERE c.bucket = 'ob100')::integer AS ob100_mins,
      COALESCE((SELECT bt.break_minutes FROM break_totals bt WHERE bt.day = c.day), 0)::integer AS break_mins,
      bool_or(c.pct IS NOT NULL AND c.wage_code_id IS NULL) AS missing_wage,
      count(*)::integer AS worked_mins
    FROM classified c
    GROUP BY c.day
  ),
  weekly AS (
    SELECT d.*,
      sum(d.worked_mins) OVER (PARTITION BY date_trunc('week', d.day) ORDER BY d.day)::numeric AS week_after,
      COALESCE(sum(d.worked_mins) OVER (PARTITION BY date_trunc('week', d.day) ORDER BY d.day ROWS BETWEEN UNBOUNDED PRECEDING AND 1 PRECEDING), 0)::numeric AS week_before,
      COALESCE((SELECT es.employment_rate FROM employee_scope es), 100)::numeric AS employment_rate
    FROM daily d
  )
  SELECT w.day,
    w.regular_mins, jsonb_build_object('ob50', w.ob50_mins, 'ob70', w.ob70_mins, 'ob100', w.ob100_mins),
    w.ob50_mins, w.ob70_mins, w.ob100_mins,
    round(GREATEST(0, LEAST(w.week_after, 2400) - 2400 * w.employment_rate / 100)
      - GREATEST(0, LEAST(w.week_before, 2400) - 2400 * w.employment_rate / 100))::integer,
    round(GREATEST(0, w.week_after - 2400) - GREATEST(0, w.week_before - 2400))::integer,
    w.break_mins, w.worked_mins, COALESCE(w.missing_wage, false),
    jsonb_build_object('calculation_time', 'rounded_at när den finns, annars occurred_at',
      'employment_rate', w.employment_rate, 'week_total_minutes', w.week_after)
  FROM weekly w ORDER BY w.day;
END;
$function$;