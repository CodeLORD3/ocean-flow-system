-- ============ A. Datamodell: stämpelklockan ============

CREATE TABLE public.clock_stations (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  name text NOT NULL,
  store_id uuid REFERENCES public.stores(id) ON DELETE SET NULL,
  legal_entity_id text,
  activation_code_hash text NOT NULL,
  activation_code_hint text,
  code_rotated_at timestamptz NOT NULL DEFAULT now(),
  status text NOT NULL DEFAULT 'active' CHECK (status IN ('active','revoked')),
  last_seen_at timestamptz,
  profile jsonb NOT NULL DEFAULT jsonb_build_object(
    'rounding', jsonb_build_object('mode','none','step',5,'direction','nearest'),
    'break', jsonb_build_object('mode','manual','auto_after_hours',6,'auto_minutes',30),
    'tolerance_minutes', 7,
    'geofence', false
  ),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.clock_stations TO authenticated;
GRANT ALL ON public.clock_stations TO service_role;
ALTER TABLE public.clock_stations ENABLE ROW LEVEL SECURITY;

CREATE POLICY "clock_stations_read" ON public.clock_stations FOR SELECT TO authenticated
USING (public.is_platform_admin(auth.uid()) OR public.has_role(auth.uid(),'admin') OR public.can_see_store(store_id));
CREATE POLICY "clock_stations_admin_write" ON public.clock_stations FOR ALL TO authenticated
USING (public.is_platform_admin(auth.uid()) OR public.has_role(auth.uid(),'admin'))
WITH CHECK (public.is_platform_admin(auth.uid()) OR public.has_role(auth.uid(),'admin'));

CREATE TRIGGER clock_stations_updated_at BEFORE UPDATE ON public.clock_stations
FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- Stationssessioner: endast serversidan
CREATE TABLE public.clock_station_sessions (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  station_id uuid NOT NULL REFERENCES public.clock_stations(id) ON DELETE CASCADE,
  token_hash text NOT NULL UNIQUE,
  expires_at timestamptz NOT NULL,
  last_used_at timestamptz NOT NULL DEFAULT now(),
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT ALL ON public.clock_station_sessions TO service_role;
ALTER TABLE public.clock_station_sessions ENABLE ROW LEVEL SECURITY;
CREATE POLICY "clock_sessions_service_only" ON public.clock_station_sessions FOR ALL TO service_role USING (true) WITH CHECK (true);

-- Personalliggarjournalen: append-only
CREATE TABLE public.time_entries (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  employee_id uuid NOT NULL REFERENCES public.employees(id) ON DELETE RESTRICT,
  station_id uuid REFERENCES public.clock_stations(id) ON DELETE SET NULL,
  store_id uuid REFERENCES public.stores(id) ON DELETE SET NULL,
  legal_entity_id text,
  type text NOT NULL CHECK (type IN ('in','ut','rast_start','rast_slut')),
  occurred_at timestamptz NOT NULL,
  registered_at timestamptz NOT NULL DEFAULT now(),
  source text NOT NULL DEFAULT 'clock' CHECK (source IN ('clock','manual','correction','import')),
  corrects_entry_id uuid REFERENCES public.time_entries(id) ON DELETE RESTRICT,
  correction_kind text CHECK (correction_kind IN ('replace','void')),
  created_by uuid,
  note text,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX time_entries_employee_day_idx ON public.time_entries (employee_id, occurred_at DESC);
CREATE INDEX time_entries_store_day_idx ON public.time_entries (store_id, occurred_at DESC);
CREATE INDEX time_entries_corrects_idx ON public.time_entries (corrects_entry_id);

GRANT SELECT, INSERT ON public.time_entries TO authenticated;
GRANT SELECT, INSERT ON public.time_entries TO service_role;
ALTER TABLE public.time_entries ENABLE ROW LEVEL SECURITY;

CREATE POLICY "time_entries_read" ON public.time_entries FOR SELECT TO authenticated
USING (
  public.is_platform_admin(auth.uid())
  OR public.has_role(auth.uid(),'admin')
  OR public.can_see_store(store_id)
  OR public.employee_is_self(employee_id)
);
CREATE POLICY "time_entries_manual_insert" ON public.time_entries FOR INSERT TO authenticated
WITH CHECK (
  source IN ('manual','correction')
  AND (
    public.is_platform_admin(auth.uid())
    OR public.has_role(auth.uid(),'admin')
    OR (public.has_role(auth.uid(),'store_manager') AND public.can_see_store(store_id))
  )
);

-- Append-only: blockera UPDATE och DELETE för alla roller
CREATE OR REPLACE FUNCTION public.time_entries_block_mutation()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  RAISE EXCEPTION 'time_entries är append-only (personalliggarjournal): % är inte tillåtet. Skapa en rättelserad med source=''correction''.', TG_OP;
END;
$$;

CREATE TRIGGER time_entries_no_update BEFORE UPDATE ON public.time_entries
FOR EACH ROW EXECUTE FUNCTION public.time_entries_block_mutation();
CREATE TRIGGER time_entries_no_delete BEFORE DELETE ON public.time_entries
FOR EACH ROW EXECUTE FUNCTION public.time_entries_block_mutation();

-- Härled bolag/butik från stationen när de inte anges
CREATE OR REPLACE FUNCTION public.time_entries_fill_scope()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  IF NEW.store_id IS NULL AND NEW.station_id IS NOT NULL THEN
    SELECT store_id, legal_entity_id INTO NEW.store_id, NEW.legal_entity_id
    FROM public.clock_stations WHERE id = NEW.station_id;
  END IF;
  IF NEW.legal_entity_id IS NULL AND NEW.store_id IS NOT NULL THEN
    SELECT legal_entity_id INTO NEW.legal_entity_id FROM public.stores WHERE id = NEW.store_id;
  END IF;
  IF NEW.created_by IS NULL THEN
    NEW.created_by := auth.uid();
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER time_entries_fill_scope_trg BEFORE INSERT ON public.time_entries
FOR EACH ROW EXECUTE FUNCTION public.time_entries_fill_scope();

-- Väntande registreringar
CREATE TABLE public.clock_pending_registrations (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  pnr_hash text,
  pnr_masked text,
  identifier_masked text,
  station_id uuid REFERENCES public.clock_stations(id) ON DELETE SET NULL,
  store_id uuid REFERENCES public.stores(id) ON DELETE SET NULL,
  legal_entity_id text,
  stated_name text,
  occurred_at timestamptz NOT NULL DEFAULT now(),
  status text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','approved','rejected')),
  employee_id uuid REFERENCES public.employees(id) ON DELETE SET NULL,
  handled_by uuid,
  handled_at timestamptz,
  attempts integer NOT NULL DEFAULT 1,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX clock_pending_unique_pending ON public.clock_pending_registrations (pnr_hash) WHERE status = 'pending' AND pnr_hash IS NOT NULL;

GRANT SELECT, UPDATE ON public.clock_pending_registrations TO authenticated;
GRANT ALL ON public.clock_pending_registrations TO service_role;
ALTER TABLE public.clock_pending_registrations ENABLE ROW LEVEL SECURITY;

CREATE POLICY "clock_pending_read" ON public.clock_pending_registrations FOR SELECT TO authenticated
USING (public.is_platform_admin(auth.uid()) OR public.has_role(auth.uid(),'admin') OR public.can_see_store(store_id));
CREATE POLICY "clock_pending_admin_update" ON public.clock_pending_registrations FOR UPDATE TO authenticated
USING (public.is_platform_admin(auth.uid()) OR public.has_role(auth.uid(),'admin'))
WITH CHECK (public.is_platform_admin(auth.uid()) OR public.has_role(auth.uid(),'admin'));

CREATE TRIGGER clock_pending_updated_at BEFORE UPDATE ON public.clock_pending_registrations
FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- Rate limit per station
CREATE TABLE public.clock_rate_limits (
  station_id uuid NOT NULL,
  minute_bucket timestamptz NOT NULL,
  attempts integer NOT NULL DEFAULT 0,
  PRIMARY KEY (station_id, minute_bucket)
);
GRANT ALL ON public.clock_rate_limits TO service_role;
ALTER TABLE public.clock_rate_limits ENABLE ROW LEVEL SECURITY;
CREATE POLICY "clock_rate_limits_service_only" ON public.clock_rate_limits FOR ALL TO service_role USING (true) WITH CHECK (true);

-- ============ Stationskoder: skapa / rotera / återkalla ============

CREATE OR REPLACE FUNCTION public.clock_code_hash(_code text)
RETURNS text
LANGUAGE sql
IMMUTABLE
SET search_path = public, extensions
AS $$
  SELECT encode(extensions.digest('CLOCK:' || upper(regexp_replace(coalesce(_code,''), '\s', '', 'g')), 'sha256'), 'hex')
$$;

CREATE OR REPLACE FUNCTION public.clock_station_create(_name text, _store_id uuid, _legal_entity_id text DEFAULT NULL, _profile jsonb DEFAULT NULL)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, extensions
AS $$
DECLARE
  v_code text;
  v_id uuid;
  v_entity text;
BEGIN
  IF NOT (public.is_platform_admin(auth.uid()) OR public.has_role(auth.uid(),'admin')) THEN
    RAISE EXCEPTION 'Behörighet saknas';
  END IF;
  v_code := upper(encode(extensions.gen_random_bytes(6), 'hex'));
  v_entity := coalesce(_legal_entity_id, (SELECT legal_entity_id FROM public.stores WHERE id = _store_id));
  INSERT INTO public.clock_stations (name, store_id, legal_entity_id, activation_code_hash, activation_code_hint, profile)
  VALUES (_name, _store_id, v_entity, public.clock_code_hash(v_code), right(v_code, 4),
          coalesce(_profile, (SELECT column_default::jsonb FROM (SELECT NULL::jsonb AS column_default) x WHERE false)))
  RETURNING id INTO v_id;
  IF _profile IS NOT NULL THEN
    -- behåll defaults för nycklar som inte skickats
    UPDATE public.clock_stations SET profile = profile || _profile WHERE id = v_id;
  END IF;
  RETURN jsonb_build_object('station_id', v_id, 'activation_code', v_code);
END;
$$;

CREATE OR REPLACE FUNCTION public.clock_station_rotate_code(_station_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, extensions
AS $$
DECLARE v_code text;
BEGIN
  IF NOT (public.is_platform_admin(auth.uid()) OR public.has_role(auth.uid(),'admin')) THEN
    RAISE EXCEPTION 'Behörighet saknas';
  END IF;
  v_code := upper(encode(extensions.gen_random_bytes(6), 'hex'));
  UPDATE public.clock_stations
     SET activation_code_hash = public.clock_code_hash(v_code),
         activation_code_hint = right(v_code, 4),
         code_rotated_at = now(),
         status = 'active'
   WHERE id = _station_id;
  -- gamla sessioner slutar gälla omedelbart
  DELETE FROM public.clock_station_sessions WHERE station_id = _station_id;
  RETURN jsonb_build_object('station_id', _station_id, 'activation_code', v_code);
END;
$$;

CREATE OR REPLACE FUNCTION public.clock_station_revoke(_station_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NOT (public.is_platform_admin(auth.uid()) OR public.has_role(auth.uid(),'admin')) THEN
    RAISE EXCEPTION 'Behörighet saknas';
  END IF;
  UPDATE public.clock_stations SET status = 'revoked' WHERE id = _station_id;
  DELETE FROM public.clock_station_sessions WHERE station_id = _station_id;
END;
$$;

REVOKE ALL ON FUNCTION public.clock_code_hash(text) FROM anon, authenticated;
GRANT EXECUTE ON FUNCTION public.clock_station_create(text, uuid, text, jsonb) TO authenticated;
GRANT EXECUTE ON FUNCTION public.clock_station_rotate_code(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.clock_station_revoke(uuid) TO authenticated;