CREATE OR REPLACE FUNCTION public.berakna_arbetstid_rad(_employee_id uuid, _from date, _to date, _attesterat boolean)
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
           CASE WHEN te.type = 'in' AND fr.start_time IS NOT NULL
                 AND te.id = (SELECT t2.id FROM public.time_entries t2
                               WHERE t2.employee_id = te.employee_id AND t2.type = 'in'
                                 AND COALESCE(t2.arbetsdag, public.svensk_dag(t2.occurred_at)) = COALESCE(te.arbetsdag, public.svensk_dag(te.occurred_at))
                                 AND NOT EXISTS (SELECT 1 FROM public.time_entries c2 WHERE c2.corrects_entry_id = t2.id)
                                 AND t2.correction_kind IS DISTINCT FROM 'void'
                               ORDER BY t2.occurred_at, t2.id LIMIT 1)
                THEN (COALESCE(te.arbetsdag, public.svensk_dag(te.occurred_at)) + fr.start_time) AT TIME ZONE 'Europe/Stockholm'
                ELSE COALESCE(te.rounded_at, te.occurred_at) END AS calc_at
    FROM public.time_entries te
    LEFT JOIN LATERAL (
      SELECT r.start_time FROM public.employee_fixed_start_rules r
       WHERE r.employee_id = te.employee_id AND r.active
         AND COALESCE(te.arbetsdag, public.svensk_dag(te.occurred_at)) >= r.valid_from
         AND (r.valid_to IS NULL OR COALESCE(te.arbetsdag, public.svensk_dag(te.occurred_at)) <= r.valid_to)
         AND extract(isodow FROM COALESCE(te.arbetsdag, public.svensk_dag(te.occurred_at)))::int = ANY (r.weekdays)
       ORDER BY r.valid_from DESC LIMIT 1
    ) fr ON true
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
  day_intervals AS (
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
  -- Attesterat fönster: tid utanför schemat räknas först när avvikelsen är godkänd.
  intervals AS (
    SELECT di.day,
           CASE WHEN _attesterat AND aw.win_in IS NOT NULL THEN GREATEST(di.started_at, aw.win_in) ELSE di.started_at END AS started_at,
           CASE WHEN _attesterat AND aw.win_out IS NOT NULL THEN LEAST(di.ended_at, aw.win_out) ELSE di.ended_at END AS ended_at
    FROM day_intervals di
    LEFT JOIN LATERAL (
      SELECT min(a.payroll_in) AS win_in, max(a.payroll_out) AS win_out
      FROM public.attestations a
      WHERE a.employee_id = _employee_id AND a.date = di.day
        AND a.status <> 'rejected' AND a.payroll_in IS NOT NULL AND a.payroll_out IS NOT NULL
    ) aw ON true
  ),
  sized AS (
    SELECT i.day, i.started_at, i.ended_at,
           GREATEST(0, floor(extract(epoch FROM (i.ended_at - i.started_at)) / 60))::integer AS raw_minutes
    FROM intervals i WHERE i.ended_at > i.started_at
  ),
  minutes_stamped AS (
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
  -- Schematid som chefen valt att betala (sen in, tidig ut, missat pass) läggs in som minuter
  -- på schemats klockslag, så att OB och mertid följer den betalda tiden. Schemalagd rast
  -- (skillnaden mellan passets längd och delens minuter) tas bort mitt i delen.
  best_att AS (
    SELECT DISTINCT ON (a.date) a.date, a.status, a.basis, a.computed, a.part_decisions
    FROM public.attestations a
    WHERE _attesterat AND a.employee_id = _employee_id AND a.date BETWEEN _from AND _to
      AND a.status IN ('approved', 'auto_approved', 'flagged')
      AND (a.computed->>'model') = 'delar'
    ORDER BY a.date, (a.status = 'approved') DESC, (a.shift_id IS NOT NULL) DESC, a.approved_minutes DESC NULLS LAST, a.id
  ),
  recovered_parts AS (
    SELECT ba.date AS day, (p.value->>'minutes')::integer AS mins,
           CASE p.value->>'kind' WHEN 'tidig_ut' THEN (p.value->>'stamp')::timestamptz ELSE (p.value->>'sched')::timestamptz END AS s_from,
           CASE p.value->>'kind' WHEN 'sen_in' THEN (p.value->>'stamp')::timestamptz
                                 WHEN 'tidig_ut' THEN (p.value->>'sched')::timestamptz
                                 ELSE (p.value->>'sched_end')::timestamptz END AS s_to
    FROM best_att ba
    CROSS JOIN LATERAL jsonb_array_elements(COALESCE(ba.computed->'parts', '[]'::jsonb)) p
    WHERE p.value->>'kind' IN ('sen_in', 'tidig_ut', 'missat_pass')
      AND CASE WHEN ba.status = 'approved' AND ba.basis = 'schema' THEN true
               WHEN ba.status = 'approved' AND ba.basis IS DISTINCT FROM 'avvikelse' THEN false
               ELSE (ba.part_decisions->(p.value->>'kind')->>'decision') = 'schema' END
  ),
  recovered_minutes AS (
    SELECT rp.day, rp.s_from + (g.n * interval '1 minute') AS minute_at
    FROM recovered_parts rp
    CROSS JOIN LATERAL (SELECT GREATEST(0, floor(extract(epoch FROM (rp.s_to - rp.s_from)) / 60))::integer AS l) ll
    CROSS JOIN LATERAL (SELECT LEAST(GREATEST(COALESCE(rp.mins, ll.l), 0), ll.l) AS m) mm
    CROSS JOIN LATERAL generate_series(0, ll.l - 1) AS g(n)
    WHERE ll.l > 0 AND rp.s_from IS NOT NULL AND rp.s_to IS NOT NULL
      AND NOT (g.n >= mm.m / 2 AND g.n < mm.m / 2 + (ll.l - mm.m))
  ),
  minutes AS (
    SELECT ms.day, ms.minute_at FROM minutes_stamped ms
    UNION
    SELECT rm.day, rm.minute_at FROM recovered_minutes rm
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
  -- Lagstadgad rast: mer än 4 timmar i sträck ger 30 min obetald rast per dag.
  -- Stämplad rast räknas av; resten läggs mitt i dagens längsta sammanhängande arbetspass.
  runs AS (
    SELECT m.day, m.minute_at,
           m.minute_at - (row_number() OVER (PARTITION BY m.day ORDER BY m.minute_at)) * interval '1 minute' AS grp
    FROM minutes m
  ),
  run_sizes AS (
    SELECT r.day, r.grp, min(r.minute_at) AS run_start, count(*)::integer AS run_len
    FROM runs r GROUP BY r.day, r.grp
  ),
  longest_run AS (
    SELECT DISTINCT ON (rs.day) rs.day, rs.run_start, rs.run_len
    FROM run_sizes rs ORDER BY rs.day, rs.run_len DESC, rs.run_start
  ),
  auto_break AS (
    SELECT lr.day, ab.mins,
           lr.run_start + ((lr.run_len - ab.mins) / 2) * interval '1 minute' AS ab_start
    FROM longest_run lr
    LEFT JOIN break_totals bt ON bt.day = lr.day
    CROSS JOIN LATERAL (SELECT GREATEST(0, 30 - COALESCE(bt.break_minutes, 0))::integer AS mins) ab
    WHERE lr.run_len > 240 AND ab.mins > 0
  ),
  minutes_net AS (
    SELECT m.day, m.minute_at FROM minutes m
    WHERE NOT EXISTS (
      SELECT 1 FROM auto_break ab
      WHERE ab.day = m.day AND m.minute_at >= ab.ab_start AND m.minute_at < ab.ab_start + ab.mins * interval '1 minute'
    )
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
    FROM minutes_net m
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
      (COALESCE((SELECT bt.break_minutes FROM break_totals bt WHERE bt.day = c.day), 0)
       + COALESCE((SELECT ab.mins FROM auto_break ab WHERE ab.day = c.day), 0))::integer AS break_mins,
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
    jsonb_build_object('calculation_time', 'fast starttid enligt employee_fixed_start_rules för dagens första instämpling, annars rounded_at/occurred_at',
      'attesterat_fonster', _attesterat,
      'lagstadgad_rast', 'mer än 240 min i sträck ger 30 min rast per dag (stämplad rast avräknas)',
      'schematid_betald', 'schematid som betalas (sen in, tidig ut, missat pass) räknas på schemats klockslag för OB och mertid',
      'employment_rate', w.employment_rate, 'week_total_minutes', w.week_after)
  FROM weekly w ORDER BY w.day;
END;
$function$;

CREATE OR REPLACE FUNCTION public.attestation_apply_parts(_id uuid)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  r public.attestations;
  c jsonb;
  parts jsonb;
  d jsonb;
  p jsonb;
  k text;
  dec text;
  win_in timestamptz;
  win_out timestamptz;
  recovered integer := 0;
  withheld integer := 0;
  pending boolean := false;
  clipped integer := 0;
  n_parts integer;
BEGIN
  SELECT * INTO r FROM public.attestations WHERE id = _id FOR UPDATE;
  IF NOT FOUND OR r.status = 'rejected' OR (r.computed->>'model') IS DISTINCT FROM 'delar' THEN
    RETURN;
  END IF;
  c := r.computed;
  parts := COALESCE(c->'parts', '[]'::jsonb);
  d := COALESCE(r.part_decisions, '{}'::jsonb);
  n_parts := jsonb_array_length(parts);

  IF c->>'sched_from' IS NOT NULL THEN
    win_in := (c->>'sched_from')::timestamptz;
    win_out := (c->>'sched_to')::timestamptz;
  ELSE
    win_in := (c->>'eff_in')::timestamptz;
    win_out := win_in;
  END IF;
  recovered := COALESCE((c->>'tol_short_minutes')::integer, 0);

  FOR p IN SELECT value FROM jsonb_array_elements(parts) LOOP
    k := p->>'kind';
    dec := d->k->>'decision';
    -- Tid som schemat utökats med i efterhand betalas bara när den är godkänd.
    IF k = 'schemaandring' AND dec IS DISTINCT FROM 'godkand' THEN
      withheld := withheld + COALESCE((p->>'minutes')::integer, 0);
    END IF;
    IF dec IS NULL THEN
      pending := true;
      CONTINUE;
    END IF;
    IF k = 'tidig_in' AND dec = 'godkand' THEN
      win_in := (c->>'eff_in')::timestamptz;
    ELSIF k = 'sen_ut' AND dec = 'godkand' THEN
      win_out := (c->>'eff_out')::timestamptz;
    ELSIF k = 'oplanerad' AND dec = 'godkand' THEN
      win_in := (c->>'eff_in')::timestamptz;
      win_out := (c->>'eff_out')::timestamptz;
    -- Schematid för sen in/tidig ut/missat pass räknas av berakna_arbetstid_rad
    -- (på schemats klockslag, så att OB följer med) och läggs inte till här en gång till.
    END IF;
  END LOOP;

  UPDATE public.attestations SET payroll_in = win_in, payroll_out = win_out WHERE id = _id;

  SELECT COALESCE((SELECT b.total_minutes FROM public.berakna_arbetstid_rad(r.employee_id, r.date, r.date, true) b
                    WHERE b.arbetsdag = r.date), 0)
    INTO clipped;

  UPDATE public.attestations
     SET approved_minutes = GREATEST(0, clipped + recovered - withheld),
         status = CASE WHEN pending THEN 'flagged' WHEN n_parts > 0 THEN 'approved' ELSE 'auto_approved' END,
         basis = CASE WHEN pending THEN NULL WHEN n_parts > 0 THEN 'avvikelse' ELSE 'schema' END,
         decided_at = CASE WHEN pending THEN NULL ELSE COALESCE(decided_at, now()) END
   WHERE id = _id;
END;
$function$;