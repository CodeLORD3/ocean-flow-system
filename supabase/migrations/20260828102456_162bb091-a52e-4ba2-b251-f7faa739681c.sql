-- =========================================================
-- ETAPP 4: Frånvaro, semester, saldon & notiser
-- =========================================================

-- ---------- absence_types ----------
CREATE TABLE public.absence_types (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  code text NOT NULL UNIQUE,
  name text NOT NULL,
  requires_approval boolean NOT NULL DEFAULT true,
  affects_vacation_balance boolean NOT NULL DEFAULT false,
  is_vacation_earning boolean NOT NULL DEFAULT false,
  vacation_earning_max_days integer,
  is_sick boolean NOT NULL DEFAULT false,
  color_token text NOT NULL DEFAULT 'muted',
  sort_order integer NOT NULL DEFAULT 100,
  is_active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT ON public.absence_types TO authenticated;
GRANT ALL ON public.absence_types TO service_role;
ALTER TABLE public.absence_types ENABLE ROW LEVEL SECURITY;
CREATE POLICY "absence_types_read" ON public.absence_types
  FOR SELECT TO authenticated USING (true);
CREATE POLICY "absence_types_admin_write" ON public.absence_types
  FOR ALL TO authenticated
  USING (public.has_role(auth.uid(),'admin') OR public.is_platform_admin(auth.uid()))
  WITH CHECK (public.has_role(auth.uid(),'admin') OR public.is_platform_admin(auth.uid()));
GRANT INSERT, UPDATE, DELETE ON public.absence_types TO authenticated;

INSERT INTO public.absence_types (code, name, requires_approval, affects_vacation_balance, is_vacation_earning, vacation_earning_max_days, is_sick, color_token, sort_order) VALUES
  ('semester','Semester', true,  true,  false, NULL, false, 'accent',  10),
  ('sjuk','Sjuk',         false, false, true,  180,  true,  'warning', 20),
  ('vab','VAB',           false, false, true,  120,  false, 'info',    30),
  ('komp','Komp',         true,  false, false, NULL, false, 'success', 40),
  ('tjanstledig','Tjänstledig', true, false, false, NULL, false, 'muted', 50),
  ('foraldraledig','Föräldraledig', true, false, true, 120, false, 'info', 60),
  ('permission','Permission', true, false, true, NULL, false, 'muted', 70);

-- ---------- absence_policies (regler i data) ----------
CREATE TABLE public.absence_policies (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  legal_entity_id text REFERENCES public.legal_entities(legal_entity_id) ON DELETE CASCADE,
  default_vacation_days integer NOT NULL DEFAULT 25,
  max_saved_years integer NOT NULL DEFAULT 5,
  max_saved_days_per_year integer NOT NULL DEFAULT 5,
  sick_vacation_earning_days integer NOT NULL DEFAULT 180,
  vab_vacation_earning boolean NOT NULL DEFAULT true,
  karens_enabled boolean NOT NULL DEFAULT true,
  karens_warning_count integer NOT NULL DEFAULT 10,
  reinjury_window_days integer NOT NULL DEFAULT 5,
  fk_report_day integer NOT NULL DEFAULT 15,
  las_warning_days_before integer NOT NULL DEFAULT 60,
  notes text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (legal_entity_id)
);
GRANT SELECT ON public.absence_policies TO authenticated;
GRANT INSERT, UPDATE, DELETE ON public.absence_policies TO authenticated;
GRANT ALL ON public.absence_policies TO service_role;
ALTER TABLE public.absence_policies ENABLE ROW LEVEL SECURITY;
CREATE POLICY "absence_policies_read" ON public.absence_policies
  FOR SELECT TO authenticated USING (true);
CREATE POLICY "absence_policies_admin_write" ON public.absence_policies
  FOR ALL TO authenticated
  USING (public.has_role(auth.uid(),'admin') OR public.is_platform_admin(auth.uid()))
  WITH CHECK (public.has_role(auth.uid(),'admin') OR public.is_platform_admin(auth.uid()));

-- global default policy (Handels-benchmark som förifyllda värden)
INSERT INTO public.absence_policies (legal_entity_id, notes) VALUES (NULL, 'Global standard (Handels-benchmark)');

-- ---------- absence_requests ----------
CREATE TABLE public.absence_requests (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  employee_id uuid NOT NULL REFERENCES public.employees(id) ON DELETE CASCADE,
  absence_type_id uuid NOT NULL REFERENCES public.absence_types(id),
  store_id uuid REFERENCES public.stores(id) ON DELETE SET NULL,
  legal_entity_id text REFERENCES public.legal_entities(legal_entity_id) ON DELETE SET NULL,
  start_date date NOT NULL,
  end_date date,
  extent_pct numeric NOT NULL DEFAULT 100 CHECK (extent_pct > 0 AND extent_pct <= 100),
  note text,
  status text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','approved','rejected','cancelled')),
  days_count numeric,
  decided_by uuid,
  decided_at timestamptz,
  decision_note text,
  created_by uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CHECK (end_date IS NULL OR end_date >= start_date)
);
CREATE INDEX idx_absence_requests_employee ON public.absence_requests(employee_id, start_date);
CREATE INDEX idx_absence_requests_status ON public.absence_requests(status, start_date);
CREATE INDEX idx_absence_requests_store ON public.absence_requests(store_id, start_date);

GRANT SELECT, INSERT, UPDATE ON public.absence_requests TO authenticated;
GRANT ALL ON public.absence_requests TO service_role;
ALTER TABLE public.absence_requests ENABLE ROW LEVEL SECURITY;

CREATE POLICY "absence_requests_select" ON public.absence_requests
  FOR SELECT TO authenticated
  USING (
    public.employee_is_self(employee_id)
    OR public.can_see_employee(employee_id)
  );
CREATE POLICY "absence_requests_insert_own" ON public.absence_requests
  FOR INSERT TO authenticated
  WITH CHECK (
    (public.employee_is_self(employee_id) AND status = 'pending')
    OR public.can_see_employee(employee_id)
  );
CREATE POLICY "absence_requests_update" ON public.absence_requests
  FOR UPDATE TO authenticated
  USING (
    (public.employee_is_self(employee_id) AND status IN ('pending','approved'))
    OR public.can_see_employee(employee_id)
  )
  WITH CHECK (
    (public.employee_is_self(employee_id) AND status IN ('pending','cancelled'))
    OR public.can_see_employee(employee_id)
  );

-- historiktrigger (som shift_history)
CREATE TABLE public.absence_request_history (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  absence_request_id uuid NOT NULL REFERENCES public.absence_requests(id) ON DELETE CASCADE,
  action text NOT NULL,
  changes jsonb,
  changed_by uuid,
  changed_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX idx_absence_request_history_req ON public.absence_request_history(absence_request_id, changed_at DESC);
GRANT SELECT ON public.absence_request_history TO authenticated;
GRANT ALL ON public.absence_request_history TO service_role;
ALTER TABLE public.absence_request_history ENABLE ROW LEVEL SECURITY;
CREATE POLICY "absence_request_history_select" ON public.absence_request_history
  FOR SELECT TO authenticated
  USING (EXISTS (
    SELECT 1 FROM public.absence_requests r
    WHERE r.id = absence_request_id
      AND (public.employee_is_self(r.employee_id) OR public.can_see_employee(r.employee_id))
  ));

CREATE OR REPLACE FUNCTION public.log_absence_request_change()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF TG_OP = 'INSERT' THEN
    INSERT INTO public.absence_request_history (absence_request_id, action, changes, changed_by)
    VALUES (NEW.id, 'created', to_jsonb(NEW), auth.uid());
    RETURN NEW;
  ELSIF TG_OP = 'UPDATE' THEN
    INSERT INTO public.absence_request_history (absence_request_id, action, changes, changed_by)
    VALUES (NEW.id,
            CASE WHEN NEW.status <> OLD.status THEN 'status:'||NEW.status ELSE 'updated' END,
            jsonb_build_object('before', to_jsonb(OLD), 'after', to_jsonb(NEW)),
            auth.uid());
    RETURN NEW;
  END IF;
  RETURN NEW;
END;
$$;
CREATE TRIGGER trg_absence_request_history
  AFTER INSERT OR UPDATE ON public.absence_requests
  FOR EACH ROW EXECUTE FUNCTION public.log_absence_request_change();

CREATE OR REPLACE FUNCTION public.absence_requests_touch()
RETURNS trigger LANGUAGE plpgsql SET search_path = public AS $$
BEGIN NEW.updated_at = now(); RETURN NEW; END; $$;
CREATE TRIGGER trg_absence_requests_touch BEFORE UPDATE ON public.absence_requests
  FOR EACH ROW EXECUTE FUNCTION public.absence_requests_touch();

-- ---------- vacation_balances ----------
CREATE TABLE public.vacation_balances (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  employee_id uuid NOT NULL REFERENCES public.employees(id) ON DELETE CASCADE,
  vacation_year integer NOT NULL,           -- år då semesteråret startar (1 april)
  entitled_days numeric NOT NULL DEFAULT 25,
  earned_days numeric NOT NULL DEFAULT 0,
  used_days numeric NOT NULL DEFAULT 0,
  saved_days numeric NOT NULL DEFAULT 0,
  expires_at date,
  expiry_flagged boolean NOT NULL DEFAULT false,
  closed_at timestamptz,
  manual_adjustment_days numeric NOT NULL DEFAULT 0,
  manual_adjustment_reason text,
  adjusted_by uuid,
  adjusted_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (employee_id, vacation_year)
);
GRANT SELECT ON public.vacation_balances TO authenticated;
GRANT INSERT, UPDATE ON public.vacation_balances TO authenticated;
GRANT ALL ON public.vacation_balances TO service_role;
ALTER TABLE public.vacation_balances ENABLE ROW LEVEL SECURITY;
CREATE POLICY "vacation_balances_select" ON public.vacation_balances
  FOR SELECT TO authenticated
  USING (public.employee_is_self(employee_id) OR public.can_see_employee(employee_id));
CREATE POLICY "vacation_balances_admin_write" ON public.vacation_balances
  FOR ALL TO authenticated
  USING (public.has_role(auth.uid(),'admin') OR public.is_platform_admin(auth.uid()))
  WITH CHECK (public.has_role(auth.uid(),'admin') OR public.is_platform_admin(auth.uid()));

CREATE TABLE public.vacation_balance_adjustments (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  vacation_balance_id uuid NOT NULL REFERENCES public.vacation_balances(id) ON DELETE CASCADE,
  delta_days numeric NOT NULL,
  reason text NOT NULL,
  created_by uuid,
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT ON public.vacation_balance_adjustments TO authenticated;
GRANT ALL ON public.vacation_balance_adjustments TO service_role;
ALTER TABLE public.vacation_balance_adjustments ENABLE ROW LEVEL SECURITY;
CREATE POLICY "vac_adj_select" ON public.vacation_balance_adjustments
  FOR SELECT TO authenticated
  USING (EXISTS (SELECT 1 FROM public.vacation_balances b WHERE b.id = vacation_balance_id
    AND (public.employee_is_self(b.employee_id) OR public.can_see_employee(b.employee_id))));
CREATE POLICY "vac_adj_admin_insert" ON public.vacation_balance_adjustments
  FOR INSERT TO authenticated
  WITH CHECK (public.has_role(auth.uid(),'admin') OR public.is_platform_admin(auth.uid()));

-- ---------- comp_balances ----------
CREATE TABLE public.comp_balances (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  employee_id uuid NOT NULL REFERENCES public.employees(id) ON DELETE CASCADE UNIQUE,
  balance_minutes integer NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT ON public.comp_balances TO authenticated;
GRANT ALL ON public.comp_balances TO service_role;
ALTER TABLE public.comp_balances ENABLE ROW LEVEL SECURITY;
CREATE POLICY "comp_balances_select" ON public.comp_balances
  FOR SELECT TO authenticated
  USING (public.employee_is_self(employee_id) OR public.can_see_employee(employee_id));

CREATE TABLE public.comp_balance_txns (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  employee_id uuid NOT NULL REFERENCES public.employees(id) ON DELETE CASCADE,
  delta_minutes integer NOT NULL,
  reason text NOT NULL,
  source text NOT NULL DEFAULT 'manual',
  reference_id uuid,
  created_by uuid,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX idx_comp_txns_employee ON public.comp_balance_txns(employee_id, created_at DESC);
GRANT SELECT ON public.comp_balance_txns TO authenticated;
GRANT ALL ON public.comp_balance_txns TO service_role;
ALTER TABLE public.comp_balance_txns ENABLE ROW LEVEL SECURITY;
CREATE POLICY "comp_txns_select" ON public.comp_balance_txns
  FOR SELECT TO authenticated
  USING (public.employee_is_self(employee_id) OR public.can_see_employee(employee_id));

CREATE OR REPLACE FUNCTION public.apply_comp_txn()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  INSERT INTO public.comp_balances (employee_id, balance_minutes)
  VALUES (NEW.employee_id, NEW.delta_minutes)
  ON CONFLICT (employee_id) DO UPDATE
    SET balance_minutes = public.comp_balances.balance_minutes + NEW.delta_minutes,
        updated_at = now();
  RETURN NEW;
END; $$;
CREATE TRIGGER trg_apply_comp_txn AFTER INSERT ON public.comp_balance_txns
  FOR EACH ROW EXECUTE FUNCTION public.apply_comp_txn();

-- manuell komp-justering (chef/admin)
CREATE OR REPLACE FUNCTION public.comp_adjust(_employee_id uuid, _delta_minutes integer, _reason text)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE _bal integer;
BEGIN
  IF NOT (public.has_role(auth.uid(),'admin') OR public.is_platform_admin(auth.uid())
          OR public.is_staff_manager() OR public.can_see_employee(_employee_id)) THEN
    RAISE EXCEPTION 'Behörighet saknas för kompjustering';
  END IF;
  IF _reason IS NULL OR length(trim(_reason)) = 0 THEN
    RAISE EXCEPTION 'Skäl krävs för kompjustering';
  END IF;
  INSERT INTO public.comp_balance_txns (employee_id, delta_minutes, reason, source, created_by)
  VALUES (_employee_id, _delta_minutes, _reason, 'manual', auth.uid());
  SELECT balance_minutes INTO _bal FROM public.comp_balances WHERE employee_id = _employee_id;
  RETURN jsonb_build_object('ok', true, 'balance_minutes', _bal);
END; $$;
REVOKE ALL ON FUNCTION public.comp_adjust(uuid, integer, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.comp_adjust(uuid, integer, text) TO authenticated, service_role;

-- ---------- sick_periods ----------
CREATE TABLE public.sick_periods (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  employee_id uuid NOT NULL REFERENCES public.employees(id) ON DELETE CASCADE,
  first_day date NOT NULL,
  last_day date,
  karens_applied boolean NOT NULL DEFAULT true,
  reopened_count integer NOT NULL DEFAULT 0,
  fk_reminder_sent_at timestamptz,
  note text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX idx_sick_periods_employee ON public.sick_periods(employee_id, first_day DESC);
GRANT SELECT ON public.sick_periods TO authenticated;
GRANT ALL ON public.sick_periods TO service_role;
ALTER TABLE public.sick_periods ENABLE ROW LEVEL SECURITY;
CREATE POLICY "sick_periods_select" ON public.sick_periods
  FOR SELECT TO authenticated
  USING (public.employee_is_self(employee_id) OR public.can_see_employee(employee_id));

-- karensräknare senaste 12 mån
CREATE OR REPLACE FUNCTION public.sick_karens_count_12m(_employee_id uuid)
RETURNS integer LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT count(*)::int FROM public.sick_periods
  WHERE employee_id = _employee_id
    AND karens_applied
    AND first_day >= (current_date - interval '12 months')::date;
$$;
REVOKE ALL ON FUNCTION public.sick_karens_count_12m(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.sick_karens_count_12m(uuid) TO authenticated, service_role;

-- registrering av sjukfrånvaro med återinsjuknanderegel
CREATE OR REPLACE FUNCTION public.register_sick_period(_employee_id uuid, _first_day date, _last_day date DEFAULT NULL)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  _window integer;
  _prev public.sick_periods;
  _row public.sick_periods;
  _reopened boolean := false;
BEGIN
  IF NOT (public.employee_is_self(_employee_id) OR public.can_see_employee(_employee_id)
          OR public.has_role(auth.uid(),'admin') OR public.is_platform_admin(auth.uid())) THEN
    RAISE EXCEPTION 'Behörighet saknas';
  END IF;

  SELECT COALESCE(p.reinjury_window_days, 5) INTO _window
  FROM public.absence_policies p WHERE p.legal_entity_id IS NULL LIMIT 1;
  _window := COALESCE(_window, 5);

  -- pågående period?
  SELECT * INTO _prev FROM public.sick_periods
  WHERE employee_id = _employee_id AND last_day IS NULL
  ORDER BY first_day DESC LIMIT 1;

  IF _prev.id IS NOT NULL THEN
    RETURN jsonb_build_object('ok', true, 'period_id', _prev.id, 'reopened', false, 'karens_applied', _prev.karens_applied, 'note', 'pågående period');
  END IF;

  SELECT * INTO _prev FROM public.sick_periods
  WHERE employee_id = _employee_id AND last_day IS NOT NULL
    AND _first_day - last_day <= _window AND _first_day > last_day
  ORDER BY last_day DESC LIMIT 1;

  IF _prev.id IS NOT NULL THEN
    UPDATE public.sick_periods
      SET last_day = _last_day, reopened_count = reopened_count + 1, updated_at = now()
      WHERE id = _prev.id
      RETURNING * INTO _row;
    _reopened := true;
  ELSE
    INSERT INTO public.sick_periods (employee_id, first_day, last_day, karens_applied)
    VALUES (_employee_id, _first_day, _last_day, true)
    RETURNING * INTO _row;
  END IF;

  RETURN jsonb_build_object(
    'ok', true, 'period_id', _row.id, 'reopened', _reopened,
    'karens_applied', _row.karens_applied,
    'first_day', _row.first_day, 'last_day', _row.last_day,
    'karens_count_12m', public.sick_karens_count_12m(_employee_id)
  );
END; $$;
REVOKE ALL ON FUNCTION public.register_sick_period(uuid, date, date) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.register_sick_period(uuid, date, date) TO authenticated, service_role;

-- ---------- notiskö (utgående kanaler) ----------
CREATE TABLE public.hr_notifications (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  employee_id uuid REFERENCES public.employees(id) ON DELETE CASCADE,
  user_id uuid,
  recipient text,
  channel text NOT NULL CHECK (channel IN ('in_app','email','sms')),
  category text NOT NULL DEFAULT 'general',
  template_key text NOT NULL,
  payload jsonb NOT NULL DEFAULT '{}'::jsonb,
  body text,
  status text NOT NULL DEFAULT 'queued' CHECK (status IN ('queued','sent','failed','skipped')),
  attempts integer NOT NULL DEFAULT 0,
  next_attempt_at timestamptz,
  sent_at timestamptz,
  error text,
  dedupe_key text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX idx_hr_notifications_status ON public.hr_notifications(status, next_attempt_at);
CREATE INDEX idx_hr_notifications_employee ON public.hr_notifications(employee_id, created_at DESC);
CREATE UNIQUE INDEX idx_hr_notifications_dedupe ON public.hr_notifications(dedupe_key) WHERE dedupe_key IS NOT NULL;
GRANT SELECT ON public.hr_notifications TO authenticated;
GRANT ALL ON public.hr_notifications TO service_role;
ALTER TABLE public.hr_notifications ENABLE ROW LEVEL SECURITY;
CREATE POLICY "hr_notifications_select_own" ON public.hr_notifications
  FOR SELECT TO authenticated
  USING (
    user_id = auth.uid()
    OR (employee_id IS NOT NULL AND public.employee_is_self(employee_id))
    OR public.has_role(auth.uid(),'admin') OR public.is_platform_admin(auth.uid())
  );

CREATE TABLE public.hr_notification_preferences (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  employee_id uuid REFERENCES public.employees(id) ON DELETE CASCADE,
  legal_entity_id text REFERENCES public.legal_entities(legal_entity_id) ON DELETE CASCADE,
  category text NOT NULL,
  in_app boolean NOT NULL DEFAULT true,
  email boolean NOT NULL DEFAULT false,
  sms boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CHECK (employee_id IS NOT NULL OR legal_entity_id IS NOT NULL)
);
CREATE UNIQUE INDEX idx_hr_pref_employee ON public.hr_notification_preferences(employee_id, category) WHERE employee_id IS NOT NULL;
CREATE UNIQUE INDEX idx_hr_pref_entity ON public.hr_notification_preferences(legal_entity_id, category) WHERE employee_id IS NULL;
GRANT SELECT, INSERT, UPDATE ON public.hr_notification_preferences TO authenticated;
GRANT ALL ON public.hr_notification_preferences TO service_role;
ALTER TABLE public.hr_notification_preferences ENABLE ROW LEVEL SECURITY;
CREATE POLICY "hr_pref_select" ON public.hr_notification_preferences
  FOR SELECT TO authenticated
  USING (
    employee_id IS NULL
    OR public.employee_is_self(employee_id)
    OR public.can_see_employee(employee_id)
  );
CREATE POLICY "hr_pref_write_own" ON public.hr_notification_preferences
  FOR ALL TO authenticated
  USING (
    (employee_id IS NOT NULL AND public.employee_is_self(employee_id))
    OR public.has_role(auth.uid(),'admin') OR public.is_platform_admin(auth.uid())
  )
  WITH CHECK (
    (employee_id IS NOT NULL AND public.employee_is_self(employee_id))
    OR public.has_role(auth.uid(),'admin') OR public.is_platform_admin(auth.uid())
  );

-- touch-triggers
CREATE OR REPLACE FUNCTION public.hr_touch_updated_at()
RETURNS trigger LANGUAGE plpgsql SET search_path = public AS $$
BEGIN NEW.updated_at = now(); RETURN NEW; END; $$;
CREATE TRIGGER trg_touch_absence_types BEFORE UPDATE ON public.absence_types FOR EACH ROW EXECUTE FUNCTION public.hr_touch_updated_at();
CREATE TRIGGER trg_touch_absence_policies BEFORE UPDATE ON public.absence_policies FOR EACH ROW EXECUTE FUNCTION public.hr_touch_updated_at();
CREATE TRIGGER trg_touch_vacation_balances BEFORE UPDATE ON public.vacation_balances FOR EACH ROW EXECUTE FUNCTION public.hr_touch_updated_at();
CREATE TRIGGER trg_touch_sick_periods BEFORE UPDATE ON public.sick_periods FOR EACH ROW EXECUTE FUNCTION public.hr_touch_updated_at();
CREATE TRIGGER trg_touch_hr_notifications BEFORE UPDATE ON public.hr_notifications FOR EACH ROW EXECUTE FUNCTION public.hr_touch_updated_at();
CREATE TRIGGER trg_touch_hr_pref BEFORE UPDATE ON public.hr_notification_preferences FOR EACH ROW EXECUTE FUNCTION public.hr_touch_updated_at();
