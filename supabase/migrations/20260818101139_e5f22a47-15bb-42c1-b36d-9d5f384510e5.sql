-- 1. Speglingen: butik via kostnadsgrupp -> personens standardkostnadsgrupp -> arbetsplats
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
  SELECT employee_id, default_cost_group INTO v_staff, v_default_cg
    FROM public.pk_staff WHERE url = NEW.staff_url;

  IF v_staff IS NULL OR coalesce(NEW.is_canceled, false) OR coalesce(NEW.is_guest, false) THEN
    DELETE FROM public.staff_shifts WHERE pk_logged_time_id = NEW.id;
    RETURN NEW;
  END IF;

  SELECT store_id INTO v_store FROM public.pk_costgroups
   WHERE url = NEW.costgroup_url OR (NEW.costgroup_url IS NULL AND name = NEW.costgroup_name)
   LIMIT 1;

  IF v_store IS NULL AND v_default_cg IS NOT NULL THEN
    SELECT store_id INTO v_store FROM public.pk_costgroups
     WHERE url = v_default_cg OR name = v_default_cg
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

  -- Personalkollen är källan: den speglade raden skrivs alltid om härifrån
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

-- 2. Vyn "På plats nu": samma fallback-kedja, raden döljs aldrig
CREATE OR REPLACE VIEW public.v_pk_clocked_in_now AS
 WITH today AS (
         SELECT (now() AT TIME ZONE 'Europe/Stockholm'::text)::date AS d
        ), wp AS (
         SELECT p.connection_id, p.url AS work_period_url, p.staff_url, p.staff_name,
            p.workplace_url, p.costgroup_url, p.costgroup_name, p.start, p."end", p.estimated_cost
           FROM pk_work_periods p, today t
          WHERE p.date = t.d AND p.is_published AND NOT p.is_deleted
        ), lt AS (
         SELECT l.* FROM pk_logged_times l, today t
          WHERE NOT l.is_canceled AND l.start IS NOT NULL
            AND ((l.start AT TIME ZONE 'Europe/Stockholm'::text)::date = t.d
                 OR l.stop IS NULL AND l.start > (now() - '24:00:00'::interval))
        ), joined AS (
         SELECT COALESCE(wp.connection_id, lt.connection_id) AS connection_id,
            COALESCE(wp.workplace_url, lt.workplace_url) AS workplace_url,
            COALESCE(lt.costgroup_url, wp.costgroup_url) AS costgroup_url,
            COALESCE(lt.costgroup_name, wp.costgroup_name) AS costgroup_name,
            COALESCE(wp.staff_url, lt.staff_url) AS staff_url,
            wp.work_period_url, lt.url AS logged_time_url,
            wp.start AS scheduled_start, wp."end" AS scheduled_end, wp.estimated_cost,
            lt.real_start, lt.real_stop, lt.stop, lt.start AS logged_start,
            lt.is_guest, lt.guest_name, wp.staff_name
           FROM wp
             FULL JOIN lt ON lt.connection_id = wp.connection_id
              AND (lt.work_period_url = wp.work_period_url
                   OR lt.work_period_url IS NULL AND lt.staff_url = wp.staff_url
                      AND lt.workplace_url = wp.workplace_url)
        )
 SELECT j.connection_id,
    COALESCE(cg.store_id, dcg.store_id, w.store_id) AS store_id,
    s.name AS store_name,
    j.workplace_url,
    w.name AS workplace_name,
    j.costgroup_url,
    j.costgroup_name,
    j.staff_url,
        CASE
            WHEN j.is_guest THEN COALESCE(j.guest_name, 'Gäst'::text)
            ELSE COALESCE(NULLIF(TRIM(BOTH FROM concat(ps.first_name, ' ', ps.last_name)), ''::text), j.staff_name, 'Okänd'::text)
        END AS display_name,
    j.is_guest,
    j.scheduled_start,
    j.scheduled_end,
    j.estimated_cost,
    COALESCE(j.real_start, j.logged_start) AS clocked_in_at,
    COALESCE(j.real_stop, j.stop) AS clocked_out_at,
        CASE
            WHEN j.logged_time_url IS NOT NULL AND j.stop IS NULL THEN 'pa_plats'::text
            WHEN j.logged_time_url IS NOT NULL AND j.stop IS NOT NULL THEN 'avslutad'::text
            WHEN j.work_period_url IS NULL THEN 'oplanerad'::text
            WHEN j.scheduled_start IS NOT NULL AND j.scheduled_start < (now() - '00:10:00'::interval) THEN 'ej_instamplad'::text
            ELSE 'kommer'::text
        END AS status,
        CASE
            WHEN j.stop IS NULL AND j.logged_time_url IS NOT NULL THEN EXTRACT(epoch FROM now() - COALESCE(j.real_start, j.logged_start))::integer
            ELSE NULL::integer
        END AS ongoing_seconds
   FROM joined j
     LEFT JOIN pk_costgroups cg ON cg.connection_id = j.connection_id AND cg.url = j.costgroup_url
     LEFT JOIN pk_staff ps ON ps.connection_id = j.connection_id AND ps.url = j.staff_url
     LEFT JOIN pk_costgroups dcg ON dcg.connection_id = j.connection_id
       AND (dcg.url = ps.default_cost_group OR dcg.name = ps.default_cost_group)
     LEFT JOIN pk_workplaces w ON w.connection_id = j.connection_id AND w.url = j.workplace_url
     LEFT JOIN stores s ON s.id = COALESCE(cg.store_id, dcg.store_id, w.store_id)
  ORDER BY s.name, j.costgroup_name, j.scheduled_start;

-- 3. Automatisk koppling endast på e-post: nollställ namnmatchningarna och ta bort funktionen
UPDATE public.pk_staff p
   SET employee_id = NULL
 WHERE p.employee_id IS NOT NULL
   AND coalesce(p.employee_id_manual, false) = false
   AND NOT EXISTS (
     SELECT 1 FROM public.staff s
      WHERE s.id = p.employee_id
        AND s.email IS NOT NULL AND p.email IS NOT NULL
        AND lower(btrim(s.email)) = lower(btrim(p.email))
   );

DROP FUNCTION IF EXISTS public.pk_match_staff_by_name();