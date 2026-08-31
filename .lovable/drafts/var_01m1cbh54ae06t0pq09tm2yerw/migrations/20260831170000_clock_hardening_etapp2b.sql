-- Etapp 2b — härdning av stämpelklockan.
-- Endast additiva ändringar: nya tabeller, nya kolumner och vidgade villkor.

-- ============ 1. Journalen: avrundad tid vid sidan av faktisk tid ============
ALTER TABLE public.time_entries
  ADD COLUMN IF NOT EXISTS rounded_at TIMESTAMPTZ;

COMMENT ON COLUMN public.time_entries.rounded_at IS
  'Avrundad tidpunkt för löneunderlag. occurred_at är alltid den faktiska stämplingen.';

-- Systemgenererade utstämplingar ska kunna skiljas från klockans egna.
ALTER TABLE public.time_entries DROP CONSTRAINT IF EXISTS time_entries_source_check;
ALTER TABLE public.time_entries ADD CONSTRAINT time_entries_source_check
  CHECK (source = ANY (ARRAY['clock', 'manual', 'correction', 'import', 'system']));

-- ============ 2. Stationssession: absolut tak ============
ALTER TABLE public.clock_station_sessions
  ADD COLUMN IF NOT EXISTS absolute_expires_at TIMESTAMPTZ;

UPDATE public.clock_station_sessions
   SET absolute_expires_at = created_at + INTERVAL '24 hours'
 WHERE absolute_expires_at IS NULL;

COMMENT ON COLUMN public.clock_station_sessions.absolute_expires_at IS
  'Sessionen kan aldrig förnyas förbi denna tidpunkt (24 h från aktivering).';

-- ============ 3. Provisorisk person vid okänt personnummer ============
ALTER TABLE public.employees
  ADD COLUMN IF NOT EXISTS status TEXT NOT NULL DEFAULT 'active';

ALTER TABLE public.employees DROP CONSTRAINT IF EXISTS employees_status_chk;
ALTER TABLE public.employees ADD CONSTRAINT employees_status_chk
  CHECK (status = ANY (ARRAY['active', 'provisional', 'archived']));

COMMENT ON COLUMN public.employees.status IS
  'provisional = skapad av klockan vid okänt personnummer, väntar på granskning.';

-- ============ 4. Misslyckade offlineposter (ingen tyst dataförlust) ============
CREATE TABLE IF NOT EXISTS public.clock_sync_failures (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  station_id UUID REFERENCES public.clock_stations(id) ON DELETE SET NULL,
  store_id UUID REFERENCES public.stores(id) ON DELETE SET NULL,
  legal_entity_id TEXT,
  identifier_masked TEXT,
  identifier_cipher TEXT,
  identifier_iv TEXT,
  punch_type TEXT NOT NULL,
  occurred_at TIMESTAMPTZ NOT NULL,
  queued_at TIMESTAMPTZ,
  work_site_id UUID REFERENCES public.work_sites(id) ON DELETE SET NULL,
  cost_center TEXT,
  reason TEXT NOT NULL,
  attempts INTEGER NOT NULL DEFAULT 1,
  status TEXT NOT NULL DEFAULT 'open',
  resolution_note TEXT,
  resolved_entry_id UUID REFERENCES public.time_entries(id) ON DELETE SET NULL,
  handled_by UUID,
  handled_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT clock_sync_failures_type_chk
    CHECK (punch_type = ANY (ARRAY['in', 'ut', 'rast_start', 'rast_slut'])),
  CONSTRAINT clock_sync_failures_status_chk
    CHECK (status = ANY (ARRAY['open', 'registered', 'dismissed']))
);

CREATE INDEX IF NOT EXISTS clock_sync_failures_open_idx
  ON public.clock_sync_failures (store_id, occurred_at DESC) WHERE status = 'open';

GRANT SELECT, UPDATE ON public.clock_sync_failures TO authenticated;
GRANT ALL ON public.clock_sync_failures TO service_role;
ALTER TABLE public.clock_sync_failures ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "clock_sync_failures_read" ON public.clock_sync_failures;
CREATE POLICY "clock_sync_failures_read" ON public.clock_sync_failures
  FOR SELECT TO authenticated
  USING (public.can_see_clock_store(store_id, legal_entity_id));

