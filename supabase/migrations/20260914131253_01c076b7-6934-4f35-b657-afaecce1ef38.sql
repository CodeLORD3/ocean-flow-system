-- 1) Löneperiodmodell 16:e -> 15:e ------------------------------------------
ALTER TABLE public.payroll_periods
  ADD COLUMN IF NOT EXISTS period_start date,
  ADD COLUMN IF NOT EXISTS period_end date,
  ADD COLUMN IF NOT EXISTS source text NOT NULL DEFAULT 'makrilltrade';

ALTER TABLE public.payroll_periods
  DROP CONSTRAINT IF EXISTS payroll_periods_source_chk;
ALTER TABLE public.payroll_periods
  ADD CONSTRAINT payroll_periods_source_chk CHECK (source IN ('makrilltrade','personalkollen'));

CREATE OR REPLACE FUNCTION public.payroll_period_end(_period text)
RETURNS date LANGUAGE sql IMMUTABLE SET search_path = public AS $$
  SELECT (_period || '-15')::date
$$;

CREATE OR REPLACE FUNCTION public.payroll_period_start(_period text)
RETURNS date LANGUAGE sql IMMUTABLE SET search_path = public AS $$
  SELECT ((_period || '-15')::date - INTERVAL '1 month' + INTERVAL '1 day')::date
$$;

CREATE OR REPLACE FUNCTION public.payroll_period_source(_period text)
RETURNS text LANGUAGE sql IMMUTABLE SET search_path = public AS $$
  SELECT CASE WHEN (_period || '-15')::date <= DATE '2026-09-15'
              THEN 'personalkollen' ELSE 'makrilltrade' END
$$;

CREATE OR REPLACE FUNCTION public.payroll_periods_fill_bounds()
RETURNS trigger LANGUAGE plpgsql SET search_path = public AS $$
BEGIN
  NEW.period_start := public.payroll_period_start(NEW.period);
  NEW.period_end   := public.payroll_period_end(NEW.period);
  IF TG_OP = 'INSERT' THEN
    NEW.source := public.payroll_period_source(NEW.period);
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS payroll_periods_bounds ON public.payroll_periods;
CREATE TRIGGER payroll_periods_bounds
BEFORE INSERT OR UPDATE OF period ON public.payroll_periods
FOR EACH ROW EXECUTE FUNCTION public.payroll_periods_fill_bounds();

UPDATE public.payroll_periods
SET period_start = public.payroll_period_start(period),
    period_end   = public.payroll_period_end(period),
    source       = public.payroll_period_source(period);

-- 2) Växlingsflagga per enhet ------------------------------------------------
ALTER TABLE public.stores
  ADD COLUMN IF NOT EXISTS clock_active_from date;

UPDATE public.stores
SET clock_active_from = DATE '2026-09-16'
WHERE clock_active_from IS NULL
  AND coalesce(country, 'SE') = 'SE'
  AND coalesce(active, true) = true;

