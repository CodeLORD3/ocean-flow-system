CREATE OR REPLACE FUNCTION public.pk_mirror_logged_time()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_staff uuid;
  v_store uuid;
  v_in timestamptz;
  v_out timestamptz;
BEGIN
  SELECT employee_id INTO v_staff FROM public.pk_staff WHERE url = NEW.staff_url;

  IF v_staff IS NULL OR coalesce(NEW.is_canceled, false) OR coalesce(NEW.is_guest, false) THEN
    DELETE FROM public.staff_shifts WHERE pk_logged_time_id = NEW.id;
    RETURN NEW;
  END IF;

  SELECT store_id INTO v_store FROM public.pk_costgroups
   WHERE url = NEW.costgroup_url OR (NEW.costgroup_url IS NULL AND name = NEW.costgroup_name)
   LIMIT 1;

  v_in := coalesce(NEW.real_start, NEW.start);
  v_out := coalesce(NEW.real_stop, NEW.stop);
  IF v_in IS NULL THEN
    RETURN NEW;
  END IF;

  UPDATE public.staff_shifts
     SET staff_id = v_staff,
         store_id = coalesce(v_store, store_id),
         clocked_in_at = v_in,
         clocked_out_at = v_out,
         updated_at = now()
   WHERE pk_logged_time_id = NEW.id;

  IF NOT FOUND THEN
    INSERT INTO public.staff_shifts (staff_id, store_id, clocked_in_at, clocked_out_at, source, pk_logged_time_id)
    VALUES (v_staff, v_store, v_in, v_out, 'personalkollen', NEW.id);
  END IF;

  -- Ta bort manuella stämplingar som överlappar samma person samma dag
  DELETE FROM public.staff_shifts ss
   WHERE ss.source = 'manual'
     AND ss.staff_id = v_staff
     AND (ss.clocked_in_at AT TIME ZONE 'Europe/Stockholm')::date
         = (v_in AT TIME ZONE 'Europe/Stockholm')::date;

  RETURN NEW;
END;
$$;