DROP POLICY IF EXISTS "clock_sync_failures_handle" ON public.clock_sync_failures;
CREATE POLICY "clock_sync_failures_handle" ON public.clock_sync_failures
  FOR UPDATE TO authenticated
  USING (public.can_see_clock_store(store_id, legal_entity_id))
  WITH CHECK (public.can_see_clock_store(store_id, legal_entity_id));

DROP TRIGGER IF EXISTS clock_sync_failures_touch ON public.clock_sync_failures;
CREATE TRIGGER clock_sync_failures_touch BEFORE UPDATE ON public.clock_sync_failures
  FOR EACH ROW EXECUTE FUNCTION public.hr_touch_updated_at();

-- ============ 5. Logg över uppslag av fullständigt personnummer ============
CREATE TABLE IF NOT EXISTS public.pnr_access_log (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  employee_id UUID REFERENCES public.employees(id) ON DELETE SET NULL,
  accessed_by UUID,
  inspector_session_id UUID REFERENCES public.inspector_sessions(id) ON DELETE SET NULL,
  store_id UUID REFERENCES public.stores(id) ON DELETE SET NULL,
  legal_entity_id TEXT,
  period_from DATE,
  period_to DATE,
  reason TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS pnr_access_log_created_idx
  ON public.pnr_access_log (created_at DESC);

GRANT SELECT ON public.pnr_access_log TO authenticated;
GRANT ALL ON public.pnr_access_log TO service_role;
ALTER TABLE public.pnr_access_log ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "pnr_access_log_admin_read" ON public.pnr_access_log;
CREATE POLICY "pnr_access_log_admin_read" ON public.pnr_access_log
  FOR SELECT TO authenticated
  USING (public.is_platform_admin(auth.uid()) OR public.has_role(auth.uid(), 'admin'));

-- ============ 6. Städa död konfiguration i klockprofilerna ============
-- Automatisk rast och geofence-flaggan användes inte och togs bort ur koden.
UPDATE public.clock_stations
   SET profile = (profile - 'geofence') || jsonb_build_object(
         'break', COALESCE(profile -> 'break', '{}'::jsonb)
                    - 'mode' - 'auto_after_hours' - 'auto_minutes'
       ),
       updated_at = now()
 WHERE profile ? 'geofence'
    OR profile -> 'break' ? 'mode'
    OR profile -> 'break' ? 'auto_after_hours'
    OR profile -> 'break' ? 'auto_minutes';

-- Standard är ingen avrundning; den som vill avrunda slår på det medvetet.
UPDATE public.clock_stations
   SET profile = jsonb_set(profile, '{rounding}', jsonb_build_object('mode', 'none', 'step', 0), true),
       updated_at = now()
 WHERE NOT (profile ? 'rounding');

-- ============ 7. Spärren räknar misslyckade uppslag ============
ALTER TABLE public.clock_rate_limits
  ADD COLUMN IF NOT EXISTS failure_count INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS blocked_until TIMESTAMPTZ;

COMMENT ON COLUMN public.clock_rate_limits.failure_count IS
  'Misslyckade personnummeruppslag. Lyckade stämplingar spärrar aldrig stationen.';

-- ============ F19–F21: svensk arbetsdag, idempotens och gemensam beräkning ==========
CREATE OR REPLACE FUNCTION public.svensk_dag(_ts timestamptz, _grans time DEFAULT '00:00:00'::time)
RETURNS date
LANGUAGE sql IMMUTABLE PARALLEL SAFE SET search_path = public
AS $$
  SELECT (((_ts AT TIME ZONE 'Europe/Stockholm')::date)
    - CASE WHEN (_ts AT TIME ZONE 'Europe/Stockholm')::time < _grans THEN 1 ELSE 0 END)
$$;

ALTER TABLE public.time_entries ADD COLUMN IF NOT EXISTS client_punch_id uuid;
CREATE UNIQUE INDEX IF NOT EXISTS time_entries_client_punch_unique
  ON public.time_entries (employee_id, client_punch_id) WHERE client_punch_id IS NOT NULL;
ALTER TABLE public.time_entries
  ADD COLUMN IF NOT EXISTS arbetsdag date
  GENERATED ALWAYS AS (public.svensk_dag(occurred_at)) STORED;
CREATE INDEX IF NOT EXISTS time_entries_arbetsdag_idx
  ON public.time_entries (employee_id, arbetsdag, occurred_at);
COMMENT ON COLUMN public.time_entries.client_punch_id IS
  'Idempotensnyckel från klienten. Samma knapptryck får aldrig skapa två journalrader.';
COMMENT ON COLUMN public.time_entries.arbetsdag IS
  'Genererad svensk arbetsdag från faktisk occurred_at.';

CREATE OR REPLACE FUNCTION public.berakna_arbetstid(_employee_id uuid, _from date, _to date)
RETURNS TABLE (
  arbetsdag date,
  regular_minutes integer,
  ob_minutes jsonb,
  ob50_minutes integer,
  ob70_minutes integer,
  ob100_minutes integer,
  mertid_minutes integer,
  overtime_minutes integer,
  break_minutes integer,
  total_minutes integer,
  missing_wage_code boolean,
  source jsonb
)
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public
AS $$
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
  -- Paring sker på närmaste efterföljande stämpling i tid, aldrig positionsvis.
  -- En glömd utstämpling ger då bara ett saknat par, inte förskjutna par efteråt.
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
  -- Nattpass delas vid svensk dygnsgräns så att minuterna hamnar på rätt
  -- arbetsdag och rätt ISO-vecka för mertid och övertid.
  intervals AS (
    SELECT d.day,
           GREATEST(ri.started_at, (d.day::timestamp AT TIME ZONE 'Europe/Stockholm')) AS started_at,
           LEAST(ri.ended_at, ((d.day + 1)::timestamp AT TIME ZONE 'Europe/Stockholm')) AS ended_at
    FROM raw_intervals ri
    CROSS JOIN LATERAL generate_series(
      public.svensk_dag(ri.started_at),
      public.svensk_dag(ri.ended_at - interval '1 microsecond'),
      interval '1 day'
    ) AS d(day)
    WHERE d.day BETWEEN _from AND _to
  ),
  sized AS (
    SELECT i.day, i.started_at, i.ended_at,
           GREATEST(0, floor(extract(epoch FROM (i.ended_at - i.started_at)) / 60))::integer AS raw_minutes
    FROM intervals i WHERE i.ended_at > i.started_at
  ),
  -- Rastminuter är inte arbetad tid: de plockas bort minut för minut, så att
  -- varken ordinarie tid, OB eller övertid räknar med rasten.
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
  -- Rast räknas per arbetsdag utifrån rastens faktiska minuter i dygnet.
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
    -- Mertid: tid över deltidsmåttet men under heltid (2400 min = 40 h/vecka).
    round(GREATEST(0, LEAST(w.week_after, 2400) - 2400 * w.employment_rate / 100)
      - GREATEST(0, LEAST(w.week_before, 2400) - 2400 * w.employment_rate / 100))::integer,
    -- Övertid: tid över heltidsmåttet.
    round(GREATEST(0, w.week_after - 2400) - GREATEST(0, w.week_before - 2400))::integer,
    w.break_mins, w.worked_mins, COALESCE(w.missing_wage, false),
    jsonb_build_object('calculation_time', 'rounded_at när den finns, annars occurred_at',
      'employment_rate', w.employment_rate, 'week_total_minutes', w.week_after)
  FROM weekly w ORDER BY w.day;
END;
$$;
REVOKE ALL ON FUNCTION public.svensk_dag(timestamptz, time) FROM public, anon;
GRANT EXECUTE ON FUNCTION public.svensk_dag(timestamptz, time) TO authenticated, service_role;
REVOKE ALL ON FUNCTION public.berakna_arbetstid(uuid, date, date) FROM public, anon;
GRANT EXECUTE ON FUNCTION public.berakna_arbetstid(uuid, date, date) TO authenticated, service_role;

-- ============ F22–F27: revisionsspår, gallring, realtid och triggers ==========
CREATE TABLE IF NOT EXISTS public.retention_log (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(), table_name text NOT NULL, row_id uuid,
  retention_reason text NOT NULL, deleted_at timestamptz NOT NULL DEFAULT now(),
  deleted_by uuid, metadata jsonb NOT NULL DEFAULT '{}'::jsonb
);
GRANT SELECT ON public.retention_log TO authenticated;
GRANT ALL ON public.retention_log TO service_role;
ALTER TABLE public.retention_log ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS retention_log_admin_read ON public.retention_log;
CREATE POLICY retention_log_admin_read ON public.retention_log FOR SELECT TO authenticated
  USING (public.is_platform_admin(auth.uid()) OR public.has_role(auth.uid(), 'admin'));

CREATE TABLE IF NOT EXISTS public.clock_station_watchdog (
  station_id uuid PRIMARY KEY REFERENCES public.clock_stations(id) ON DELETE CASCADE,
  last_seen_at timestamptz, last_alert_at timestamptz, alert_count integer NOT NULL DEFAULT 0,
  status text NOT NULL DEFAULT 'ok', updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE ON public.clock_station_watchdog TO authenticated;
GRANT ALL ON public.clock_station_watchdog TO service_role;
ALTER TABLE public.clock_station_watchdog ENABLE ROW LEVEL SECURITY;
CREATE POLICY clock_station_watchdog_read ON public.clock_station_watchdog FOR SELECT TO authenticated
  USING (public.is_platform_admin(auth.uid()) OR public.has_role(auth.uid(), 'admin'));
CREATE POLICY clock_station_watchdog_manage ON public.clock_station_watchdog FOR ALL TO authenticated
  USING (public.is_platform_admin(auth.uid()) OR public.has_role(auth.uid(), 'admin'))
  WITH CHECK (public.is_platform_admin(auth.uid()) OR public.has_role(auth.uid(), 'admin'));

CREATE OR REPLACE FUNCTION public.block_self_attestation()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF NEW.decided_by IS NOT NULL AND public.employee_is_self(NEW.employee_id)
     AND NOT (public.is_platform_admin(auth.uid()) OR public.has_role(auth.uid(), 'admin')) THEN
    RAISE EXCEPTION 'En medarbetare får inte attestera sin egen tid';
  END IF;
  RETURN NEW;
END;
$$;
DROP TRIGGER IF EXISTS attestations_no_self_attest ON public.attestations;
CREATE TRIGGER attestations_no_self_attest BEFORE INSERT OR UPDATE ON public.attestations
  FOR EACH ROW EXECUTE FUNCTION public.block_self_attestation();

CREATE OR REPLACE FUNCTION public.purge_clock_retention()
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE sync_count integer := 0; pnr_count integer := 0;
BEGIN
  INSERT INTO public.retention_log(table_name, row_id, retention_reason, metadata)
    SELECT 'clock_sync_failures', id, 'retention 7 år', jsonb_build_object('status', status)
    FROM public.clock_sync_failures WHERE created_at < now() - interval '7 years';
  DELETE FROM public.clock_sync_failures WHERE created_at < now() - interval '7 years';
  GET DIAGNOSTICS sync_count = ROW_COUNT;
  INSERT INTO public.retention_log(table_name, row_id, retention_reason)
    SELECT 'pnr_access_log', id, 'retention 2 år'
    FROM public.pnr_access_log WHERE created_at < now() - interval '2 years';
  DELETE FROM public.pnr_access_log WHERE created_at < now() - interval '2 years';
  GET DIAGNOSTICS pnr_count = ROW_COUNT;
  RETURN jsonb_build_object('clock_sync_failures', sync_count, 'pnr_access_log', pnr_count);
END;
$$;
REVOKE ALL ON FUNCTION public.purge_clock_retention() FROM public, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.purge_clock_retention() TO service_role;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_publication_rel pr JOIN pg_class c ON c.oid = pr.prrelid JOIN pg_publication p ON p.oid = pr.prpubid WHERE p.pubname = 'supabase_realtime' AND c.relname = 'time_entries') THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.time_entries;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_publication_rel pr JOIN pg_class c ON c.oid = pr.prrelid JOIN pg_publication p ON p.oid = pr.prpubid WHERE p.pubname = 'supabase_realtime' AND c.relname = 'attestations') THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.attestations;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_publication_rel pr JOIN pg_class c ON c.oid = pr.prrelid JOIN pg_publication p ON p.oid = pr.prpubid WHERE p.pubname = 'supabase_realtime' AND c.relname = 'clock_sync_failures') THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.clock_sync_failures;
  END IF;
END $$;

SELECT cron.schedule('clock-retention-daily', '20 3 * * *', $$SELECT public.purge_clock_retention();$$)
WHERE NOT EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'clock-retention-daily');