-- 3) Varningar: stämpling i fel system ---------------------------------------
CREATE TABLE IF NOT EXISTS public.wrong_system_punches (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  store_id uuid REFERENCES public.stores(id) ON DELETE SET NULL,
  legal_entity_id text,
  employee_id uuid REFERENCES public.employees(id) ON DELETE CASCADE,
  pk_staff_name text,
  work_date date NOT NULL,
  punch_count integer NOT NULL DEFAULT 1,
  minutes integer NOT NULL DEFAULT 0,
  note text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS wrong_system_punches_uniq
  ON public.wrong_system_punches (coalesce(store_id, '00000000-0000-0000-0000-000000000000'::uuid), coalesce(pk_staff_name,''), work_date);

GRANT SELECT ON public.wrong_system_punches TO authenticated;
GRANT ALL ON public.wrong_system_punches TO service_role;

ALTER TABLE public.wrong_system_punches ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Personal ser varningar for sina enheter" ON public.wrong_system_punches;
CREATE POLICY "Personal ser varningar for sina enheter"
ON public.wrong_system_punches FOR SELECT TO authenticated
USING (public.is_staff() AND (store_id IS NULL OR public.can_see_store(store_id)));

CREATE TRIGGER wrong_system_punches_touch
BEFORE UPDATE ON public.wrong_system_punches
FOR EACH ROW EXECUTE FUNCTION public.hr_touch_updated_at();

-- Loggar pk-stämplingar efter enhetens växlingsdatum, per person och dag.
CREATE OR REPLACE FUNCTION public.flag_wrong_system_punches(_from date DEFAULT NULL, _to date DEFAULT NULL)
RETURNS integer LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  _f date := coalesce(_from, (now() AT TIME ZONE 'Europe/Stockholm')::date - 14);
  _t date := coalesce(_to, (now() AT TIME ZONE 'Europe/Stockholm')::date);
  _n integer := 0;
BEGIN
  INSERT INTO public.wrong_system_punches
    (store_id, legal_entity_id, employee_id, pk_staff_name, work_date, punch_count, minutes, note)
  SELECT w.store_id,
         s.legal_entity_id,
         st.employee_id,
         trim(coalesce(st.first_name,'') || ' ' || coalesce(st.last_name,'')),
         (l.start AT TIME ZONE 'Europe/Stockholm')::date,
         count(*)::int,
         coalesce(sum(l.work_time_sec) / 60, 0)::int,
         'stämpling i fel system'
  FROM public.pk_logged_times l
  JOIN public.pk_staff st ON st.url = l.staff_url AND st.connection_id = l.connection_id
  LEFT JOIN public.pk_workplaces w ON w.url = l.workplace_url AND w.connection_id = l.connection_id
  LEFT JOIN public.stores s ON s.id = w.store_id
  WHERE coalesce(l.is_canceled, false) = false
    AND l.start IS NOT NULL
    AND (l.start AT TIME ZONE 'Europe/Stockholm')::date BETWEEN _f AND _t
    AND (l.start AT TIME ZONE 'Europe/Stockholm')::date >= coalesce(s.clock_active_from, DATE '2026-09-16')
  GROUP BY w.store_id, s.legal_entity_id, st.employee_id,
           trim(coalesce(st.first_name,'') || ' ' || coalesce(st.last_name,'')),
           (l.start AT TIME ZONE 'Europe/Stockholm')::date
  ON CONFLICT (coalesce(store_id, '00000000-0000-0000-0000-000000000000'::uuid), coalesce(pk_staff_name,''), work_date)
  DO UPDATE SET punch_count = EXCLUDED.punch_count, minutes = EXCLUDED.minutes, updated_at = now();

  GET DIAGNOSTICS _n = ROW_COUNT;
  RETURN _n;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.flag_wrong_system_punches(date, date) FROM anon, PUBLIC;
GRANT EXECUTE ON FUNCTION public.flag_wrong_system_punches(date, date) TO service_role, authenticated;

-- 4) Daglig driftbevakning ---------------------------------------------------
CREATE OR REPLACE FUNCTION public.clock_ops_day(_day date DEFAULT NULL)
RETURNS TABLE(
  store_id uuid,
  store_name text,
  legal_entity_id text,
  clock_active_from date,
  punches integer,
  employees_punched integer,
  warnings integer,
  scheduled_shifts integer,
  tone text
)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  WITH d AS (SELECT coalesce(_day, (now() AT TIME ZONE 'Europe/Stockholm')::date - 1) AS day),
  st AS (
    SELECT s.id, s.name, s.legal_entity_id, s.clock_active_from
    FROM public.stores s
    WHERE coalesce(s.country,'SE') = 'SE' AND coalesce(s.active,true) = true
      AND s.clock_active_from IS NOT NULL
  ),
  p AS (
    SELECT te.store_id, count(*)::int AS punches, count(DISTINCT te.employee_id)::int AS emps
    FROM public.time_entries te
    JOIN public.employees e ON e.id = te.employee_id
    JOIN d ON true
    WHERE te.arbetsdag = d.day AND coalesce(e.is_test, false) = false
    GROUP BY te.store_id
  ),
  w AS (
    SELECT x.store_id, count(*)::int AS warnings
    FROM public.wrong_system_punches x JOIN d ON true
    WHERE x.work_date = d.day GROUP BY x.store_id
  ),
  sc AS (
    SELECT sh.store_id, count(*)::int AS shifts
    FROM public.shifts sh JOIN d ON true
    WHERE sh.date = d.day AND coalesce(sh.status,'') <> 'cancelled'
    GROUP BY sh.store_id
  )
  SELECT st.id, st.name, st.legal_entity_id, st.clock_active_from,
         coalesce(p.punches,0), coalesce(p.emps,0),
         coalesce(w.warnings,0), coalesce(sc.shifts,0),
         CASE
           WHEN (SELECT day FROM d) < st.clock_active_from THEN 'pending'
           WHEN coalesce(p.punches,0) = 0 AND coalesce(sc.shifts,0) > 0 THEN 'red'
           WHEN coalesce(w.warnings,0) > 0 THEN 'yellow'
           WHEN coalesce(p.punches,0) > 0 THEN 'green'
           ELSE 'none'
         END
  FROM st
  LEFT JOIN p ON p.store_id = st.id
  LEFT JOIN w ON w.store_id = st.id
  LEFT JOIN sc ON sc.store_id = st.id
  ORDER BY st.name;
