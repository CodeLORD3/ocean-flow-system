-- Etapp 4 UI: serverstyrda frisk- och ångraflöden för sjukperioder.
-- Additiv migration: påverkar inte befintliga tabeller eller historik.
CREATE OR REPLACE FUNCTION public.undo_sick_period(_employee_id uuid, _first_day date)
RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE _row public.sick_periods;
BEGIN
  IF NOT (public.employee_is_self(_employee_id) OR public.can_see_employee(_employee_id)
          OR public.has_role(auth.uid(), 'admin') OR public.is_platform_admin(auth.uid())) THEN
    RAISE EXCEPTION 'Behörighet saknas';
  END IF;
  DELETE FROM public.sick_periods
   WHERE employee_id = _employee_id
     AND first_day = _first_day
     AND last_day IS NULL
     AND created_at >= now() - interval '10 minutes'
  RETURNING * INTO _row;
  IF _row.id IS NULL THEN
    RAISE EXCEPTION 'Ångertiden har gått ut eller perioden är redan avslutad';
  END IF;
  RETURN jsonb_build_object('ok', true, 'period_id', _row.id);
END; $$;
REVOKE ALL ON FUNCTION public.undo_sick_period(uuid, date) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.undo_sick_period(uuid, date) TO authenticated, service_role;

CREATE OR REPLACE FUNCTION public.end_sick_period(_employee_id uuid, _last_day date DEFAULT NULL)
RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE _row public.sick_periods;
BEGIN
  IF NOT (public.employee_is_self(_employee_id) OR public.can_see_employee(_employee_id)
          OR public.has_role(auth.uid(), 'admin') OR public.is_platform_admin(auth.uid())) THEN
    RAISE EXCEPTION 'Behörighet saknas';
  END IF;
  UPDATE public.sick_periods
     SET last_day = COALESCE(_last_day, current_date), updated_at = now()
   WHERE id = (
     SELECT id FROM public.sick_periods
      WHERE employee_id = _employee_id AND last_day IS NULL
      ORDER BY first_day DESC LIMIT 1
   )
  RETURNING * INTO _row;
  IF _row.id IS NULL THEN
    RAISE EXCEPTION 'Ingen pågående sjukperiod hittades';
  END IF;
  RETURN jsonb_build_object('ok', true, 'period_id', _row.id, 'last_day', _row.last_day);
END; $$;
REVOKE ALL ON FUNCTION public.end_sick_period(uuid, date) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.end_sick_period(uuid, date) TO authenticated, service_role;
