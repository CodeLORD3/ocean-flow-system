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
