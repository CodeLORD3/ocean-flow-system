CREATE OR REPLACE FUNCTION public.admin_schedule_absence(
  _employee_id uuid,
  _kind text,
  _start_date date,
  _end_date date DEFAULT NULL,
  _absence_type_id uuid DEFAULT NULL,
  _extent_pct numeric DEFAULT 100,
  _note text DEFAULT NULL,
  _from_time time DEFAULT '00:00',
  _to_time time DEFAULT '23:59',
  _conflict_action text DEFAULT 'keep',
  _shift_id uuid DEFAULT NULL,
  _shift_action text DEFAULT NULL
) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $$
DECLARE _s public.shifts; _end date; _d date; _n int := 0; _ids uuid[]; _res jsonb;
BEGIN
  IF NOT public.is_hr_admin() THEN RAISE EXCEPTION 'Behörighet saknas'; END IF;
  IF _kind NOT IN ('absence','unavailable') THEN RAISE EXCEPTION 'Ogiltig typ'; END IF;
  IF _conflict_action NOT IN ('keep','open_shift','cancel_shift') THEN RAISE EXCEPTION 'Ogiltigt val för pass'; END IF;

  -- Befintligt pass som byter typ: passet hanteras först, i samma transaktion.
  IF _shift_id IS NOT NULL THEN
    IF _shift_action NOT IN ('open_shift','cancel_shift') THEN RAISE EXCEPTION 'Välj vad som ska hända med passet'; END IF;
    SELECT * INTO _s FROM public.shifts WHERE id = _shift_id FOR UPDATE;
    IF _s.id IS NULL THEN RAISE EXCEPTION 'Passet finns inte'; END IF;
    IF _s.employee_id IS DISTINCT FROM _employee_id THEN RAISE EXCEPTION 'Passet hör inte till personen'; END IF;
    IF _shift_action = 'open_shift' THEN
      UPDATE public.shifts SET employee_id = NULL, updated_by = auth.uid(), updated_at = now() WHERE id = _shift_id;
    ELSE
      UPDATE public.shifts SET status = 'cancelled', updated_by = auth.uid(), updated_at = now() WHERE id = _shift_id;
    END IF;
  END IF;

  IF _kind = 'absence' THEN
    IF _absence_type_id IS NULL THEN RAISE EXCEPTION 'Välj orsak'; END IF;
    _res := public.admin_register_absence(_employee_id, _absence_type_id, _start_date, _end_date, _extent_pct, _note, _conflict_action);
    RETURN _res || jsonb_build_object('shift_action', _shift_action);
  END IF;

  _end := COALESCE(_end_date, _start_date);
  IF _end < _start_date THEN RAISE EXCEPTION 'Till-datum före från-datum'; END IF;
  IF _end > _start_date + 366 THEN RAISE EXCEPTION 'Perioden är för lång'; END IF;
  IF _from_time >= _to_time THEN RAISE EXCEPTION 'Sluttid måste vara efter starttid'; END IF;
  _d := _start_date;
  WHILE _d <= _end LOOP
    INSERT INTO public.availability (employee_id, date, weekday, from_time, to_time, type, note, created_by)
    VALUES (_employee_id, _d, NULL, _from_time, _to_time, 'otillganglig', NULLIF(_note,''), auth.uid());
    _n := _n + 1; _d := _d + 1;
  END LOOP;

  SELECT array_agg(id) INTO _ids FROM public.shifts
   WHERE employee_id = _employee_id AND status = 'published' AND date BETWEEN _start_date AND _end;
  IF _ids IS NOT NULL AND _conflict_action = 'open_shift' THEN
    UPDATE public.shifts SET employee_id = NULL, updated_by = auth.uid(), updated_at = now() WHERE id = ANY(_ids);
  ELSIF _ids IS NOT NULL AND _conflict_action = 'cancel_shift' THEN
    UPDATE public.shifts SET status = 'cancelled', updated_by = auth.uid(), updated_at = now() WHERE id = ANY(_ids);
  END IF;
  RETURN jsonb_build_object('ok', true, 'days', _n, 'conflicting_shifts', COALESCE(array_length(_ids,1),0),
    'conflict_action', _conflict_action, 'shift_action', _shift_action);
END $$;
REVOKE ALL ON FUNCTION public.admin_schedule_absence(uuid,text,date,date,uuid,numeric,text,time,time,text,uuid,text) FROM public, anon;
GRANT EXECUTE ON FUNCTION public.admin_schedule_absence(uuid,text,date,date,uuid,numeric,text,time,time,text,uuid,text) TO authenticated;