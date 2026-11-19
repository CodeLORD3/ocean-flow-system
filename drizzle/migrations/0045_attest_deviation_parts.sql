ALTER TABLE public.attestations ADD COLUMN IF NOT EXISTS part_decisions jsonb NOT NULL DEFAULT '{}'::jsonb;
COMMENT ON COLUMN public.attestations.part_decisions IS 'Beslut per avvikelsedel (kind -> {decision, by, at, note}). Skrivs bara av decide_attestation_part.';

ALTER TABLE public.attestations DROP CONSTRAINT IF EXISTS attestations_deviation_type_check;
ALTER TABLE public.attestations ADD CONSTRAINT attestations_deviation_type_check
  CHECK (deviation_type = ANY (ARRAY['none','sen_in','tidig_in','tidig_ut','sen_ut','missad_rast','oplanerad_tid','missat_pass']));
ALTER TABLE public.attestations DROP CONSTRAINT IF EXISTS attestations_basis_check;
ALTER TABLE public.attestations ADD CONSTRAINT attestations_basis_check
  CHECK (basis = ANY (ARRAY['schema','stamplad','justerad','avvikelse']));

-- Arbetstidsmotorn med valbar klippning mot attesterat fönster (payroll_in/payroll_out).
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
    jsonb_build_object('calculation_time', 'fast starttid enligt employee_fixed_start_rules för dagens första instämpling, annars rounded_at/occurred_at',
      'attesterat_fonster', _attesterat,
      'employment_rate', w.employment_rate, 'week_total_minutes', w.week_after)
  FROM weekly w ORDER BY w.day;
END;
$function$;

REVOKE ALL ON FUNCTION public.berakna_arbetstid_rad(uuid, date, date, boolean) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.berakna_arbetstid_rad(uuid, date, date, boolean) TO authenticated, service_role;

-- Standardanropet räknar alltid attesterad tid (klippt mot godkänt fönster).
CREATE OR REPLACE FUNCTION public.berakna_arbetstid(_employee_id uuid, _from date, _to date)
 RETURNS TABLE(arbetsdag date, regular_minutes integer, ob_minutes jsonb, ob50_minutes integer, ob70_minutes integer, ob100_minutes integer, mertid_minutes integer, overtime_minutes integer, break_minutes integer, total_minutes integer, missing_wage_code boolean, source jsonb)
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
BEGIN
  RETURN QUERY SELECT * FROM public.berakna_arbetstid_rad(_employee_id, _from, _to, true);
END;
$function$;

-- Räknar om en attestrad från dess avvikelsedelar och beslut.
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
    ELSIF k IN ('sen_in', 'tidig_ut', 'missat_pass') AND dec = 'schema' THEN
      recovered := recovered + COALESCE((p->>'minutes')::integer, 0);
    END IF;
  END LOOP;

  UPDATE public.attestations SET payroll_in = win_in, payroll_out = win_out WHERE id = _id;

  SELECT COALESCE((SELECT b.total_minutes FROM public.berakna_arbetstid_rad(r.employee_id, r.date, r.date, true) b
                    WHERE b.arbetsdag = r.date), 0)
    INTO clipped;

  UPDATE public.attestations
     SET approved_minutes = clipped + recovered,
         status = CASE WHEN pending THEN 'flagged' WHEN n_parts > 0 THEN 'approved' ELSE 'auto_approved' END,
         basis = CASE WHEN pending THEN NULL WHEN n_parts > 0 THEN 'avvikelse' ELSE 'schema' END,
         decided_at = CASE WHEN pending THEN NULL ELSE COALESCE(decided_at, now()) END
   WHERE id = _id;
END;
$function$;

REVOKE ALL ON FUNCTION public.attestation_apply_parts(uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.attestation_apply_parts(uuid) TO service_role;

-- Chefens beslut på en enskild avvikelse. _decision NULL = ångra beslutet.
CREATE OR REPLACE FUNCTION public.decide_attestation_part(_attestation_id uuid, _part text, _decision text, _note text DEFAULT NULL)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  r public.attestations;
  p jsonb;
  before_min integer;
  after_row public.attestations;
  label text;
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'Inloggning krävs';
  END IF;
  SELECT * INTO r FROM public.attestations WHERE id = _attestation_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Attestraden finns inte';
  END IF;
  IF NOT (public.can_manage_schedule(r.store_id, r.legal_entity_id)
          OR public.has_role(auth.uid(), 'admin')
          OR public.is_platform_admin(auth.uid())) THEN
    RAISE EXCEPTION 'Behörighet saknas för att attestera den här enheten';
  END IF;
  IF (r.computed->>'model') IS DISTINCT FROM 'delar' THEN
    RAISE EXCEPTION 'Dagen saknar avvikelser att attestera per del';
  END IF;
  SELECT value INTO p FROM jsonb_array_elements(COALESCE(r.computed->'parts', '[]'::jsonb)) WHERE value->>'kind' = _part LIMIT 1;
  IF p IS NULL THEN
    RAISE EXCEPTION 'Avvikelsen finns inte på dagen';
  END IF;
  IF _decision IS NOT NULL AND NOT (
       (_part IN ('tidig_in', 'sen_ut', 'oplanerad') AND _decision IN ('godkand', 'nekad'))
    OR (_part IN ('sen_in', 'tidig_ut', 'missat_pass') AND _decision IN ('stamplad', 'schema'))
  ) THEN
    RAISE EXCEPTION 'Ogiltigt beslut för avvikelsen';
  END IF;

  before_min := r.approved_minutes;
  UPDATE public.attestations
     SET part_decisions = CASE WHEN _decision IS NULL THEN part_decisions - _part
                               ELSE part_decisions || jsonb_build_object(_part, jsonb_build_object(
                                 'decision', _decision, 'by', auth.uid(), 'at', now(), 'note', NULLIF(trim(COALESCE(_note, '')), '')))
                          END,
         status = 'flagged',
         decided_by = auth.uid(),
         decided_at = NULL
   WHERE id = _attestation_id;

  PERFORM public.attestation_apply_parts(_attestation_id);
  SELECT * INTO after_row FROM public.attestations WHERE id = _attestation_id;

  label := CASE _part
    WHEN 'tidig_in' THEN 'Stämplade in tidigare'
    WHEN 'sen_in' THEN 'Stämplade in senare'
    WHEN 'tidig_ut' THEN 'Stämplade ut tidigare'
    WHEN 'sen_ut' THEN 'Stämplade ut senare'
    WHEN 'oplanerad' THEN 'Ej schemalagd tid'
    ELSE 'Ingen stämpling' END
    || ' (' || COALESCE(p->>'minutes', '0') || ' min): '
    || CASE _decision
         WHEN 'godkand' THEN 'godkänd'
         WHEN 'nekad' THEN 'nekad'
         WHEN 'stamplad' THEN 'stämplad tid'
         WHEN 'schema' THEN 'schematid'
         ELSE 'beslut ångrat' END;

  INSERT INTO public.attestation_journal (attestation_id, action, basis, minutes_before, minutes_after, note, actor_id)
  VALUES (_attestation_id, 'avvikelse', 'avvikelse', before_min, after_row.approved_minutes,
          label || COALESCE(' · ' || NULLIF(trim(COALESCE(_note, '')), ''), ''), auth.uid());

  RETURN jsonb_build_object('status', after_row.status, 'approved_minutes', after_row.approved_minutes, 'part_decisions', after_row.part_decisions);
END;
$function$;

REVOKE ALL ON FUNCTION public.decide_attestation_part(uuid, text, text, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.decide_attestation_part(uuid, text, text, text) TO authenticated, service_role;