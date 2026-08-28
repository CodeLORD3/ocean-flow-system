-- =========================================================
-- ETAPP 4b: beräkningar, beslut, notishjälp
-- =========================================================

-- semesterår för ett datum: startår = år om datum >= 1 april annars år-1
CREATE OR REPLACE FUNCTION public.vacation_year_of(_d date)
RETURNS integer LANGUAGE sql IMMUTABLE SET search_path = public AS $$
  SELECT CASE WHEN extract(month from _d) >= 4 THEN extract(year from _d)::int
              ELSE extract(year from _d)::int - 1 END;
$$;

CREATE OR REPLACE FUNCTION public.absence_policy_for(_legal_entity_id text)
RETURNS public.absence_policies LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT * FROM public.absence_policies
  WHERE legal_entity_id IS NOT DISTINCT FROM _legal_entity_id
  UNION ALL
  SELECT * FROM public.absence_policies WHERE legal_entity_id IS NULL
  LIMIT 1;
$$;
REVOKE ALL ON FUNCTION public.absence_policy_for(text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.absence_policy_for(text) TO authenticated, service_role;

-- ---------- semesterberäkning ----------
CREATE OR REPLACE FUNCTION public.compute_vacation_balance(_employee_id uuid, _vacation_year integer)
RETURNS public.vacation_balances
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  _y_start date := make_date(_vacation_year, 4, 1);
  _y_end   date := make_date(_vacation_year + 1, 3, 31);
  _entitled numeric := 25;
  _rate numeric := 1;
  _emp_days integer := 0;
  _earned numeric := 0;
  _used numeric := 0;
  _saved numeric := 0;
  _adj numeric := 0;
  _row public.vacation_balances;
BEGIN
  -- anställning som överlappar intjänandeåret (senaste)
  SELECT COALESCE(e.vacation_days, 25), COALESCE(e.employment_rate, 1),
         GREATEST(0, (LEAST(COALESCE(e.end_date, _y_end), _y_end) - GREATEST(e.start_date, _y_start) + 1))
    INTO _entitled, _rate, _emp_days
  FROM public.employments e
  WHERE e.employee_id = _employee_id
    AND e.start_date <= _y_end
    AND (e.end_date IS NULL OR e.end_date >= _y_start)
  ORDER BY e.is_active DESC, e.start_date DESC
  LIMIT 1;

  _entitled := COALESCE(_entitled, 25);
  _rate := COALESCE(_rate, 1);
  IF _rate > 1 THEN _rate := _rate / 100.0; END IF;
  _emp_days := COALESCE(_emp_days, 0);

  -- pro rata på anställningstid × sysselsättningsgrad
  _earned := round((_entitled * (_emp_days::numeric / (_y_end - _y_start + 1)) * _rate)::numeric, 1);

  -- uttagna semesterdagar (godkända) inom semesteråret, viktade med omfattning
  SELECT COALESCE(SUM(
    (LEAST(COALESCE(r.end_date, r.start_date), _y_end) - GREATEST(r.start_date, _y_start) + 1)
      * (r.extent_pct / 100.0)
  ), 0) INTO _used
  FROM public.absence_requests r
  JOIN public.absence_types t ON t.id = r.absence_type_id
  WHERE r.employee_id = _employee_id
    AND r.status = 'approved'
    AND t.affects_vacation_balance
    AND r.start_date <= _y_end
    AND COALESCE(r.end_date, r.start_date) >= _y_start;
  _used := round(COALESCE(_used, 0), 1);

  SELECT COALESCE(saved_days,0), COALESCE(manual_adjustment_days,0)
    INTO _saved, _adj
  FROM public.vacation_balances WHERE employee_id = _employee_id AND vacation_year = _vacation_year;

  INSERT INTO public.vacation_balances (employee_id, vacation_year, entitled_days, earned_days, used_days, saved_days)
  VALUES (_employee_id, _vacation_year, _entitled, _earned, _used, COALESCE(_saved,0))
  ON CONFLICT (employee_id, vacation_year) DO UPDATE
    SET entitled_days = EXCLUDED.entitled_days,
        earned_days = EXCLUDED.earned_days,
        used_days = EXCLUDED.used_days,
        updated_at = now()
  RETURNING * INTO _row;

  RETURN _row;
END; $$;
REVOKE ALL ON FUNCTION public.compute_vacation_balance(uuid, integer) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.compute_vacation_balance(uuid, integer) TO authenticated, service_role;

CREATE OR REPLACE FUNCTION public.recompute_all_vacation_balances(_vacation_year integer DEFAULT NULL)
RETURNS integer LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE _y integer := COALESCE(_vacation_year, public.vacation_year_of(current_date)); _n integer := 0; _e uuid;
BEGIN
  FOR _e IN SELECT DISTINCT employee_id FROM public.employments WHERE is_active LOOP
    PERFORM public.compute_vacation_balance(_e, _y);
    _n := _n + 1;
  END LOOP;
  RETURN _n;
END; $$;
REVOKE ALL ON FUNCTION public.recompute_all_vacation_balances(integer) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.recompute_all_vacation_balances(integer) TO service_role;

-- manuell justering (admin)
CREATE OR REPLACE FUNCTION public.vacation_adjust(_employee_id uuid, _vacation_year integer, _delta_days numeric, _reason text)
RETURNS public.vacation_balances LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE _row public.vacation_balances;
BEGIN
  IF NOT (public.has_role(auth.uid(),'admin') OR public.is_platform_admin(auth.uid())) THEN
    RAISE EXCEPTION 'Endast admin kan justera semestersaldo';
  END IF;
  IF _reason IS NULL OR length(trim(_reason)) = 0 THEN
    RAISE EXCEPTION 'Skäl krävs';
  END IF;
  PERFORM public.compute_vacation_balance(_employee_id, _vacation_year);
  UPDATE public.vacation_balances
    SET manual_adjustment_days = manual_adjustment_days + _delta_days,
        manual_adjustment_reason = _reason,
        adjusted_by = auth.uid(), adjusted_at = now(), updated_at = now()
    WHERE employee_id = _employee_id AND vacation_year = _vacation_year
    RETURNING * INTO _row;
  INSERT INTO public.vacation_balance_adjustments (vacation_balance_id, delta_days, reason, created_by)
  VALUES (_row.id, _delta_days, _reason, auth.uid());
  RETURN _row;
END; $$;
REVOKE ALL ON FUNCTION public.vacation_adjust(uuid, integer, numeric, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.vacation_adjust(uuid, integer, numeric, text) TO authenticated, service_role;

-- semesterårsskifte
CREATE OR REPLACE FUNCTION public.vacation_year_rollover(_from_year integer DEFAULT NULL)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  _y integer := COALESCE(_from_year, public.vacation_year_of(current_date) - 1);
  _pol public.absence_policies;
  _b record;
  _remaining numeric;
  _to_save numeric;
  _closed integer := 0;
  _expired integer := 0;
BEGIN
  SELECT * INTO _pol FROM public.absence_policies WHERE legal_entity_id IS NULL LIMIT 1;

  FOR _b IN SELECT * FROM public.vacation_balances WHERE vacation_year = _y AND closed_at IS NULL LOOP
    PERFORM public.compute_vacation_balance(_b.employee_id, _y);
    SELECT * INTO _b FROM public.vacation_balances WHERE id = _b.id;
    _remaining := GREATEST(0, _b.earned_days + _b.manual_adjustment_days - _b.used_days);
    _to_save := LEAST(_remaining, COALESCE(_pol.max_saved_days_per_year, 5));

    UPDATE public.vacation_balances
      SET closed_at = now(),
          saved_days = _to_save,
          expires_at = make_date(_y + 1 + COALESCE(_pol.max_saved_years,5), 3, 31),
          updated_at = now()
      WHERE id = _b.id;
    _closed := _closed + 1;
  END LOOP;

  -- flagga förfall på årgångar äldre än max_saved_years
  UPDATE public.vacation_balances
    SET expiry_flagged = true, updated_at = now()
    WHERE saved_days > 0
      AND NOT expiry_flagged
      AND vacation_year <= public.vacation_year_of(current_date) - COALESCE(_pol.max_saved_years,5);
  _expired := ROW_COUNT_HACK() ;
  RETURN jsonb_build_object('ok', true, 'year', _y, 'closed', _closed);
END; $$;

-- (rensa hjälpfel: skriv om funktionen utan pseudokod)
CREATE OR REPLACE FUNCTION public.vacation_year_rollover(_from_year integer DEFAULT NULL)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  _y integer := COALESCE(_from_year, public.vacation_year_of(current_date) - 1);
  _pol public.absence_policies;
  _b record;
  _remaining numeric;
  _to_save numeric;
  _closed integer := 0;
  _expired integer := 0;
BEGIN
  SELECT * INTO _pol FROM public.absence_policies WHERE legal_entity_id IS NULL LIMIT 1;

  FOR _b IN SELECT id, employee_id FROM public.vacation_balances WHERE vacation_year = _y AND closed_at IS NULL LOOP
    PERFORM public.compute_vacation_balance(_b.employee_id, _y);
    SELECT GREATEST(0, earned_days + manual_adjustment_days - used_days) INTO _remaining
      FROM public.vacation_balances WHERE id = _b.id;
    _to_save := LEAST(COALESCE(_remaining,0), COALESCE(_pol.max_saved_days_per_year, 5));
    UPDATE public.vacation_balances
      SET closed_at = now(),
          saved_days = _to_save,
          expires_at = make_date(_y + 1 + COALESCE(_pol.max_saved_years,5), 3, 31),
          updated_at = now()
      WHERE id = _b.id;
    _closed := _closed + 1;
  END LOOP;

  WITH flagged AS (
    UPDATE public.vacation_balances
      SET expiry_flagged = true, updated_at = now()
      WHERE saved_days > 0 AND NOT expiry_flagged
        AND vacation_year <= public.vacation_year_of(current_date) - COALESCE(_pol.max_saved_years,5)
      RETURNING 1
  ) SELECT count(*)::int INTO _expired FROM flagged;

  RETURN jsonb_build_object('ok', true, 'year', _y, 'closed', _closed, 'expiry_flagged', _expired);
END; $$;
REVOKE ALL ON FUNCTION public.vacation_year_rollover(integer) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.vacation_year_rollover(integer) TO service_role;

-- ---------- krockkontroll ----------
CREATE OR REPLACE FUNCTION public.absence_conflicts(_request_id uuid)
RETURNS TABLE(shift_id uuid, shift_date date, start_time time, end_time time, store_id uuid, status text)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT s.id, s.date, s.start_time, s.end_time, s.store_id, s.status
  FROM public.absence_requests r
  JOIN public.shifts s
    ON s.employee_id = r.employee_id
   AND s.date BETWEEN r.start_date AND COALESCE(r.end_date, r.start_date)
  WHERE r.id = _request_id
    AND s.status = 'published'
    AND (public.employee_is_self(r.employee_id) OR public.can_see_employee(r.employee_id))
  ORDER BY s.date, s.start_time;
$$;
REVOKE ALL ON FUNCTION public.absence_conflicts(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.absence_conflicts(uuid) TO authenticated, service_role;

-- ---------- notishjälp ----------
CREATE OR REPLACE FUNCTION public.hr_notify(
  _employee_id uuid,
  _template_key text,
  _category text,
  _payload jsonb DEFAULT '{}'::jsonb,
  _dedupe_key text DEFAULT NULL
) RETURNS integer
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  _pref public.hr_notification_preferences;
  _entity text;
  _uid uuid;
  _email text;
  _phone text;
  _n integer := 0;
  _recent integer;
BEGIN
  SELECT e.legal_entity_id INTO _entity FROM public.employments e
   WHERE e.employee_id = _employee_id ORDER BY e.is_active DESC LIMIT 1;
  SELECT s.user_id INTO _uid FROM public.staff s
   JOIN public.employees em ON em.staff_id = s.id WHERE em.id = _employee_id LIMIT 1;
  SELECT email, phone INTO _email, _phone FROM public.employees WHERE id = _employee_id;

  SELECT * INTO _pref FROM public.hr_notification_preferences
   WHERE employee_id = _employee_id AND category = _category;
  IF _pref.id IS NULL THEN
    SELECT * INTO _pref FROM public.hr_notification_preferences
     WHERE employee_id IS NULL AND legal_entity_id IS NOT DISTINCT FROM _entity AND category = _category;
  END IF;

  -- sammanslagning: fler än 3 notiser av samma mall senaste timmen → hoppa över
  SELECT count(*)::int INTO _recent FROM public.hr_notifications
   WHERE employee_id = _employee_id AND template_key = _template_key
     AND created_at > now() - interval '1 hour';

  -- in_app alltid på
  INSERT INTO public.hr_notifications (employee_id, user_id, channel, category, template_key, payload, dedupe_key)
  VALUES (_employee_id, _uid, 'in_app', _category, _template_key, _payload,
          CASE WHEN _dedupe_key IS NULL THEN NULL ELSE _dedupe_key||':in_app' END)
  ON CONFLICT DO NOTHING;
  _n := _n + 1;

  IF COALESCE(_pref.email, false) AND _email IS NOT NULL THEN
    INSERT INTO public.hr_notifications (employee_id, user_id, recipient, channel, category, template_key, payload, dedupe_key)
    VALUES (_employee_id, _uid, _email, 'email', _category, _template_key, _payload,
            CASE WHEN _dedupe_key IS NULL THEN NULL ELSE _dedupe_key||':email' END)
    ON CONFLICT DO NOTHING;
    _n := _n + 1;
  END IF;

  IF COALESCE(_pref.sms, false) AND _phone IS NOT NULL AND _recent <= 3 THEN
    INSERT INTO public.hr_notifications (employee_id, user_id, recipient, channel, category, template_key, payload, dedupe_key)
    VALUES (_employee_id, _uid, _phone, 'sms', _category, _template_key, _payload,
            CASE WHEN _dedupe_key IS NULL THEN NULL ELSE _dedupe_key||':sms' END)
    ON CONFLICT DO NOTHING;
    _n := _n + 1;
  END IF;

  RETURN _n;
END; $$;
REVOKE ALL ON FUNCTION public.hr_notify(uuid, text, text, jsonb, text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.hr_notify(uuid, text, text, jsonb, text) TO service_role;

-- ---------- beslut om frånvaro ----------
CREATE OR REPLACE FUNCTION public.decide_absence_request(
  _request_id uuid,
  _decision text,                 -- approved | rejected
  _decision_note text DEFAULT NULL,
  _conflict_action text DEFAULT 'none'  -- none | open_shift | cancel_shift
) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  _r public.absence_requests;
  _t public.absence_types;
  _shift_ids uuid[] := '{}';
  _resolved integer := 0;
  _sick jsonb := NULL;
  _bal public.vacation_balances;
BEGIN
  SELECT * INTO _r FROM public.absence_requests WHERE id = _request_id;
  IF _r.id IS NULL THEN RAISE EXCEPTION 'Ansökan hittades inte'; END IF;
  IF NOT (public.can_see_employee(_r.employee_id) OR public.has_role(auth.uid(),'admin') OR public.is_platform_admin(auth.uid())) THEN
    RAISE EXCEPTION 'Behörighet saknas för beslut';
  END IF;
  IF _decision NOT IN ('approved','rejected') THEN RAISE EXCEPTION 'Ogiltigt beslut'; END IF;

  SELECT * INTO _t FROM public.absence_types WHERE id = _r.absence_type_id;

  UPDATE public.absence_requests
    SET status = _decision, decided_by = auth.uid(), decided_at = now(),
        decision_note = _decision_note, updated_at = now()
    WHERE id = _request_id RETURNING * INTO _r;

  IF _decision = 'approved' THEN
    -- krockande publicerade pass
    SELECT array_agg(s.id) INTO _shift_ids
    FROM public.shifts s
    WHERE s.employee_id = _r.employee_id
      AND s.status = 'published'
      AND s.date BETWEEN _r.start_date AND COALESCE(_r.end_date, _r.start_date);

    IF _shift_ids IS NOT NULL AND _conflict_action = 'open_shift' THEN
      UPDATE public.shifts SET employee_id = NULL, updated_by = auth.uid(), updated_at = now()
        WHERE id = ANY(_shift_ids);
    ELSIF _shift_ids IS NOT NULL AND _conflict_action = 'cancel_shift' THEN
      UPDATE public.shifts SET status = 'cancelled', updated_by = auth.uid(), updated_at = now()
        WHERE id = ANY(_shift_ids);
    END IF;

    -- sjukperiod
    IF _t.is_sick THEN
      _sick := public.register_sick_period(_r.employee_id, _r.start_date, _r.end_date);
    END IF;

    -- attest-koppling: auto-lös missat_pass samma dagar
    WITH upd AS (
      UPDATE public.attestations a
        SET status = 'approved',
            basis = 'justerad',
            decided_by = auth.uid(),
            decided_at = now(),
            computed = COALESCE(a.computed,'{}'::jsonb)
              || jsonb_build_object('auto_resolved_by_absence', _r.id,
                                    'absence_type', _t.code,
                                    'auto_resolved_at', now()),
            updated_at = now()
        WHERE a.employee_id = _r.employee_id
          AND a.deviation_type = 'missat_pass'
          AND a.status = 'flagged'
          AND a.date BETWEEN _r.start_date AND COALESCE(_r.end_date, _r.start_date)
        RETURNING 1
    ) SELECT count(*)::int INTO _resolved FROM upd;

    IF _t.affects_vacation_balance THEN
      _bal := public.compute_vacation_balance(_r.employee_id, public.vacation_year_of(_r.start_date));
    END IF;
  END IF;

  RETURN jsonb_build_object(
    'ok', true,
    'status', _r.status,
    'conflicting_shifts', COALESCE(array_length(_shift_ids,1),0),
    'conflict_action', _conflict_action,
    'attestations_resolved', _resolved,
    'sick', _sick,
    'vacation_balance', CASE WHEN _bal.id IS NULL THEN NULL ELSE to_jsonb(_bal) END
  );
END; $$;
REVOKE ALL ON FUNCTION public.decide_absence_request(uuid, text, text, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.decide_absence_request(uuid, text, text, text) TO authenticated, service_role;

-- ---------- dagliga kontroller ----------
CREATE OR REPLACE FUNCTION public.hr_daily_checks()
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  _pol public.absence_policies;
  _r record;
  _fk integer := 0; _karens integer := 0; _las integer := 0; _vac integer := 0;
BEGIN
  SELECT * INTO _pol FROM public.absence_policies WHERE legal_entity_id IS NULL LIMIT 1;

  -- dag 15 i sjukperiod
  FOR _r IN
    SELECT sp.id, sp.employee_id, sp.first_day
    FROM public.sick_periods sp
    WHERE sp.fk_reminder_sent_at IS NULL
      AND (current_date - sp.first_day) + 1 >= COALESCE(_pol.fk_report_day, 15)
      AND (sp.last_day IS NULL OR sp.last_day >= current_date - 1)
  LOOP
    PERFORM public.hr_notify(_r.employee_id, 'sick_day15', 'hr_warnings',
      jsonb_build_object('sick_period_id', _r.id, 'first_day', _r.first_day), 'sick_day15:'||_r.id);
    UPDATE public.sick_periods SET fk_reminder_sent_at = now() WHERE id = _r.id;
    _fk := _fk + 1;
  END LOOP;

  -- karensvarning
  FOR _r IN
    SELECT employee_id, count(*) c FROM public.sick_periods
    WHERE karens_applied AND first_day >= current_date - interval '12 months'
    GROUP BY employee_id
    HAVING count(*) >= COALESCE(_pol.karens_warning_count, 10)
  LOOP
    PERFORM public.hr_notify(_r.employee_id, 'karens_warning', 'hr_warnings',
      jsonb_build_object('count', _r.c),
      'karens_warning:'||_r.employee_id||':'||to_char(current_date,'YYYY-MM'));
    _karens := _karens + 1;
  END LOOP;

  -- LAS-varningar (provanställning slut / visstidskonvertering) X dagar före
  FOR _r IN
    SELECT e.employee_id, e.probation_end_date d, 'las_probation' k
    FROM public.employments e
    WHERE e.is_active AND e.probation_end_date IS NOT NULL
      AND e.probation_end_date BETWEEN current_date AND current_date + COALESCE(_pol.las_warning_days_before,60)
    UNION ALL
    SELECT e.employee_id, e.conversion_date d, 'las_conversion' k
    FROM public.employments e
    WHERE e.is_active AND e.conversion_date IS NOT NULL
      AND e.conversion_date BETWEEN current_date AND current_date + COALESCE(_pol.las_warning_days_before,60)
  LOOP
    PERFORM public.hr_notify(_r.employee_id, _r.k, 'hr_warnings',
      jsonb_build_object('date', _r.d), _r.k||':'||_r.employee_id||':'||_r.d);
    _las := _las + 1;
  END LOOP;

  -- förfallande sparade semesterdagar
  FOR _r IN
    SELECT employee_id, vacation_year, saved_days, expires_at
    FROM public.vacation_balances
    WHERE saved_days > 0 AND expiry_flagged
  LOOP
    PERFORM public.hr_notify(_r.employee_id, 'vacation_expiry', 'vacation',
      jsonb_build_object('vacation_year', _r.vacation_year, 'saved_days', _r.saved_days, 'expires_at', _r.expires_at),
      'vacation_expiry:'||_r.employee_id||':'||_r.vacation_year);
    _vac := _vac + 1;
  END LOOP;

  RETURN jsonb_build_object('fk_day15', _fk, 'karens', _karens, 'las', _las, 'vacation_expiry', _vac);
END; $$;
REVOKE ALL ON FUNCTION public.hr_daily_checks() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.hr_daily_checks() TO service_role;
