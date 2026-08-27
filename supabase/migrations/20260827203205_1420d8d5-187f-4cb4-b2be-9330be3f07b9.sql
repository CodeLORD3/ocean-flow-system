CREATE OR REPLACE FUNCTION public.staff_shifts_rebuild_from_clock(_employee_id uuid, _day date)
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_staff_id uuid;
  v_rec record;
  v_open_id uuid;
  v_open_at timestamptz;
  v_open_store uuid;
  v_count integer := 0;
BEGIN
  SELECT e.staff_id INTO v_staff_id FROM public.employees e WHERE e.id = _employee_id;
  IF v_staff_id IS NULL THEN
    RETURN 0;
  END IF;

  DELETE FROM public.staff_shifts
   WHERE staff_id = v_staff_id
     AND source = 'clock'
     AND (clocked_in_at AT TIME ZONE 'Europe/Stockholm')::date = _day;

  FOR v_rec IN
    SELECT te.id, te.type, te.occurred_at, te.store_id
      FROM public.time_entries te
     WHERE te.employee_id = _employee_id
       AND te.type IN ('in','ut')
       AND COALESCE(te.correction_kind, '') <> 'void'
       AND NOT EXISTS (SELECT 1 FROM public.time_entries c WHERE c.corrects_entry_id = te.id)
       AND (te.occurred_at AT TIME ZONE 'Europe/Stockholm')::date = _day
     ORDER BY te.occurred_at, te.registered_at
  LOOP
    IF v_rec.type = 'in' THEN
      IF v_open_id IS NOT NULL THEN
        INSERT INTO public.staff_shifts (staff_id, store_id, clocked_in_at, source, time_entry_in_id)
        VALUES (v_staff_id, v_open_store, v_open_at, 'clock', v_open_id);
        v_count := v_count + 1;
      END IF;
      v_open_id := v_rec.id; v_open_at := v_rec.occurred_at; v_open_store := v_rec.store_id;
    ELSE
      IF v_open_id IS NOT NULL THEN
        INSERT INTO public.staff_shifts (staff_id, store_id, clocked_in_at, clocked_out_at, source, time_entry_in_id, time_entry_out_id)
        VALUES (v_staff_id, COALESCE(v_open_store, v_rec.store_id), v_open_at, v_rec.occurred_at, 'clock', v_open_id, v_rec.id);
        v_count := v_count + 1;
        v_open_id := NULL; v_open_at := NULL; v_open_store := NULL;
      END IF;
    END IF;
  END LOOP;

  IF v_open_id IS NOT NULL THEN
    INSERT INTO public.staff_shifts (staff_id, store_id, clocked_in_at, source, time_entry_in_id)
    VALUES (v_staff_id, v_open_store, v_open_at, 'clock', v_open_id);
    v_count := v_count + 1;
  END IF;

  RETURN v_count;
END;
$$;