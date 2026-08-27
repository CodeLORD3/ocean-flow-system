ALTER TABLE public.staff_shifts
  ADD COLUMN IF NOT EXISTS time_entry_in_id uuid REFERENCES public.time_entries(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS time_entry_out_id uuid REFERENCES public.time_entries(id) ON DELETE SET NULL;

CREATE UNIQUE INDEX IF NOT EXISTS staff_shifts_time_entry_in_uniq
  ON public.staff_shifts (time_entry_in_id) WHERE time_entry_in_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS staff_shifts_staff_day_idx
  ON public.staff_shifts (staff_id, clocked_in_at);

-- Bygg om en persons klockpass för en dag (svensk tid) utifrån time_entries.
CREATE OR REPLACE FUNCTION public.staff_shifts_rebuild_from_clock(_employee_id uuid, _day date)
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_staff_id uuid;
  v_rec record;
  v_open record;
  v_count integer := 0;
BEGIN
  SELECT e.staff_id INTO v_staff_id FROM public.employees e WHERE e.id = _employee_id;
  IF v_staff_id IS NULL THEN
    RETURN 0; -- ingen personalkoppling: inget pass kan skapas
  END IF;

  -- Rör bara pass som klockan äger
  DELETE FROM public.staff_shifts
   WHERE staff_id = v_staff_id
     AND source = 'clock'
     AND (clocked_in_at AT TIME ZONE 'Europe/Stockholm')::date = _day;

  v_open := NULL;

  FOR v_rec IN
    SELECT te.id, te.type, te.occurred_at, te.store_id
      FROM public.time_entries te
     WHERE te.employee_id = _employee_id
       AND te.type IN ('in','ut')
       AND COALESCE(te.correction_kind, '') <> 'void'
       AND NOT EXISTS (
             SELECT 1 FROM public.time_entries c
              WHERE c.corrects_entry_id = te.id
           )
       AND (te.occurred_at AT TIME ZONE 'Europe/Stockholm')::date = _day
     ORDER BY te.occurred_at, te.registered_at
  LOOP
    IF v_rec.type = 'in' THEN
      IF v_open.id IS NOT NULL THEN
        -- Två instämplingar i rad: lägg första som öppet pass
        INSERT INTO public.staff_shifts (staff_id, store_id, clocked_in_at, source, time_entry_in_id)
        VALUES (v_staff_id, v_open.store_id, v_open.occurred_at, 'clock', v_open.id);
        v_count := v_count + 1;
      END IF;
      v_open := v_rec;
    ELSE
      IF v_open.id IS NOT NULL THEN
        INSERT INTO public.staff_shifts (staff_id, store_id, clocked_in_at, clocked_out_at, source, time_entry_in_id, time_entry_out_id)
        VALUES (v_staff_id, COALESCE(v_open.store_id, v_rec.store_id), v_open.occurred_at, v_rec.occurred_at, 'clock', v_open.id, v_rec.id);
        v_count := v_count + 1;
        v_open := NULL;
      END IF;
      -- Utstämpling utan instämpling ignoreras (ingen tid kan härledas)
    END IF;
  END LOOP;

  IF v_open.id IS NOT NULL THEN
    INSERT INTO public.staff_shifts (staff_id, store_id, clocked_in_at, source, time_entry_in_id)
    VALUES (v_staff_id, v_open.store_id, v_open.occurred_at, 'clock', v_open.id);
    v_count := v_count + 1;
  END IF;

  RETURN v_count;
END;
$$;

-- Bygg om en hel period för alla personer med stämplingar
CREATE OR REPLACE FUNCTION public.staff_shifts_rebuild_range(_from date, _to date)
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_row record;
  v_total integer := 0;
BEGIN
  FOR v_row IN
    SELECT DISTINCT te.employee_id,
           (te.occurred_at AT TIME ZONE 'Europe/Stockholm')::date AS day
      FROM public.time_entries te
     WHERE te.type IN ('in','ut')
       AND (te.occurred_at AT TIME ZONE 'Europe/Stockholm')::date BETWEEN _from AND _to
  LOOP
    v_total := v_total + public.staff_shifts_rebuild_from_clock(v_row.employee_id, v_row.day);
  END LOOP;
  RETURN v_total;
END;
$$;

-- Automatik: varje stämpling materialiseras direkt
CREATE OR REPLACE FUNCTION public.time_entries_sync_staff_shift()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_day date;
BEGIN
  v_day := (NEW.occurred_at AT TIME ZONE 'Europe/Stockholm')::date;
  PERFORM public.staff_shifts_rebuild_from_clock(NEW.employee_id, v_day);

  IF NEW.corrects_entry_id IS NOT NULL THEN
    SELECT (te.occurred_at AT TIME ZONE 'Europe/Stockholm')::date INTO v_day
      FROM public.time_entries te WHERE te.id = NEW.corrects_entry_id;
    IF v_day IS NOT NULL THEN
      PERFORM public.staff_shifts_rebuild_from_clock(NEW.employee_id, v_day);
    END IF;
  END IF;

  RETURN NULL;
END;
$$;

DROP TRIGGER IF EXISTS trg_time_entries_sync_staff_shift ON public.time_entries;
CREATE TRIGGER trg_time_entries_sync_staff_shift
AFTER INSERT ON public.time_entries
FOR EACH ROW EXECUTE FUNCTION public.time_entries_sync_staff_shift();

REVOKE ALL ON FUNCTION public.staff_shifts_rebuild_from_clock(uuid, date) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.staff_shifts_rebuild_range(date, date) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.staff_shifts_rebuild_from_clock(uuid, date) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.staff_shifts_rebuild_range(date, date) TO authenticated, service_role;