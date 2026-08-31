-- Personalmodul: kompletterande datagrund 2026-08-31

CREATE TABLE IF NOT EXISTS public.staffing_needs (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  store_id UUID NOT NULL REFERENCES public.stores(id) ON DELETE CASCADE,
  date DATE NOT NULL,
  required_count INTEGER NOT NULL DEFAULT 0,
  note TEXT,
  created_by UUID,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (store_id, date)
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.staffing_needs TO authenticated;
GRANT ALL ON public.staffing_needs TO service_role;
ALTER TABLE public.staffing_needs ENABLE ROW LEVEL SECURITY;
CREATE POLICY "staffing needs read" ON public.staffing_needs FOR SELECT TO authenticated USING (true);
CREATE POLICY "staffing needs manage" ON public.staffing_needs FOR ALL TO authenticated
  USING (public.has_role(auth.uid(),'admin') OR public.has_role(auth.uid(),'platform_admin') OR public.has_role(auth.uid(),'company_admin') OR public.has_role(auth.uid(),'store_manager'))
  WITH CHECK (public.has_role(auth.uid(),'admin') OR public.has_role(auth.uid(),'platform_admin') OR public.has_role(auth.uid(),'company_admin') OR public.has_role(auth.uid(),'store_manager'));
CREATE INDEX IF NOT EXISTS staffing_needs_store_date_idx ON public.staffing_needs(store_id, date);
DROP TRIGGER IF EXISTS staffing_needs_updated_at ON public.staffing_needs;
CREATE TRIGGER staffing_needs_updated_at BEFORE UPDATE ON public.staffing_needs FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE TABLE IF NOT EXISTS public.employee_day_flags (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  employee_id UUID NOT NULL,
  date DATE NOT NULL,
  comment TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'open' CHECK (status IN ('open','acknowledged','resolved')),
  created_by UUID,
  acknowledged_by UUID,
  acknowledged_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.employee_day_flags TO authenticated;
GRANT ALL ON public.employee_day_flags TO service_role;
ALTER TABLE public.employee_day_flags ENABLE ROW LEVEL SECURITY;
CREATE POLICY "day flags read own or manager" ON public.employee_day_flags FOR SELECT TO authenticated
  USING (public.employee_is_self(employee_id) OR public.can_see_employee(employee_id));
CREATE POLICY "day flags create own" ON public.employee_day_flags FOR INSERT TO authenticated
  WITH CHECK (public.employee_is_self(employee_id));
CREATE POLICY "day flags manage" ON public.employee_day_flags FOR UPDATE TO authenticated
  USING (public.can_see_employee(employee_id) AND public.is_staff_manager())
  WITH CHECK (public.can_see_employee(employee_id) AND public.is_staff_manager());
CREATE INDEX IF NOT EXISTS employee_day_flags_employee_date_idx ON public.employee_day_flags(employee_id, date);
DROP TRIGGER IF EXISTS employee_day_flags_updated_at ON public.employee_day_flags;
CREATE TRIGGER employee_day_flags_updated_at BEFORE UPDATE ON public.employee_day_flags FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE OR REPLACE FUNCTION public.preliminar_passkostnad(_employee_id UUID, _month DATE, _hypothetical_minutes INTEGER DEFAULT 0)
RETURNS TABLE (employee_id UUID, month DATE, current_minutes INTEGER, hypothetical_minutes INTEGER, current_pay NUMERIC, hypothetical_pay NUMERIC, current_employer_fee NUMERIC, hypothetical_employer_fee NUMERIC, crosses_youth_threshold BOOLEAN, extra_cost NUMERIC, ar_preliminar BOOLEAN)
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_month_start DATE := date_trunc('month', _month)::date;
  v_month_end DATE := (date_trunc('month', _month) + interval '1 month - 1 day')::date;
  v_rate NUMERIC;
  v_monthly NUMERIC;
  v_birth DATE;
  v_current_minutes INTEGER;
  v_current_pay NUMERIC;
  v_hyp_pay NUMERIC;
  v_current_fee_rate NUMERIC;
  v_hyp_fee_rate NUMERIC;
BEGIN
  SELECT e.birth_date INTO v_birth FROM public.employees e WHERE e.id = _employee_id;
  SELECT COALESCE(em.hourly_rate, em.monthly_salary / 165.0), em.monthly_salary INTO v_rate, v_monthly
    FROM public.employments em WHERE em.employee_id = _employee_id AND em.is_active ORDER BY em.start_date DESC NULLS LAST LIMIT 1;
  SELECT COALESCE(SUM(COALESCE(a.approved_minutes, NULLIF(a.computed->>'minutes','')::int, 0)),0)::int
    INTO v_current_minutes FROM public.attestations a WHERE a.employee_id = _employee_id AND a.date BETWEEN v_month_start AND v_month_end;
  v_current_pay := COALESCE(v_current_minutes,0) * COALESCE(v_rate,0) / 60.0;
  v_hyp_pay := (COALESCE(v_current_minutes,0) + GREATEST(COALESCE(_hypothetical_minutes,0),0)) * COALESCE(v_rate,0) / 60.0;
  v_current_fee_rate := CASE WHEN v_birth IS NOT NULL AND (EXTRACT(YEAR FROM v_month_start)::int - EXTRACT(YEAR FROM v_birth)::int) BETWEEN 15 AND 18 THEN 0.0 WHEN v_birth IS NOT NULL AND (EXTRACT(YEAR FROM v_month_start)::int - EXTRACT(YEAR FROM v_birth)::int) < 23 THEN 0.2081 ELSE 0.3142 END;
  v_hyp_fee_rate := CASE WHEN v_birth IS NOT NULL AND (EXTRACT(YEAR FROM v_month_start)::int - EXTRACT(YEAR FROM v_birth)::int) BETWEEN 15 AND 18 THEN 0.0 WHEN v_birth IS NOT NULL AND (EXTRACT(YEAR FROM v_month_start)::int - EXTRACT(YEAR FROM v_birth)::int) < 23 AND (v_hyp_pay <= 25000) THEN 0.2081 ELSE 0.3142 END;
  RETURN QUERY SELECT _employee_id, v_month_start, v_current_minutes, GREATEST(COALESCE(_hypothetical_minutes,0),0), ROUND(v_current_pay,2), ROUND(v_hyp_pay,2), ROUND(v_current_pay*v_current_fee_rate,2), ROUND(v_hyp_pay*v_hyp_fee_rate,2), (v_current_pay <= 25000 AND v_hyp_pay > 25000), ROUND((v_hyp_pay + v_hyp_pay*v_hyp_fee_rate) - (v_current_pay + v_current_pay*v_current_fee_rate),2), true;
END; $$;
GRANT EXECUTE ON FUNCTION public.preliminar_passkostnad(UUID, DATE, INTEGER) TO authenticated;

CREATE OR REPLACE FUNCTION public.clock_code_hash(_code text)
RETURNS text LANGUAGE sql IMMUTABLE SET search_path = public, extensions AS $$
  SELECT encode(extensions.digest('CLOCK:' || upper(regexp_replace(coalesce(_code,''), '[^A-Z0-9]', '', 'g')), 'sha256'), 'hex')
$$;

CREATE OR REPLACE FUNCTION public.clock_station_create(_name text, _store_id uuid, _legal_entity_id text DEFAULT NULL, _profile jsonb DEFAULT NULL)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, extensions AS $$
DECLARE v_code text; v_id uuid; v_entity text; v_alphabet text := '2346789ACDEFGHJKMNPQRTVWXY'; v_i integer;
BEGIN
  IF NOT (public.is_platform_admin(auth.uid()) OR public.has_role(auth.uid(),'admin')) THEN RAISE EXCEPTION 'Behörighet saknas'; END IF;
  LOOP
    v_code := '';
    FOR v_i IN 1..12 LOOP v_code := v_code || substr(v_alphabet, 1 + floor(random()*length(v_alphabet))::int, 1); IF v_i IN (4,8) THEN v_code := v_code || '-'; END IF; END LOOP;
    EXIT WHEN NOT EXISTS (SELECT 1 FROM public.clock_stations WHERE activation_code_hash = public.clock_code_hash(v_code));
  END LOOP;
  v_entity := coalesce(_legal_entity_id, (SELECT legal_entity_id FROM public.stores WHERE id = _store_id));
  INSERT INTO public.clock_stations (name, store_id, legal_entity_id, activation_code_hash, activation_code_hint, profile)
  VALUES (_name, _store_id, v_entity, public.clock_code_hash(v_code), right(replace(v_code,'-',''),4), coalesce(_profile, '{}'::jsonb)) RETURNING id INTO v_id;
  RETURN jsonb_build_object('station_id', v_id, 'activation_code', v_code);
END; $$;

CREATE OR REPLACE FUNCTION public.clock_station_rotate_code(_station_id uuid)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, extensions AS $$
DECLARE v_code text; v_alphabet text := '2346789ACDEFGHJKMNPQRTVWXY'; v_i integer;
BEGIN
  IF NOT (public.is_platform_admin(auth.uid()) OR public.has_role(auth.uid(),'admin')) THEN RAISE EXCEPTION 'Behörighet saknas'; END IF;
  LOOP
    v_code := '';
    FOR v_i IN 1..12 LOOP v_code := v_code || substr(v_alphabet, 1 + floor(random()*length(v_alphabet))::int, 1); IF v_i IN (4,8) THEN v_code := v_code || '-'; END IF; END LOOP;
    EXIT WHEN NOT EXISTS (SELECT 1 FROM public.clock_stations WHERE activation_code_hash = public.clock_code_hash(v_code));
  END LOOP;
  UPDATE public.clock_stations SET activation_code_hash = public.clock_code_hash(v_code), activation_code_hint = right(replace(v_code,'-',''),4), code_rotated_at = now(), status = 'active' WHERE id = _station_id;
  DELETE FROM public.clock_station_sessions WHERE station_id = _station_id;
  RETURN jsonb_build_object('station_id', _station_id, 'activation_code', v_code);
END; $$;
GRANT EXECUTE ON FUNCTION public.clock_station_create(text, uuid, text, jsonb) TO authenticated;
GRANT EXECUTE ON FUNCTION public.clock_station_rotate_code(uuid) TO authenticated;

CREATE OR REPLACE FUNCTION public.absence_generate_days(_request_id UUID)
RETURNS INTEGER LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE r RECORD; d DATE; n INTEGER := 0; s RECORD; v_last DATE;
BEGIN
  SELECT * INTO r FROM public.absence_requests WHERE id = _request_id;
  IF r.id IS NULL THEN RETURN 0; END IF;
  v_last := COALESCE(r.end_date, r.start_date);
  DELETE FROM public.absence_days WHERE request_id = _request_id AND is_overridden = false;
  d := r.start_date;
  WHILE d <= v_last LOOP
    SELECT sh.id AS shift_id, (EXTRACT(EPOCH FROM ((d + CASE WHEN sh.end_time <= sh.start_time THEN 1 ELSE 0 END) + sh.end_time - (d + sh.start_time)))/3600.0) - COALESCE(sh.break_minutes,0)/60.0 AS shift_hours INTO s FROM public.shifts sh WHERE sh.employee_id = r.employee_id AND sh.date = d ORDER BY sh.start_time LIMIT 1;
    INSERT INTO public.absence_days (request_id, employee_id, date, extent_pct, shift_id, hours) VALUES (_request_id, r.employee_id, d, COALESCE(r.extent_pct,100), s.shift_id, CASE WHEN s.shift_hours IS NOT NULL THEN ROUND(s.shift_hours * COALESCE(r.extent_pct,100)/100.0,2) ELSE NULL END) ON CONFLICT (request_id,date) DO NOTHING;
    n := n + 1; d := d + 1;
  END LOOP;
  RETURN n;
END; $$;
REVOKE EXECUTE ON FUNCTION public.absence_generate_days(UUID) FROM anon, authenticated;