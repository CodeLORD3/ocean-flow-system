CREATE OR REPLACE FUNCTION public.is_hr_admin()
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO 'public' AS $$
  SELECT auth.uid() IS NOT NULL AND (
    public.is_platform_admin(auth.uid())
    OR EXISTS (SELECT 1 FROM public.user_roles r WHERE r.user_id = auth.uid()
               AND r.role::text IN ('admin','platform_admin','group_admin','region_admin','company_admin','wholesale_staff'))
    OR EXISTS (SELECT 1 FROM public.user_scopes us WHERE us.user_id = auth.uid()
               AND us.scope_type = 'portal' AND us.scope_value = 'admin')
  )
$$;
GRANT EXECUTE ON FUNCTION public.is_hr_admin() TO authenticated;

ALTER TABLE public.absence_requests ADD COLUMN IF NOT EXISTS cancelled_by uuid, ADD COLUMN IF NOT EXISTS cancelled_at timestamptz;
ALTER TABLE public.availability ADD COLUMN IF NOT EXISTS created_by uuid DEFAULT auth.uid();

CREATE POLICY "availability hr admin" ON public.availability FOR ALL TO authenticated
  USING (public.is_hr_admin()) WITH CHECK (public.is_hr_admin());

-- Pass trots frånvaro: adminnivå passerar spärren, allt annat oförändrat
CREATE OR REPLACE FUNCTION public.block_shift_on_absence()
 RETURNS trigger LANGUAGE plpgsql SET search_path TO 'public' AS $function$
DECLARE v_label text; v_from date; v_to date;
BEGIN
  IF NEW.employee_id IS NULL OR coalesce(NEW.status, '') = 'cancelled' THEN RETURN NEW; END IF;
  IF public.is_hr_admin() THEN RETURN NEW; END IF;
  SELECT coalesce(t.name, 'Ledighet'), coalesce(r.date_from, r.start_date),
         coalesce(r.date_to, r.end_date, r.date_from, r.start_date)
    INTO v_label, v_from, v_to
  FROM public.absence_requests r LEFT JOIN public.absence_types t ON t.id = r.absence_type_id
  WHERE r.employee_id = NEW.employee_id AND r.status IN ('approved', 'auto_approved')
    AND coalesce(r.extent_pct, 100) >= 100
    AND NEW.date BETWEEN coalesce(r.date_from, r.start_date) AND coalesce(r.date_to, r.end_date, r.date_from, r.start_date)
  ORDER BY coalesce(r.date_from, r.start_date) LIMIT 1;
  IF v_label IS NOT NULL THEN
    RAISE EXCEPTION 'Personen är ledig % och kan inte schemaläggas den dagen (%).', to_char(NEW.date, 'YYYY-MM-DD'),
      v_label || ' ' || to_char(v_from, 'YYYY-MM-DD') || CASE WHEN v_to > v_from THEN ' till ' || to_char(v_to, 'YYYY-MM-DD') ELSE '' END;
  END IF;
  RETURN NEW;
END; $function$;

CREATE OR REPLACE FUNCTION public.log_shift_absence_override()
 RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $$
DECLARE a record;
BEGIN
  IF NEW.employee_id IS NULL OR coalesce(NEW.status,'') = 'cancelled' THEN RETURN NEW; END IF;
  IF TG_OP = 'UPDATE' AND NEW.employee_id IS NOT DISTINCT FROM OLD.employee_id AND NEW.date = OLD.date THEN RETURN NEW; END IF;
  IF NOT public.is_hr_admin() THEN RETURN NEW; END IF;
  FOR a IN
    SELECT r.id, r.status, r.extent_pct, r.start_date, r.end_date, t.name AS type_name
    FROM public.absence_requests r LEFT JOIN public.absence_types t ON t.id = r.absence_type_id
    WHERE r.employee_id = NEW.employee_id AND r.status IN ('pending','approved')
      AND NEW.date BETWEEN r.start_date AND COALESCE(r.end_date, CASE WHEN t.is_sick THEN NEW.date ELSE r.start_date END)
  LOOP
    INSERT INTO public.shift_history (shift_id, action, changes, changed_by)
    VALUES (NEW.id, 'lagt_trots_franvaro', jsonb_build_object(
      'absence_request_id', a.id, 'absence_type', a.type_name, 'absence_status', a.status,
      'extent_pct', a.extent_pct, 'start_date', a.start_date, 'end_date', a.end_date, 'shift_date', NEW.date), auth.uid());
  END LOOP;
  RETURN NEW;
