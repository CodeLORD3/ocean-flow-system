ALTER TABLE public.staff_shifts
  ADD COLUMN IF NOT EXISTS source text NOT NULL DEFAULT 'manual',
  ADD COLUMN IF NOT EXISTS pk_logged_time_id uuid;

CREATE UNIQUE INDEX IF NOT EXISTS staff_shifts_pk_logged_time_key
  ON public.staff_shifts (pk_logged_time_id) WHERE pk_logged_time_id IS NOT NULL;

-- Namnmatchning av Personalkollen-personal mot personalkort
CREATE OR REPLACE FUNCTION public.pk_match_staff_by_name()
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  n integer := 0;
BEGIN
  WITH cand AS (
    SELECT p.id AS pk_id, s.id AS staff_id,
           row_number() OVER (PARTITION BY p.id ORDER BY s.created_at) AS rn
    FROM public.pk_staff p
    JOIN public.staff s
      ON lower(btrim(s.first_name)) = lower(btrim(p.first_name))
     AND lower(btrim(s.last_name)) = lower(btrim(p.last_name))
    WHERE p.employee_id IS NULL
      AND coalesce(p.employee_id_manual, false) = false
      AND p.first_name IS NOT NULL AND p.last_name IS NOT NULL
  )
  UPDATE public.pk_staff p
     SET employee_id = c.staff_id
    FROM cand c
   WHERE c.pk_id = p.id AND c.rn = 1;
  GET DIAGNOSTICS n = ROW_COUNT;
  RETURN n;
END;
$$;

-- Spegla Personalkollens stämplingar till staff_shifts
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

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS pk_logged_times_mirror ON public.pk_logged_times;
CREATE TRIGGER pk_logged_times_mirror
AFTER INSERT OR UPDATE ON public.pk_logged_times
FOR EACH ROW EXECUTE FUNCTION public.pk_mirror_logged_time();

-- Spegla om när en Personalkollen-person kopplas till ett personalkort
CREATE OR REPLACE FUNCTION public.pk_staff_link_resync()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NEW.employee_id IS DISTINCT FROM OLD.employee_id THEN
    UPDATE public.pk_logged_times SET last_synced_at = now() WHERE staff_url = NEW.url;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS pk_staff_link_resync_trg ON public.pk_staff;
CREATE TRIGGER pk_staff_link_resync_trg
AFTER UPDATE OF employee_id ON public.pk_staff
FOR EACH ROW EXECUTE FUNCTION public.pk_staff_link_resync();

-- Spegla om när en kostnadsgrupp mappas till butik
CREATE OR REPLACE FUNCTION public.pk_costgroup_store_resync()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NEW.store_id IS DISTINCT FROM OLD.store_id THEN
    UPDATE public.staff_shifts ss
       SET store_id = NEW.store_id, updated_at = now()
      FROM public.pk_logged_times lt
     WHERE ss.pk_logged_time_id = lt.id
       AND (lt.costgroup_url = NEW.url OR lt.costgroup_name = NEW.name);
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS pk_costgroups_store_resync_trg ON public.pk_costgroups;
CREATE TRIGGER pk_costgroups_store_resync_trg
AFTER UPDATE OF store_id ON public.pk_costgroups
FOR EACH ROW EXECUTE FUNCTION public.pk_costgroup_store_resync();