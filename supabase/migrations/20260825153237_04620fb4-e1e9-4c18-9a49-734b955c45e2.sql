CREATE INDEX IF NOT EXISTS pk_staff_employee_id_idx ON public.pk_staff(employee_id);

CREATE OR REPLACE FUNCTION public.service_set_employee_pnr(_employee_id uuid, _pnr text)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, extensions
AS $$
DECLARE
  norm text := public.normalize_pnr(_pnr);
  key text;
BEGIN
  IF norm IS NULL THEN
    RAISE EXCEPTION 'Personnummer måste vara 10 eller 12 siffror';
  END IF;

  key := public.employee_pnr_key();
  IF key IS NULL THEN
    RAISE EXCEPTION 'Krypteringsnyckel saknas i valvet (employee_pnr_key)';
  END IF;

  UPDATE public.employees SET
    pnr_encrypted = extensions.pgp_sym_encrypt(norm, key),
    pnr_hash      = public.pnr_hash(norm),
    pnr_last4     = right(norm, 4),
    pnr_masked    = substr(norm, 1, 6) || '-****',
    birth_date    = coalesce(
      birth_date,
      CASE
        WHEN substr(norm, 1, 2)::int <= ((extract(year from current_date)::int % 100) + 1)
          THEN to_date('20' || substr(norm, 1, 6), 'YYYYMMDD')
        ELSE to_date('19' || substr(norm, 1, 6), 'YYYYMMDD')
      END
    ),
    updated_at    = now()
  WHERE id = _employee_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Personen finns inte';
  END IF;
END;
$$;

REVOKE ALL ON FUNCTION public.service_set_employee_pnr(uuid, text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.service_set_employee_pnr(uuid, text) TO service_role;

CREATE OR REPLACE FUNCTION public.pk_mirror_logged_time()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_staff uuid;
  v_store uuid;
  v_default_cg text;
  v_in timestamptz;
  v_out timestamptz;
BEGIN
  SELECT coalesce(e.staff_id, ps.employee_id), ps.default_cost_group
    INTO v_staff, v_default_cg
    FROM public.pk_staff ps
    LEFT JOIN public.employees e ON e.id = ps.employee_id
   WHERE ps.url = NEW.staff_url;

  IF v_staff IS NULL OR coalesce(NEW.is_canceled, false) OR coalesce(NEW.is_guest, false) THEN
    DELETE FROM public.staff_shifts WHERE pk_logged_time_id = NEW.id;
    RETURN NEW;
  END IF;

  SELECT store_id INTO v_store FROM public.pk_costgroups
   WHERE url = NEW.costgroup_url OR (NEW.costgroup_url IS NULL AND name = NEW.costgroup_name)
   LIMIT 1;

  IF v_store IS NULL AND v_default_cg IS NOT NULL THEN
    SELECT store_id INTO v_store FROM public.pk_costgroups
     WHERE url = v_default_cg OR name = v_default_cg OR short_identifier::text = v_default_cg
     LIMIT 1;
  END IF;

  IF v_store IS NULL THEN
    SELECT store_id INTO v_store FROM public.pk_workplaces
     WHERE connection_id = NEW.connection_id AND url = NEW.workplace_url
     LIMIT 1;
  END IF;

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

  DELETE FROM public.staff_shifts ss
   WHERE ss.source = 'manual'
     AND ss.staff_id = v_staff
     AND (ss.clocked_in_at AT TIME ZONE 'Europe/Stockholm')::date
         = (v_in AT TIME ZONE 'Europe/Stockholm')::date;

  RETURN NEW;
END;
$function$;