END; $$;
CREATE TRIGGER shifts_absence_override_log AFTER INSERT OR UPDATE OF employee_id, date, status ON public.shifts
  FOR EACH ROW EXECUTE FUNCTION public.log_shift_absence_override();

-- Registrera frånvaro åt anställd: skapa + godkänn i ett steg
CREATE OR REPLACE FUNCTION public.admin_register_absence(
  _employee_id uuid, _absence_type_id uuid, _start_date date, _end_date date DEFAULT NULL,
  _extent_pct numeric DEFAULT 100, _note text DEFAULT NULL, _conflict_action text DEFAULT 'keep')
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $$
DECLARE _t public.absence_types; _em record; _r public.absence_requests; _end date;
  _shift_ids uuid[]; _resolved int := 0; _sick jsonb; _bal public.vacation_balances;
BEGIN
  IF NOT public.is_hr_admin() THEN RAISE EXCEPTION 'Behörighet saknas'; END IF;
  IF _conflict_action NOT IN ('keep','open_shift','cancel_shift') THEN RAISE EXCEPTION 'Ogiltigt val för pass'; END IF;
  SELECT * INTO _t FROM public.absence_types WHERE id = _absence_type_id AND is_active;
  IF _t.id IS NULL THEN RAISE EXCEPTION 'Okänd frånvarotyp'; END IF;
  IF NOT EXISTS (SELECT 1 FROM public.employees WHERE id = _employee_id) THEN RAISE EXCEPTION 'Okänd anställd'; END IF;
  _end := CASE WHEN _end_date IS NOT NULL THEN _end_date WHEN _t.is_sick THEN NULL ELSE _start_date END;
  IF _end IS NOT NULL AND _end < _start_date THEN RAISE EXCEPTION 'Till-datum före från-datum'; END IF;
  SELECT store_id, legal_entity_id INTO _em FROM public.employments
   WHERE employee_id = _employee_id ORDER BY is_active DESC, start_date DESC NULLS LAST LIMIT 1;

  INSERT INTO public.absence_requests (employee_id, absence_type_id, start_date, end_date, extent_pct, note,
     status, store_id, legal_entity_id, created_by, decided_by, decided_at, decision_note)
  VALUES (_employee_id, _absence_type_id, _start_date, _end, COALESCE(_extent_pct,100), NULLIF(_note,''),
     'approved', _em.store_id, _em.legal_entity_id, auth.uid(), auth.uid(), now(), 'Registrerad av admin')
  RETURNING * INTO _r;

  SELECT array_agg(s.id) INTO _shift_ids FROM public.shifts s
   WHERE s.employee_id = _employee_id AND s.status = 'published'
     AND s.date BETWEEN _start_date AND COALESCE(_end, _start_date);
  IF _shift_ids IS NOT NULL AND _conflict_action = 'open_shift' THEN
    UPDATE public.shifts SET employee_id = NULL, updated_by = auth.uid(), updated_at = now() WHERE id = ANY(_shift_ids);
  ELSIF _shift_ids IS NOT NULL AND _conflict_action = 'cancel_shift' THEN
    UPDATE public.shifts SET status = 'cancelled', updated_by = auth.uid(), updated_at = now() WHERE id = ANY(_shift_ids);
  END IF;

  IF _t.is_sick THEN _sick := public.register_sick_period(_employee_id, _start_date, _end); END IF;

  WITH upd AS (
    UPDATE public.attestations a SET status = 'approved', basis = 'justerad', decided_by = auth.uid(), decided_at = now(),
      computed = COALESCE(a.computed,'{}'::jsonb) || jsonb_build_object('auto_resolved_by_absence', _r.id, 'absence_type', _t.code, 'auto_resolved_at', now()),
      updated_at = now()
    WHERE a.employee_id = _employee_id AND a.deviation_type = 'missat_pass' AND a.status = 'flagged'
      AND a.date BETWEEN _start_date AND COALESCE(_end, _start_date)
    RETURNING 1) SELECT count(*)::int INTO _resolved FROM upd;

  IF _t.affects_vacation_balance THEN
    _bal := public.compute_vacation_balance(_employee_id, public.vacation_year_of(_start_date));
  END IF;
  RETURN jsonb_build_object('ok', true, 'id', _r.id, 'conflicting_shifts', COALESCE(array_length(_shift_ids,1),0),
    'conflict_action', _conflict_action, 'attestations_resolved', _resolved, 'sick', _sick,
    'vacation_balance', CASE WHEN _bal.id IS NULL THEN NULL ELSE to_jsonb(_bal) END);