$$;

REVOKE EXECUTE ON FUNCTION public.clock_ops_day(date) FROM anon, PUBLIC;
GRANT EXECUTE ON FUNCTION public.clock_ops_day(date) TO authenticated, service_role;

-- 5) Attestpåminnelse: eskalera även till admin ------------------------------
CREATE OR REPLACE FUNCTION public.attest_weekly_reminder()
RETURNS integer LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  _week text := to_char((now() AT TIME ZONE 'Europe/Stockholm')::date, 'IYYY-"W"IW');
  _created integer := 0;
  _admin integer := 0;
BEGIN
  INSERT INTO public.notifications (portal, target_page, store_id, message, entity_type, dedupe_key)
  SELECT 'shop', '/attestations', a.store_id,
         'Oattesterade pass äldre än 7 dagar: ' || count(*) || ' rader väntar på attest',
         'attestation',
         'attest_reminder|' || a.store_id || '|' || _week
  FROM public.attestations a
  JOIN public.employees e ON e.id = a.employee_id
  WHERE a.status = 'flagged' AND e.is_test = false
    AND a.date < ((now() AT TIME ZONE 'Europe/Stockholm')::date - 7)
    AND a.store_id IS NOT NULL
  GROUP BY a.store_id
  ON CONFLICT (dedupe_key) DO NOTHING;
  GET DIAGNOSTICS _created = ROW_COUNT;

  INSERT INTO public.notifications (portal, target_page, store_id, message, entity_type, dedupe_key)
  SELECT 'admin', '/attestations', a.store_id,
         'Eskalering: ' || count(*) || ' oattesterade pass äldre än 7 dagar (' || coalesce(s.name,'okänd enhet') || ')',
         'attestation',
         'attest_escalation|' || a.store_id || '|' || _week
  FROM public.attestations a
  JOIN public.employees e ON e.id = a.employee_id
  LEFT JOIN public.stores s ON s.id = a.store_id
  WHERE a.status = 'flagged' AND e.is_test = false
    AND a.date < ((now() AT TIME ZONE 'Europe/Stockholm')::date - 7)
    AND a.store_id IS NOT NULL
  GROUP BY a.store_id, s.name
  ON CONFLICT (dedupe_key) DO NOTHING;
  GET DIAGNOSTICS _admin = ROW_COUNT;

  RETURN _created + _admin;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.attest_weekly_reminder() FROM anon, authenticated, PUBLIC;
GRANT EXECUTE ON FUNCTION public.attest_weekly_reminder() TO service_role;

SELECT cron.schedule('flag-wrong-system-punches', '30 4 * * *', $$SELECT public.flag_wrong_system_punches();$$);