END; $$;

-- Ändra registrerad frånvaro (datum, omfattning, kommentar)
CREATE OR REPLACE FUNCTION public.admin_update_absence(_request_id uuid, _start_date date, _end_date date, _extent_pct numeric, _note text DEFAULT NULL)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $$
DECLARE _old public.absence_requests; _r public.absence_requests; _t public.absence_types; _sp public.sick_periods; _end date;
BEGIN
  IF NOT public.is_hr_admin() THEN RAISE EXCEPTION 'Behörighet saknas'; END IF;
  SELECT * INTO _old FROM public.absence_requests WHERE id = _request_id;
  IF _old.id IS NULL OR _old.status NOT IN ('approved','pending') THEN RAISE EXCEPTION 'Frånvaron kan inte ändras'; END IF;
  SELECT * INTO _t FROM public.absence_types WHERE id = _old.absence_type_id;
  _end := CASE WHEN _end_date IS NOT NULL THEN _end_date WHEN _t.is_sick THEN NULL ELSE _start_date END;
  IF _end IS NOT NULL AND _end < _start_date THEN RAISE EXCEPTION 'Till-datum före från-datum'; END IF;
  UPDATE public.absence_requests SET start_date = _start_date, date_from = _start_date, end_date = _end, date_to = _end,
     extent_pct = COALESCE(_extent_pct, extent_pct), note = NULLIF(_note,''), reason = NULLIF(_note,''), updated_at = now()
   WHERE id = _request_id RETURNING * INTO _r;
  IF _t.is_sick AND _r.status = 'approved' THEN
    SELECT * INTO _sp FROM public.sick_periods WHERE employee_id = _r.employee_id
      AND first_day <= _old.start_date AND (last_day IS NULL OR last_day >= _old.start_date)
      ORDER BY first_day DESC LIMIT 1;
    IF _sp.id IS NOT NULL THEN
      UPDATE public.sick_periods SET first_day = CASE WHEN _sp.first_day = _old.start_date THEN _start_date ELSE first_day END,
        last_day = _end, updated_at = now() WHERE id = _sp.id;
    ELSE
      PERFORM public.register_sick_period(_r.employee_id, _start_date, _end);
    END IF;
  END IF;
  IF _t.affects_vacation_balance THEN
    PERFORM public.compute_vacation_balance(_r.employee_id, public.vacation_year_of(_old.start_date));
    IF public.vacation_year_of(_start_date) <> public.vacation_year_of(_old.start_date) THEN
      PERFORM public.compute_vacation_balance(_r.employee_id, public.vacation_year_of(_start_date));
    END IF;
  END IF;
  RETURN jsonb_build_object('ok', true, 'id', _r.id);
END; $$;

-- Ta bort registrerad frånvaro: status cancelled, vem och när
CREATE OR REPLACE FUNCTION public.admin_cancel_absence(_request_id uuid, _reason text DEFAULT NULL)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $$
DECLARE _r public.absence_requests; _t public.absence_types; _sp public.sick_periods; _was text;
BEGIN
  IF NOT public.is_hr_admin() THEN RAISE EXCEPTION 'Behörighet saknas'; END IF;
  SELECT * INTO _r FROM public.absence_requests WHERE id = _request_id;
  IF _r.id IS NULL OR _r.status NOT IN ('approved','pending') THEN RAISE EXCEPTION 'Frånvaron kan inte tas bort'; END IF;
  _was := _r.status;
  SELECT * INTO _t FROM public.absence_types WHERE id = _r.absence_type_id;
  UPDATE public.absence_requests SET status = 'cancelled', cancelled_by = auth.uid(), cancelled_at = now(),
     decision_note = COALESCE(NULLIF(_reason,''), decision_note), updated_at = now() WHERE id = _request_id;
  DELETE FROM public.absence_days WHERE request_id = _request_id AND is_overridden = false;
  IF _t.is_sick AND _was = 'approved' THEN
    SELECT * INTO _sp FROM public.sick_periods WHERE employee_id = _r.employee_id
      AND first_day <= _r.start_date AND (last_day IS NULL OR last_day >= _r.start_date)
      ORDER BY first_day DESC LIMIT 1;
    IF _sp.id IS NOT NULL THEN
      IF _sp.first_day = _r.start_date THEN DELETE FROM public.sick_periods WHERE id = _sp.id;
      ELSE UPDATE public.sick_periods SET last_day = _r.start_date - 1, updated_at = now() WHERE id = _sp.id; END IF;
    END IF;
  END IF;
  IF _t.affects_vacation_balance THEN
    PERFORM public.compute_vacation_balance(_r.employee_id, public.vacation_year_of(_r.start_date));
  END IF;
  RETURN jsonb_build_object('ok', true, 'id', _r.id, 'status', 'cancelled');
END; $$;

-- Friskanmälan från registrerad sjukfrånvaro
CREATE OR REPLACE FUNCTION public.admin_end_sick_absence(_request_id uuid, _last_day date DEFAULT NULL)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $$
DECLARE _r public.absence_requests; _t public.absence_types; _last date;
BEGIN
  IF NOT public.is_hr_admin() THEN RAISE EXCEPTION 'Behörighet saknas'; END IF;
  SELECT * INTO _r FROM public.absence_requests WHERE id = _request_id;
  SELECT * INTO _t FROM public.absence_types WHERE id = _r.absence_type_id;
  IF _r.id IS NULL OR NOT _t.is_sick OR _r.status <> 'approved' OR _r.end_date IS NOT NULL THEN
    RAISE EXCEPTION 'Ingen pågående sjukfrånvaro'; END IF;
  _last := GREATEST(COALESCE(_last_day, current_date), _r.start_date);
  UPDATE public.absence_requests SET end_date = _last, date_to = _last, updated_at = now() WHERE id = _request_id;
  UPDATE public.sick_periods SET last_day = _last, updated_at = now()
   WHERE id = (SELECT id FROM public.sick_periods WHERE employee_id = _r.employee_id AND last_day IS NULL ORDER BY first_day DESC LIMIT 1);
  RETURN jsonb_build_object('ok', true, 'id', _r.id, 'last_day', _last);
END; $$;

REVOKE EXECUTE ON FUNCTION public.admin_register_absence(uuid,uuid,date,date,numeric,text,text) FROM anon, public;
REVOKE EXECUTE ON FUNCTION public.admin_update_absence(uuid,date,date,numeric,text) FROM anon, public;
REVOKE EXECUTE ON FUNCTION public.admin_cancel_absence(uuid,text) FROM anon, public;
REVOKE EXECUTE ON FUNCTION public.admin_end_sick_absence(uuid,date) FROM anon, public;
GRANT EXECUTE ON FUNCTION public.admin_register_absence(uuid,uuid,date,date,numeric,text,text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.admin_update_absence(uuid,date,date,numeric,text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.admin_cancel_absence(uuid,text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.admin_end_sick_absence(uuid,date) TO authenticated;